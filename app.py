import os
import time
import json
import queue
import threading
from flask import Flask, render_template, request, jsonify, Response, send_from_directory
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# ── Global state ───────────────────────────────────────────────
log_queue        = queue.Queue()
automation_running = False
automation_thread  = None
chrome_driver      = None          # persistent driver reused across verify → run
verify_lock        = threading.Lock()

current_config = {
    "excel_file":             "ids.xlsx",
    "column_name":            "ID",
    "login_url":              "https://dev.slp.sji3.net/dashboard/MjA3OTg3/floorplan/outdoor-linkway%2C%20dop?update=true",
    "search_bar_selector":    "input.search-field",
    "search_button_selector": ".fa-magnifying-glass",
    "result_item_selector":   ".search-item",
    "canvas_selector":        "div.konvajs-content canvas",
    "adjust_x":               6,
    "adjust_y":               6,
    "debugger_address":       "127.0.0.1:9222",
}

# ── Helpers ────────────────────────────────────────────────────
def send_log(message, level="info"):
    log_queue.put({"message": message, "level": level,
                   "timestamp": time.strftime("%H:%M:%S")})


def _get_driver(debugger_address):
    """Connect (or re-connect) to the remote Chrome instance."""
    from selenium import webdriver
    from selenium.webdriver.chrome.service import Service
    from webdriver_manager.chrome import ChromeDriverManager

    service = Service(ChromeDriverManager().install())
    options = webdriver.ChromeOptions()
    options.add_experimental_option("debuggerAddress", debugger_address)
    driver = webdriver.Chrome(service=service, options=options)
    return driver


