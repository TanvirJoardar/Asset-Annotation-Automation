import { useState, useEffect, useRef, useCallback } from 'react';
import { api, createLogStream } from '../api';
import { useToast } from '../hooks/useToast';

export default function Annotate() {
  const toast = useToast();

  const [config, setConfig] = useState({
    login_url: '', column_name: 'ID', debugger_address: '127.0.0.1:9222',
    search_bar_selector: 'input.search-field', search_button_selector: '.fa-magnifying-glass',
    result_item_selector: '.search-item', canvas_selector: 'div.konvajs-content canvas',
    adjust_x: 6, adjust_y: 6,
  });

  const [fileInfo, setFileInfo] = useState(null);
  const [fileUploaded, setFileUploaded] = useState(false);
  const [pageVerified, setPageVerified] = useState(false);

  const [verifyPhase, setVerifyPhase] = useState('idle');
  const [verifyResult, setVerifyResult] = useState(null);

  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({ success: 0, failed: 0, elapsed: '0s' });
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const eventSourceRef = useRef(null);
  const startTimeRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    api.getConfig().then((cfg) => {
      setConfig((prev) => ({ ...prev, ...cfg }));
    });
  }, []);

  const getFormConfig = useCallback(() => ({
    login_url: config.login_url,
    column_name: config.column_name,
    debugger_address: config.debugger_address,
    search_bar_selector: config.search_bar_selector,
    search_button_selector: config.search_button_selector,
    result_item_selector: config.result_item_selector,
    canvas_selector: config.canvas_selector,
    adjust_x: parseFloat(config.adjust_x) || 6,
    adjust_y: parseFloat(config.adjust_y) || 6,
  }), [config]);

  const updateConfig = (field, value) => setConfig((prev) => ({ ...prev, [field]: value }));

  const saveConfig = async () => {
    await api.saveConfig(getFormConfig());
    toast('Configuration saved!', 'success', 'fa-check-circle');
  };

  const handleFileUpload = async (file) => {
    const data = await api.uploadFile(file);
    if (data.error) { toast(data.error, 'error', 'fa-triangle-exclamation'); return; }
    setFileInfo(data);
    setFileUploaded(true);
    await api.saveConfig({ ...getFormConfig(), excel_file: data.filename });
    toast(`Loaded ${data.filename} — ${data.rows} assets`, 'success', 'fa-table');
  };

  const verifyPage = async () => {
    setVerifyPhase('loading');
    const cfg = getFormConfig();
    await api.saveConfig(cfg);

    try {
      const data = await api.verify(cfg);
      setVerifyResult(data);
      if (data.status === 'error') {
        setVerifyPhase('error');
        toast('Connection failed — check Chrome debugger', 'error', 'fa-plug');
        return;
      }
      setVerifyPhase('done');
      if (data.search_bar_found) {
        toast('Page verified automatically!', 'success', 'fa-shield-halved');
      } else {
        toast('Page loaded — confirm search bar manually', 'info', 'fa-eye');
      }
    } catch {
      setVerifyPhase('error');
      toast('Server error during verify', 'error', 'fa-triangle-exclamation');
    }
  };

  const confirmPage = (yes) => {
    if (yes) {
      setPageVerified(true);
      if (fileUploaded) {
        toast('All set! Ready to annotate.', 'success', 'fa-lock-open');
      } else {
        toast('Page verified — upload your Excel file to start.', 'info', 'fa-file-excel');
      }
    } else {
      setVerifyPhase('idle');
      setVerifyResult(null);
      toast('Please reload Chrome and retry.', 'info', 'fa-rotate');
    }
  };

  const resetVerify = () => {
    setPageVerified(false);
    setVerifyPhase('idle');
    setVerifyResult(null);
  };

  const isReady = fileUploaded && pageVerified;

  const startAutomation = async () => {
    if (!isReady) return;
    const cfg = getFormConfig();
    await api.saveConfig(cfg);
    const data = await api.start(cfg);
    if (data.error) { toast(data.error, 'error', 'fa-triangle-exclamation'); return; }

    setRunning(true);
    setStats({ success: 0, failed: 0, elapsed: '0s' });
    setProgress({ current: 0, total: 0 });
    setLogs([]);
    startTimeRef.current = Date.now();

    timerRef.current = setInterval(() => {
      const secs = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      setStats((p) => ({ ...p, elapsed: m > 0 ? `${m}m ${s}s` : `${s}s` }));
    }, 1000);

    const headerDot = document.getElementById('statusDot');
    const headerLabel = document.getElementById('statusLabel');
    if (headerDot) headerDot.className = 'status-dot running';
    if (headerLabel) headerLabel.textContent = 'Running';

    eventSourceRef.current = createLogStream(
      (item) => {
        setLogs((prev) => [...prev, item]);
        parseLogStats(item.message);
      },
      () => {
        stopTimer();
        setRunning(false);
        if (headerDot) { headerDot.className = 'status-dot done'; }
        if (headerLabel) { headerLabel.textContent = 'Completed'; }
        toast('Automation completed!', 'success', 'fa-flag-checkered');
      },
      () => {
        setLogs((prev) => [...prev, { message: 'Log stream disconnected.', level: 'warning', timestamp: fmt() }]);
      }
    );
  };

  const stopAutomation = async () => {
    await api.stop();
    toast('Stop signal sent…', 'info', 'fa-stop');
  };

  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  useEffect(() => () => { stopTimer(); eventSourceRef.current?.close(); }, []);

  const parseLogStats = (msg) => {
    const doneMatch = msg.match(/✅\s*(\d+)\s*succeeded.*❌\s*(\d+)\s*failed/);
    if (doneMatch) {
      setStats((p) => ({ ...p, success: parseInt(doneMatch[1]), failed: parseInt(doneMatch[2]) }));
      return;
    }
    if (/📍 Konva:/.test(msg)) setStats((p) => ({ ...p, success: p.success + 1 }));
    if (/⚠️ Could not process|❌ Error for/.test(msg)) setStats((p) => ({ ...p, failed: p.failed + 1 }));

    const match = msg.match(/\[(\d+)\/(\d+)\]/);
    if (match) {
      const cur = parseInt(match[1]);
      const tot = parseInt(match[2]);
      setProgress({ current: cur, total: tot });
    }
  };

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  const clearLogs = () => setLogs([]);
  const downloadLogs = () => {
    if (!logs.length) { toast('No logs to download', 'info', 'fa-info-circle'); return; }
    const text = logs.map((l) => `[${l.timestamp}] ${l.message}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: `assetbot-${Date.now()}.txt` });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {/* Step 1: Upload */}
      <section className="card">
        <div className="card-header">
          <div className="step-badge">01</div>
          <div>
            <h2 className="card-title">Upload Asset List</h2>
            <p className="card-subtitle">Upload your Excel file with ID, X, Y coordinates</p>
          </div>
          <div className="card-icon"><i className="fa-solid fa-file-excel" /></div>
        </div>
        <DropZone onUpload={handleFileUpload} />
        {fileInfo && (
          <div className="file-info">
            <div className="file-info-icon"><i className="fa-solid fa-table" /></div>
            <div className="file-info-details">
              <span className="file-info-name">{fileInfo.filename}</span>
              <span className="file-info-meta">
                {fileInfo.rows != null ? `${fileInfo.rows} rows · ${(fileInfo.columns || []).length} columns` : 'File uploaded'}
              </span>
            </div>
            <div className="file-info-columns">
              {(fileInfo.columns || []).map((c) => (
                <span key={c} className={`col-tag${['ID', 'X', 'Y'].includes(c) || c === config.column_name ? ' highlight' : ''}`}>
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Step 2: Config */}
      <section className="card">
        <div className="card-header">
          <div className="step-badge">02</div>
          <div>
            <h2 className="card-title">Configuration</h2>
            <p className="card-subtitle">Set selectors, URL and connection settings</p>
          </div>
          <div className="card-icon"><i className="fa-solid fa-sliders" /></div>
        </div>
        <div className="config-grid">
          <ConfigField label="Floorplan URL" icon="fa-link" full value={config.login_url} onChange={(v) => updateConfig('login_url', v)} placeholder="https://your-dashboard-url.com/floorplan/..." />
          <ConfigField label="ID Column Name" icon="fa-table-columns" value={config.column_name} onChange={(v) => updateConfig('column_name', v)} placeholder="ID" />
          <ConfigField label="Chrome Debugger" icon="fa-plug" value={config.debugger_address} onChange={(v) => updateConfig('debugger_address', v)} placeholder="127.0.0.1:9222" />
          <ConfigField label="Search Bar Selector" icon="fa-magnifying-glass" mono value={config.search_bar_selector} onChange={(v) => updateConfig('search_bar_selector', v)} placeholder="input.search-field" />
          <ConfigField label="Search Button Selector" icon="fa-computer-mouse" mono value={config.search_button_selector} onChange={(v) => updateConfig('search_button_selector', v)} placeholder=".fa-magnifying-glass" />
          <ConfigField label="Result Item Selector" icon="fa-list" mono value={config.result_item_selector} onChange={(v) => updateConfig('result_item_selector', v)} placeholder=".search-item" />
          <ConfigField label="Canvas Selector" icon="fa-layer-group" mono value={config.canvas_selector} onChange={(v) => updateConfig('canvas_selector', v)} placeholder="div.konvajs-content canvas" />
          <ConfigField label="Adjust X" icon="fa-left-right" type="number" value={config.adjust_x} onChange={(v) => updateConfig('adjust_x', v)} placeholder="6" />
          <ConfigField label="Adjust Y" icon="fa-up-down" type="number" value={config.adjust_y} onChange={(v) => updateConfig('adjust_y', v)} placeholder="6" />
        </div>
        <div className="config-actions">
          <button className="btn btn-secondary" onClick={saveConfig}>
            <i className="fa-solid fa-floppy-disk" /> Save Config
          </button>
          <div className="chrome-hint">
            <i className="fa-brands fa-chrome" />
            Start Chrome with: <code>chrome.exe --remote-debugging-port=9222</code>
          </div>
        </div>
      </section>

      {/* Step 3: Verify */}
      <section className="card">
        <div className="card-header">
          <div className="step-badge">03</div>
          <div>
            <h2 className="card-title">Verify Page</h2>
            <p className="card-subtitle">Connect to Chrome and confirm the floorplan is ready</p>
          </div>
          <div className="card-icon"><i className="fa-solid fa-shield-halved" /></div>
        </div>

        {verifyPhase === 'idle' || verifyPhase === 'loading' ? (
          <div style={{ marginBottom: 20 }}>
            <p className="verify-instruction">
              <i className="fa-solid fa-circle-info" />
              Make sure Chrome is open with <strong>--remote-debugging-port=9222</strong> and you are logged into the floorplan dashboard.
            </p>
            <button className="btn btn-primary" onClick={verifyPage} disabled={verifyPhase === 'loading'}>
              {verifyPhase === 'loading'
                ? <><i className="fa-solid fa-spinner" /> <span>Connecting…</span></>
                : <><i className="fa-solid fa-satellite-dish" /> <span>Connect &amp; Navigate</span></>}
            </button>
          </div>
        ) : (
          <div>
            <div className="verify-results">
              <VerifyTile
                icon="fa-brands fa-chrome" label="Chrome Connection"
                state={verifyResult?.status === 'error' ? 'fail' : 'ok'}
                value={verifyResult?.status === 'error' ? 'Failed' : `Port ${config.debugger_address}`}
                statusChar={verifyResult?.status === 'error' ? '✗' : '✓'}
              />
              <VerifyTile
                icon="fa-solid fa-globe" label="Page Title"
                state={verifyResult?.status === 'error' ? 'fail' : 'ok'}
                value={verifyResult?.status === 'error' ? 'Not reached' : (verifyResult?.page_title || 'Unknown').slice(0, 28)}
                statusChar={verifyResult?.status === 'error' ? '✗' : '✓'}
              />
              <VerifyTile
                icon="fa-solid fa-magnifying-glass" label="Search Bar Detected"
                state={verifyResult?.search_bar_found ? 'ok' : 'warn'}
                value={verifyResult?.search_bar_found ? 'Found ✓' : 'Not detected'}
                statusChar={verifyResult?.search_bar_found ? '✓' : '⚠'}
              />
            </div>

            {!pageVerified && (
              <div className="confirm-box">
                <div className="confirm-icon"><i className="fa-solid fa-eye" /></div>
                <div className="confirm-body">
                  <p className="confirm-question">Can you see the floorplan and search bar in Chrome?</p>
                  <p className="confirm-hint">Look at your Chrome window — verify the page loaded and the search bar is visible before proceeding.</p>
                </div>
                <div className="confirm-actions">
                  <button className="btn btn-confirm-yes" onClick={() => confirmPage(true)}>
                    <i className="fa-solid fa-check" /> Yes, I can see it
                  </button>
                  <button className="btn btn-confirm-no" onClick={() => confirmPage(false)}>
                    <i className="fa-solid fa-xmark" /> No, retry
                  </button>
                </div>
              </div>
            )}

            {pageVerified && (
              <div className="verified-badge">
                <i className="fa-solid fa-circle-check" /> Page verified — ready to annotate!
              </div>
            )}

            {verifyPhase === 'error' && (
              <button className="btn btn-primary" onClick={verifyPage} style={{ marginTop: 12 }}>
                <i className="fa-solid fa-rotate" /> <span>Retry Connection</span>
              </button>
            )}
            {verifyPhase === 'done' && (
              <button className="btn btn-secondary" onClick={resetVerify} style={{ marginTop: 12 }}>
                <i className="fa-solid fa-rotate" /> Re-verify
              </button>
            )}
          </div>
        )}
      </section>

      {/* Step 4: Run */}
      <section className={`card${isReady ? '' : ' card-locked'}`}>
        <div className="card-header">
          <div className={`step-badge${isReady ? '' : ' step-badge-locked'}`}>04</div>
          <div>
            <h2 className="card-title">Start Annotation</h2>
            <p className="card-subtitle">Automatically place all assets on the floorplan</p>
          </div>
          <div className="card-icon"><i className="fa-solid fa-robot" /></div>
        </div>

        {!isReady && (
          <div className="lock-overlay">
            <i className="fa-solid fa-lock" />
            <span>Please upload an Excel file (Step 01) and verify the page (Step 03)</span>
          </div>
        )}

        <div className="run-controls">
          {!running ? (
            <button className="btn btn-primary btn-run" onClick={startAutomation} disabled={!isReady}>
              <i className="fa-solid fa-play" /> <span>Start Annotation</span>
            </button>
          ) : (
            <button className="btn btn-danger" onClick={stopAutomation}>
              <i className="fa-solid fa-stop" /> <span>Stop</span>
            </button>
          )}
          {pageVerified && !running && (
            <button className="btn btn-secondary" onClick={resetVerify}>
              <i className="fa-solid fa-rotate" /> Re-verify
            </button>
          )}
        </div>

        {running && (
          <div className="progress-bar-container">
            <div className="progress-bar-track">
              <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
              <div className="progress-bar-shimmer" />
            </div>
            <span className="progress-label">
              Processing {progress.current} of {progress.total} assets ({pct}%)
            </span>
          </div>
        )}

        {(running || stats.success > 0 || stats.failed > 0) && (
          <div className="stats-row">
            <div className="stat-card">
              <i className="fa-solid fa-check-circle stat-icon success" />
              <div>
                <span className="stat-value">{stats.success}</span>
                <span className="stat-label">Succeeded</span>
              </div>
            </div>
            <div className="stat-card">
              <i className="fa-solid fa-triangle-exclamation stat-icon warning" />
              <div>
                <span className="stat-value">{stats.failed}</span>
                <span className="stat-label">Failed</span>
              </div>
            </div>
            <div className="stat-card">
              <i className="fa-solid fa-clock stat-icon info" />
              <div>
                <span className="stat-value">{stats.elapsed}</span>
                <span className="stat-label">Elapsed</span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Step 5: Logs */}
      <section className="card">
        <div className="card-header">
          <div className="step-badge">05</div>
          <div>
            <h2 className="card-title">Live Logs</h2>
            <p className="card-subtitle">Real-time automation output</p>
          </div>
          <div className="log-actions">
            <button className="btn-icon" onClick={clearLogs} title="Clear logs"><i className="fa-solid fa-trash" /></button>
            <button className="btn-icon" onClick={downloadLogs} title="Download logs"><i className="fa-solid fa-download" /></button>
            <div className="card-icon"><i className="fa-solid fa-terminal" /></div>
          </div>
        </div>
        <div className="log-container">
          {logs.length === 0 ? (
            <div className="log-empty">
              <i className="fa-solid fa-satellite-dish" />
              <p>Logs will appear here once verification starts</p>
            </div>
          ) : (
            logs.map((item, i) => (
              <div key={i} className={`log-line ${item.level || 'info'}`}>
                <span className="log-time">{item.timestamp || fmt()}</span>
                <span className="log-msg">{item.message}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}

function ConfigField({ label, icon, value, onChange, placeholder, full, mono, type = 'text' }) {
  return (
    <div className={`config-group${full ? ' full-width' : ''}`}>
      <label className="config-label"><i className={`fa-solid ${icon}`} /> {label}</label>
      <input
        type={type}
        className={`config-input${mono ? ' config-mono' : ''}`}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function DropZone({ onUpload }) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  const handleFile = async (file) => {
    setUploading(true);
    try { await onUpload(file); } finally { setUploading(false); }
  };

  return (
    <div
      className={`drop-zone${dragOver ? ' drag-over' : ''}`}
      style={uploading ? { opacity: 0.5, pointerEvents: 'none' } : {}}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
    >
      <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { if (e.target.files[0]) handleFile(e.target.files[0]); }} />
      <div className="drop-zone-icon"><i className="fa-solid fa-cloud-arrow-up" /></div>
      <p className="drop-zone-text">Drop your Excel file here</p>
      <p className="drop-zone-hint">or <span className="link">browse files</span></p>
      <p className="drop-zone-formats"><i className="fa-regular fa-file" /> .xlsx &nbsp;•&nbsp; .xls &nbsp;•&nbsp; .csv</p>
    </div>
  );
}

function VerifyTile({ icon, label, state, value, statusChar }) {
  const color = state === 'ok' ? 'var(--success)' : state === 'fail' ? 'var(--danger)' : 'var(--warning)';
  return (
    <div className={`verify-tile ${state}`}>
      <div className="verify-tile-icon"><i className={`fa-solid ${icon}`} /></div>
      <div className="verify-tile-body">
        <span className="verify-tile-label">{label}</span>
        <span className="verify-tile-value">{value}</span>
      </div>
      <div className="verify-tile-status" style={{ color }}>{statusChar}</div>
    </div>
  );
}

function fmt() { return new Date().toTimeString().slice(0, 8); }