# ── Automation core ────────────────────────────────────────────
def run_automation(config):
    global automation_running, chrome_driver

    automation_running = True
    try:
        import pandas as pd
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC
        from selenium.webdriver.common.keys import Keys

        excel_file             = config.get("excel_file",             "ids.xlsx")
        column_name            = config.get("column_name",            "ID")
        search_bar_selector    = config.get("search_bar_selector",    "input.search-field")
        search_button_selector = config.get("search_button_selector", ".fa-magnifying-glass")
        result_item_selector   = config.get("result_item_selector",   ".search-item")
        adjust_x               = float(config.get("adjust_x", 6))
        adjust_y               = float(config.get("adjust_y", 6))

        # ── Read Excel ──────────────────────────────────────────
        send_log(f"📂 Reading asset list from {os.path.basename(excel_file)}…", "info")
        try:
            file_path = (
                os.path.join(app.config['UPLOAD_FOLDER'], excel_file)
                if not os.path.isabs(excel_file) else excel_file
            )
            if not os.path.exists(file_path):
                file_path = excel_file
            df = pd.read_excel(file_path)
            if column_name not in df.columns:
                send_log(f"❌ Column '{column_name}' not found. Available: {df.columns.tolist()}", "error")
                return
            ids_data = []
            for _, row in df.iterrows():
                if pd.notna(row[column_name]):
                    ids_data.append({
                        'id': str(row[column_name]),
                        'x':  float(row['X']) if 'X' in df.columns and pd.notna(row['X']) else 0,
                        'y':  float(row['Y']) if 'Y' in df.columns and pd.notna(row['Y']) else 0,
                    })
            send_log(f"✅ Loaded {len(ids_data)} IDs with coordinates.", "success")
        except Exception as e:
            send_log(f"❌ Error reading Excel file: {e}", "error")
            return

        # ── Reuse driver from verify step ───────────────────────
        driver = chrome_driver
        if driver is None:
            send_log("❌ No active Chrome session. Please run 'Verify Page' first.", "error")
            return

        # ── Confirm driver is still alive ───────────────────────
        try:
            _ = driver.current_url
            send_log(f"🌐 Using existing Chrome session — {driver.current_url[:60]}…", "info")
        except Exception:
            send_log("❌ Chrome session lost. Please re-run 'Verify Page'.", "error")
            chrome_driver = None
            return

        # ── Automation loop ─────────────────────────────────────
        send_log(f"🚀 Starting annotation for {len(ids_data)} assets…", "info")
        success_count = 0
        fail_count    = 0

        for i, item in enumerate(ids_data):
            if not automation_running:
                send_log("⛔ Automation stopped by user.", "warning")
                break

            item_id  = item['id']
            target_x = item['x'] + adjust_x
            target_y = item['y'] + adjust_y

            try:
                send_log(f"[{i+1}/{len(ids_data)}] Processing: {item_id} → ({item['x']}, {item['y']})", "info")
                wait = WebDriverWait(driver, 10)

                # Clear & type into search bar
                search_input = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, search_bar_selector)))
                search_input.send_keys(Keys.CONTROL + "a")
                search_input.send_keys(Keys.BACKSPACE)
                time.sleep(0.4)
                search_input.send_keys(item_id)
                time.sleep(1)

                # Click search button
                search_btn = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, search_button_selector)))
                search_btn.click()

                try:
                    # Select first result
                    first_result = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, result_item_selector)))
                    first_result.click()
                    send_log(f"  ✓ Selected result for: {item_id}", "success")
                    time.sleep(1.5)

                    # Precise Konva.js positioning + robust ID resolution
                    move_script = """
                    const stage = Konva.stages[0];
                    if (!stage) return "Stage not found";

                    const nodes = stage.find('Image, Circle, Group');
                    if (nodes.length === 0) return "No nodes found on canvas";

                    const node = nodes[nodes.length - 1];

                    // Try every common attribute Konva apps use for the asset identifier
                    const nodeId =
                        node.id()                  ||
                        node.name()                ||
                        node.attrs.assetId         ||
                        node.attrs.asset_id        ||
                        node.attrs.itemId          ||
                        node.attrs.data_id         ||
                        node.attrs.nodeId          ||
                        node.attrs._id             ||
                        node.attrs.label           ||
                        (node.parent && node.parent.attrs && node.parent.attrs.id
                            ? '(parent) ' + node.parent.attrs.id : null) ||
                        'Node #' + (nodes.length - 1);

                    node.position({ x: arguments[0], y: arguments[1] });
                    node.fire('dragend', { target: node }, true);
                    stage.batchDraw();

                    return "Moved: " + nodeId;
                    """
                    result = driver.execute_script(move_script, target_x, target_y)
                    send_log(f"  📍 Konva: {result}", "success")
                    success_count += 1

                except Exception as inner_err:
                    send_log(f"  ⚠️ Could not process {item_id}: {str(inner_err)[:80]}", "warning")
                    fail_count += 1

                time.sleep(2)

            except Exception as e:
                send_log(f"  ❌ Error for {item_id}: {type(e).__name__}", "error")
                fail_count += 1

        send_log(f"🏁 Done! ✅ {success_count} succeeded  ❌ {fail_count} failed.", "success")

    except ImportError as e:
        send_log(f"❌ Missing dependency: {e}", "error")
    except Exception as e:
        send_log(f"❌ Unexpected error: {e}", "error")
    finally:
        automation_running = False
        send_log("__DONE__", "done")


# ── Routes ─────────────────────────────────────────────────────
@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/config', methods=['GET'])
def get_config():
    return jsonify(current_config)


@app.route('/api/config', methods=['POST'])
def save_config():
    global current_config
    current_config.update(request.json or {})
    return jsonify({"status": "ok", "config": current_config})


@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400
    file = request.files['file']
    if not file.filename:
        return jsonify({"error": "No file selected"}), 400
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ('.xlsx', '.xls', '.csv'):
        return jsonify({"error": "Invalid file type. Use .xlsx, .xls, or .csv"}), 400

    filename = secure_filename(file.filename)
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)
    try:
        import pandas as pd
        df = pd.read_excel(filepath)
        return jsonify({"status": "ok", "filename": filename,
                        "columns": df.columns.tolist(), "rows": len(df)})
    except Exception as e:
        return jsonify({"status": "ok", "filename": filename, "error": str(e)})


# ── NEW: Verify endpoint ───────────────────────────────────────
@app.route('/api/verify', methods=['POST'])
def verify_page():
    """
    Connect to Chrome, navigate to the floorplan URL, and probe for the
    search bar.  The driver is kept alive so run_automation can reuse it.
    """
    global chrome_driver, current_config

    with verify_lock:
        data   = request.json or {}
        config = {**current_config, **data}
        current_config.update(data)

        debugger_address    = config.get("debugger_address",    "127.0.0.1:9222")
        login_url           = config.get("login_url",           "")
        search_bar_selector = config.get("search_bar_selector", "input.search-field")

        # ── 1. Connect ──────────────────────────────────────────
        try:
            driver = _get_driver(debugger_address)
        except Exception as e:
            return jsonify({
                "status":  "error",
                "step":    "connect",
                "message": f"Could not connect to Chrome: {e}. "
                           f"Make sure Chrome is running with --remote-debugging-port=9222",
            }), 500

        # ── 2. Navigate ─────────────────────────────────────────
        try:
            if driver.current_url.rstrip('/') != login_url.rstrip('/'):
                driver.get(login_url)
                
                # ── Dynamic Wait for Search Bar ─────────────────────
                from selenium.webdriver.common.by import By
                max_wait = 10  # 10 seconds total
                found_bar = False
                for _ in range(max_wait * 2):
                    try:
                        if driver.find_elements(By.CSS_SELECTOR, search_bar_selector):
                            found_bar = True
                            break
                    except: pass
                    time.sleep(0.5)
        except Exception as e:
            return jsonify({
                "status":  "error",
                "step":    "navigate",
                "message": f"Navigation failed: {e}",
            }), 500

        # ── 3. Probe for search bar ─────────────────────────────
        search_bar_found = False
        try:
            from selenium.webdriver.common.by import By
            elements = driver.find_elements(By.CSS_SELECTOR, search_bar_selector)
            search_bar_found = len(elements) > 0
        except Exception:
            pass

        # Store the live driver for reuse
        chrome_driver = driver
        page_title    = driver.title or "Unknown page"
        current_url   = driver.current_url

        return jsonify({
            "status":           "ok",
            "page_title":       page_title,
            "current_url":      current_url,
            "search_bar_found": search_bar_found,
        })


@app.route('/api/start', methods=['POST'])
def start_automation():
    global automation_running, automation_thread, current_config

    if automation_running:
        return jsonify({"error": "Automation already running"}), 400

    data   = request.json or {}
    config = {**current_config, **data}

    # Resolve excel path
    excel_name  = config.get("excel_file", "ids.xlsx")
    upload_path = os.path.join(app.config['UPLOAD_FOLDER'], excel_name)
    if os.path.exists(upload_path):
        config["excel_file"] = upload_path

    automation_thread = threading.Thread(target=run_automation, args=(config,), daemon=True)
    automation_thread.start()
    return jsonify({"status": "started"})


@app.route('/api/stop', methods=['POST'])
def stop_automation():
    global automation_running
    automation_running = False
    return jsonify({"status": "stopped"})


@app.route('/api/status', methods=['GET'])
def get_status():
    return jsonify({
        "running":       automation_running,
        "driver_active": chrome_driver is not None,
    })


@app.route('/api/stream')
def stream_logs():
    def generate():
        while True:
            try:
                item = log_queue.get(timeout=30)
                yield f"data: {json.dumps(item)}\n\n"
                if item.get("level") == "done":
                    break
            except queue.Empty:
                yield f"data: {json.dumps({'message': '__ping__', 'level': 'ping'})}\n\n"
    return Response(generate(), mimetype='text/event-stream',
                    headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})


@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)


# ── Extractor feature ──────────────────────────────────────────
@app.route('/extract')
def extract_page():
    return render_template('extract.html')


@app.route('/api/extract-assets', methods=['POST'])
def extract_assets():
    """
    Connect to Chrome (or reuse existing session), navigate to the given URL,
    then run a Konva.js script to collect every placed asset's position.
    """
    global chrome_driver, current_config

    data   = request.json or {}
    config = {**current_config, **data}
    current_config.update({k: v for k, v in data.items() if v})

    extract_url      = config.get("extract_url") or config.get("login_url", "")
    debugger_address = config.get("debugger_address", "127.0.0.1:9222")

    # ── 1. Connect ──────────────────────────────────────────────
    try:
        driver = _get_driver(debugger_address)
        chrome_driver = driver
    except Exception as e:
        return jsonify({"status": "error", "step": "connect",
                        "message": f"Could not connect to Chrome: {e}"}), 500

    # ── 2. Navigate (Only if needed) ────────────────────────────
    try:
        current_url = driver.current_url.rstrip('/')
        target_url  = extract_url.rstrip('/')
        
        if current_url != target_url and target_url:
            driver.get(extract_url)
            
            # ── 2a. Dynamic Wait for Konva and Stage ────────────────
            # Instead of a hard sleep, we poll to see when the page is ready
            max_retries = 20  # 10 seconds total (20 * 0.5s)
            found_ready = False
            
            for i in range(max_retries):
                # Small probe script
                probe = driver.execute_script("return (typeof Konva !== 'undefined' && Konva.stages && Konva.stages.length > 0);")
                if probe:
                    found_ready = True
                    break
                time.sleep(0.5)
            
            if not found_ready:
                # One last short sleep as a safety buffer
                time.sleep(2)
    except Exception as e:
        return jsonify({"status": "error", "step": "navigate",
                        "message": f"Navigation failed: {e}"}), 500

    # ── 3. Extract Konva nodes ──────────────────────────────────
    extract_script = """
    try {
        // Robust Konva Check
        if (typeof Konva === 'undefined') {
            return {error: 'Konva.js not detected on this page. Wait for load or check if it is encapsulated.'};
        }
        
        // Find the stage — try stages array first, then Konva instance if available
        let stage = null;
        if (Konva.stages && Konva.stages.length > 0) {
            stage = Konva.stages[0];
        } else {
            // Some apps might have it elsewhere, but Konva.stages is the standard
            return {error: 'Konva detected, but no Stage found. Try zooming/panning in the browser first.'};
        }

        const results = [];
        const seen    = new Set();

        // Search for all visual nodes
        stage.find('Image, Circle, Rect, Group, Path').forEach(function(node, i) {
            const pos  = node.getAbsolutePosition();
            const x    = Math.round(pos.x);
            const y    = Math.round(pos.y);

            // Skip background panels (usually huge nodes)
            const w = node.width  ? node.width()  : 0;
            const h = node.height ? node.height()  : 0;
            if (w > 2500 || h > 2500) return;

            // Deduplicate by position to avoid double-counting overlaid groups/nodes
            const key = x + ',' + y;
            if (seen.has(key)) return;
            seen.add(key);

            // Best-effort ID resolution
            const nodeId =
                node.id()                  ||
                node.name()                ||
                node.attrs.assetId         ||
                node.attrs.asset_id        ||
                node.attrs.itemId          ||
                node.attrs.nodeId          ||
                node.attrs._id             ||
                node.attrs.label           ||
                '';

            results.push({
                index:  results.length + 1,
                id:     nodeId,
                type:   node.getClassName(),
                x:      x,
                y:      y,
                width:  w ? Math.round(w) : null,
                height: h ? Math.round(h) : null
            });
        });

        return {
            status:     'ok',
            page_title: document.title,
            count:      results.length,
            assets:     results
        };
    } catch(e) {
        return {error: 'Script Error: ' + e.toString()};
    }
    """
    try:
        result = driver.execute_script(extract_script)
        if not result:
            return jsonify({"status": "error", "message": "Script returned nothing"}), 500
        if "error" in result:
            return jsonify({"status": "error", "message": result["error"]}), 500
        return jsonify(result)
    except Exception as e:
        return jsonify({"status": "error", "message": f"Script execution failed: {e}"}), 500


@app.route('/api/download-extracted', methods=['POST'])
def download_extracted():
    """Convert extracted asset list to Excel and stream it back."""
    try:
        import pandas as pd
        import io
        data   = request.json or {}
        assets = data.get("assets", [])
        if not assets:
            return jsonify({"error": "No assets to export"}), 400

        df = pd.DataFrame(assets)
        # Reorder columns nicely
        cols = [c for c in ['index', 'id', 'type', 'x', 'y', 'width', 'height'] if c in df.columns]
        df   = df[cols]

        buf = io.BytesIO()
        with pd.ExcelWriter(buf, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Extracted Assets')
        buf.seek(0)

        from flask import send_file
        return send_file(
            buf,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name='extracted_assets.xlsx'
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5000, threaded=True)
