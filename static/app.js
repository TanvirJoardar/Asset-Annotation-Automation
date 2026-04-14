/* ================================================================
   AssetBot — Application JavaScript
   ================================================================ */

let eventSource     = null;
let startTime       = null;
let elapsedTimer    = null;
let successCount    = 0;
let failCount       = 0;
let logLines        = [];
let totalAssets     = 0;
let processedAssets = 0;
let pageVerified    = false;   // set true after user confirms page
let fileUploaded    = false;   // set true after a file is uploaded

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  setupDropZone();
  pollStatus();
});

// ── Config ────────────────────────────────────────────────────
async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    const cfg = await res.json();
    applyConfig(cfg);
  } catch (_) {}
}

function applyConfig(cfg) {
  setValue('loginUrl',             cfg.login_url             || '');
  setValue('columnName',           cfg.column_name           || 'ID');
  setValue('debuggerAddress',      cfg.debugger_address      || '127.0.0.1:9222');
  setValue('searchBarSelector',    cfg.search_bar_selector   || '');
  setValue('searchButtonSelector', cfg.search_button_selector|| '');
  setValue('resultItemSelector',   cfg.result_item_selector  || '');
  setValue('canvasSelector',       cfg.canvas_selector       || '');
  setValue('adjustX',              cfg.adjust_x              ?? 6);
  setValue('adjustY',              cfg.adjust_y              ?? 6);
}

function setValue(id, val) { const el = document.getElementById(id); if (el) el.value = val; }
function getValue(id)      { return document.getElementById(id)?.value ?? ''; }

async function saveConfig() {
  const cfg = getFormConfig();
  try {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    });
    showToast('Configuration saved!', 'success', 'fa-check-circle');
    animateBtn('saveConfigBtn');
  } catch (_) {
    showToast('Failed to save config', 'error', 'fa-triangle-exclamation');
  }
}

function getFormConfig() {
  return {
    login_url:              getValue('loginUrl'),
    column_name:            getValue('columnName'),
    debugger_address:       getValue('debuggerAddress'),
    search_bar_selector:    getValue('searchBarSelector'),
    search_button_selector: getValue('searchButtonSelector'),
    result_item_selector:   getValue('resultItemSelector'),
    canvas_selector:        getValue('canvasSelector'),
    adjust_x:               parseFloat(getValue('adjustX')) || 6,
    adjust_y:               parseFloat(getValue('adjustY')) || 6,
  };
}

// ── File Upload / Drop Zone ───────────────────────────────────
function setupDropZone() {
  const zone  = document.getElementById('dropZone');
  const input = document.getElementById('fileInput');

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover',  (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', ()  => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) handleFileUpload(e.dataTransfer.files[0]);
  });
  input.addEventListener('change', () => { if (input.files[0]) handleFileUpload(input.files[0]); });
}

async function handleFileUpload(file) {
  const formData = new FormData();
  formData.append('file', file);

  const zone = document.getElementById('dropZone');
  zone.style.opacity = '0.5';
  zone.style.pointerEvents = 'none';

  try {
    const res  = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();

    if (data.error) { showToast(data.error, 'error', 'fa-triangle-exclamation'); return; }

    document.getElementById('fileName').textContent = data.filename;
    document.getElementById('fileMeta').textContent =
      data.rows != null ? `${data.rows} rows • ${(data.columns||[]).length} columns` : 'File uploaded';

    const colsEl  = document.getElementById('fileColumns');
    const colName  = getValue('columnName') || 'ID';
    colsEl.innerHTML = '';
    (data.columns || []).forEach(c => {
      const tag = document.createElement('span');
      tag.className = `col-tag${(c === colName || c === 'X' || c === 'Y') ? ' highlight' : ''}`;
      tag.textContent = c;
      colsEl.appendChild(tag);
    });

    document.getElementById('fileInfo').classList.remove('hidden');
    totalAssets = data.rows || 0;

    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ excel_file: data.filename }),
    });

    fileUploaded = true;
    checkReadiness();   // re-evaluate lock overlay

    showToast(`Loaded ${data.filename} — ${data.rows} assets`, 'success', 'fa-table');
  } catch (e) {
    showToast('Upload failed: ' + e.message, 'error', 'fa-triangle-exclamation');
  } finally {
    zone.style.opacity = '';
    zone.style.pointerEvents = '';
  }
}

// ── Step 3: Verify Page ───────────────────────────────────────
async function verifyPage() {
  const btn = document.getElementById('verifyBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner"></i> <span>Connecting…</span>';

  // Save config first
  const cfg = getFormConfig();
  await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  });

  appendLog({ message: '🔌 Connecting to Chrome and navigating…', level: 'info', timestamp: now() });

  try {
    const res  = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    });
    const data = await res.json();

    // Show Phase B
    document.getElementById('verifyPhaseB').classList.remove('hidden');

    if (data.status === 'error') {
      // Chrome connection failed
      setVerifyTile('tileChromeConnect', 'fail', 'fa-xmark-circle', data.step === 'connect' ? 'Failed' : 'Connected', '✗');
      setVerifyTile('tilePageLoad',      'fail', 'fa-xmark-circle', 'Not reached', '✗');
      setVerifyTile('tileSearchBar',     'fail', 'fa-xmark-circle', 'Unknown', '✗');
      appendLog({ message: `❌ ${data.message}`, level: 'error', timestamp: now() });
      showToast('Connection failed — check Chrome debugger', 'error', 'fa-plug');

      // Reset verify button
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-rotate"></i> <span>Retry Connection</span>';
      return;
    }

    // ── Success ──────────────────────────────────────────────
    // Tile 1 — Chrome Connected
    setVerifyTile('tileChromeConnect', 'ok', 'fa-brands fa-chrome',
      `Port ${cfg.debugger_address}`, '✓');

    // Tile 2 — Page loaded
    const shortTitle = (data.page_title || 'Unknown').slice(0, 28);
    setVerifyTile('tilePageLoad', 'ok', 'fa-globe', shortTitle, '✓');

    // Tile 3 — Search bar
    if (data.search_bar_found) {
      setVerifyTile('tileSearchBar', 'ok', 'fa-magnifying-glass', 'Found ✓', '✓');
      appendLog({ message: '✅ Chrome connected, page loaded, search bar detected!', level: 'success', timestamp: now() });
      showToast('Page verified automatically!', 'success', 'fa-shield-halved');
    } else {
      setVerifyTile('tileSearchBar', 'warn', 'fa-magnifying-glass',
        'Not detected (may still be present)', '⚠');
      appendLog({ message: '⚠️ Search bar selector returned 0 elements — confirm manually.', level: 'warning', timestamp: now() });
      showToast('Page loaded — confirm search bar manually', 'info', 'fa-eye');
    }

    appendLog({ message: `🌐 Page: "${data.page_title}"`, level: 'info', timestamp: now() });

    // Show confirmation box
    document.getElementById('confirmBox').classList.remove('hidden');

    // Reset button to allow re-verify
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-rotate"></i> <span>Re-connect</span>';

  } catch (e) {
    appendLog({ message: `❌ Verify request failed: ${e.message}`, level: 'error', timestamp: now() });
    showToast('Server error during verify', 'error', 'fa-triangle-exclamation');
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-satellite-dish"></i> <span>Connect &amp; Navigate</span>';
  }
}

function setVerifyTile(tileId, state, icon, value, statusChar) {
  const tile = document.getElementById(tileId);
  if (!tile) return;

  // Remove old state classes
  tile.classList.remove('ok', 'fail', 'warn');
  tile.classList.add(state);

  // Icon
  const iconEl = tile.querySelector('.verify-tile-icon');
  if (iconEl) iconEl.innerHTML = `<i class="fa-solid ${icon}"></i>`;

  // Value
  const valEl = tile.querySelector('.verify-tile-value');
  if (valEl) valEl.textContent = value;

  // Status char
  const statusEl = tile.querySelector('.verify-tile-status');
  if (statusEl) {
    statusEl.textContent = statusChar;
    statusEl.style.color =
      state === 'ok'   ? 'var(--success)' :
      state === 'fail' ? 'var(--danger)'  : 'var(--warning)';
  }
}

// Human confirmation: Yes or No
function confirmPage(yes) {
  if (yes) {
    // Hide confirm box, show verified badge
    document.getElementById('confirmBox').classList.add('hidden');
    document.getElementById('verifiedBadge').classList.remove('hidden');

    pageVerified = true;
    checkReadiness();   // unlock Step 4 only if file also uploaded

    appendLog({ message: '✅ User confirmed: floorplan is visible.', level: 'success', timestamp: now() });

    if (fileUploaded) {
      showToast('All set! Step 4 unlocked — ready to annotate.', 'success', 'fa-lock-open');
      // Scroll to run step
      setTimeout(() => {
        document.getElementById('card-run').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 400);
    } else {
      showToast('Page verified ✓  — now upload your Excel file to unlock Step 4.', 'info', 'fa-file-excel');
    }

  } else {
    // Reset so user can re-verify
    resetVerify();
    showToast('Please reload Chrome and retry.', 'info', 'fa-rotate');
  }
}

// ── Readiness gate ────────────────────────────────────────────
// Both steps must be complete before Start Annotation is enabled.
function checkReadiness() {
  const overlay  = document.getElementById('lockOverlay');
  const badge    = document.getElementById('runStepBadge');
  const startBtn = document.getElementById('startBtn');

  if (fileUploaded && pageVerified) {
    // ── Fully unlocked ──────────────────────────────────────
    overlay.classList.add('hidden');
    badge.classList.add('unlocked');
    startBtn.disabled = false;
    startBtn.classList.add('unlocked');
    setTimeout(() => startBtn.classList.remove('unlocked'), 600);
    document.getElementById('reverifyBtn').classList.remove('hidden');
  } else {
    // ── Still locked — show which step(s) remain ────────────
    overlay.classList.remove('hidden');
    badge.classList.remove('unlocked');
    startBtn.disabled = true;

    const missing = [];
    if (!fileUploaded) missing.push('upload an Excel file (Step 01)');
    if (!pageVerified) missing.push('verify the page (Step 03)');

    const overlayEl = overlay.querySelector('span');
    if (overlayEl) overlayEl.textContent = 'Please ' + missing.join(' and ');
  }
}

function resetVerify() {
  pageVerified = false;

  // Reset verify UI
  document.getElementById('verifyPhaseB').classList.add('hidden');
  document.getElementById('confirmBox').classList.remove('hidden');
  document.getElementById('verifiedBadge').classList.add('hidden');

  // Reset verify button
  const btn = document.getElementById('verifyBtn');
  btn.disabled = false;
  btn.innerHTML = '<i class="fa-solid fa-satellite-dish"></i> <span>Connect &amp; Navigate</span>';

  document.getElementById('reverifyBtn').classList.add('hidden');

  // Re-evaluate lock
  checkReadiness();

  // Scroll back to verify card
  document.getElementById('card-verify').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Step 4: Start / Stop Automation ──────────────────────────
async function startAutomation() {
  if (!fileUploaded || !pageVerified) {
    const missing = [];
    if (!fileUploaded) missing.push('upload a file');
    if (!pageVerified) missing.push('verify the page');
    showToast('Please ' + missing.join(' and ') + ' first', 'error', 'fa-lock');
    return;
  }

  const cfg = getFormConfig();
  await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  });

  const res  = await fetch('/api/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  });
  const data = await res.json();

  if (data.error) {
    showToast(data.error, 'error', 'fa-triangle-exclamation');
    return;
  }

  // Reset counters
  successCount    = 0;
  failCount       = 0;
  processedAssets = 0;
  startTime       = Date.now();
  logLines        = [];

  setRunning(true);
  startElapsedTimer();
  subscribeToLogs();
  showToast('Automation started!', 'success', 'fa-play');
}

async function stopAutomation() {
  await fetch('/api/stop', { method: 'POST' });
  showToast('Stop signal sent…', 'info', 'fa-stop');
}

async function pollStatus() {
  try {
    const res  = await fetch('/api/status');
    const data = await res.json();
    if (!data.running && document.getElementById('startBtn').classList.contains('hidden')) {
      setRunning(false);
    }
  } catch (_) {}
  setTimeout(pollStatus, 3000);
}

// ── SSE Log Stream ────────────────────────────────────────────
function subscribeToLogs() {
  if (eventSource) eventSource.close();
  eventSource = new EventSource('/api/stream');

  eventSource.onmessage = (e) => {
    const item = JSON.parse(e.data);
    if (item.message === '__ping__') return;
    if (item.level   === 'done')    { onAutomationDone(); return; }
    appendLog(item);
    updateStatsFromLog(item.message);
  };

  eventSource.onerror = () => {
    eventSource.close();
    appendLog({ message: '⚠️ Log stream disconnected.', level: 'warning', timestamp: now() });
  };
}

function appendLog(item) {
  logLines.push(item);
  const container = document.getElementById('logContainer');
  const empty = container.querySelector('.log-empty');
  if (empty) empty.remove();

  const line = document.createElement('div');
  line.className = `log-line ${item.level || 'info'}`;

  const time = document.createElement('span');
  time.className   = 'log-time';
  time.textContent = item.timestamp || now();

  const msg = document.createElement('span');
  msg.className   = 'log-msg';
  msg.textContent = item.message;

  line.appendChild(time);
  line.appendChild(msg);
  container.appendChild(line);
  container.scrollTop = container.scrollHeight;
}

function updateStatsFromLog(msg) {
  // Only count per-item completion lines to avoid false positives
  // Success = Konva confirm line (one per successfully placed asset)
  if (/^\s*📍 Konva:/.test(msg))                   successCount++;
  // Fail = per-item warning or error lines
  if (/⚠️ Could not process|❌ Error for/.test(msg)) failCount++;

  // The final Done line carries authoritative totals — use them directly
  const doneMatch = msg.match(/✅\s*(\d+)\s*succeeded.*❌\s*(\d+)\s*failed/);
  if (doneMatch) {
    successCount = parseInt(doneMatch[1]);
    failCount    = parseInt(doneMatch[2]);
  }

  // Progress from "[3/10]" patterns
  const match = msg.match(/\[(\d+)\/(\d+)\]/);
  if (match) {
    processedAssets = parseInt(match[1]);
    totalAssets     = parseInt(match[2]);
    updateProgress(processedAssets, totalAssets);
  }

  document.getElementById('statSuccess').textContent = successCount;
  document.getElementById('statFailed').textContent  = failCount;
}

function updateProgress(current, total) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressLabel').textContent =
    `Processing ${current} of ${total} assets (${pct}%)`;
}

function onAutomationDone() {
  if (eventSource) { eventSource.close(); eventSource = null; }
  setRunning(false);
  stopElapsedTimer();
  showToast(`Done! ✅ ${successCount} succeeded  ❌ ${failCount} failed`, 'success', 'fa-flag-checkered');
  updateProgress(totalAssets, totalAssets);

  // Header status
  const dot   = document.getElementById('statusDot');
  const label = document.getElementById('statusLabel');
  dot.className    = 'status-dot done';
  label.textContent = 'Completed';
}

// ── UI State ──────────────────────────────────────────────────
function setRunning(running) {
  const startBtn   = document.getElementById('startBtn');
  const stopBtn    = document.getElementById('stopBtn');
  const revBtn     = document.getElementById('reverifyBtn');
  const progress   = document.getElementById('progressContainer');
  const stats      = document.getElementById('statsRow');
  const dot        = document.getElementById('statusDot');
  const label      = document.getElementById('statusLabel');

  if (running) {
    startBtn.classList.add('hidden');
    stopBtn.classList.remove('hidden');
    revBtn.classList.add('hidden');
    progress.classList.remove('hidden');
    stats.classList.remove('hidden');
    dot.className    = 'status-dot running';
    label.textContent = 'Running';
  } else {
    startBtn.classList.remove('hidden');
    stopBtn.classList.add('hidden');
    if (pageVerified) revBtn.classList.remove('hidden');
    dot.className    = 'status-dot';
    label.textContent = 'Idle';
  }
}

// ── Elapsed Timer ─────────────────────────────────────────────
function startElapsedTimer() {
  stopElapsedTimer();
  elapsedTimer = setInterval(() => {
    if (!startTime) return;
    const secs = Math.floor((Date.now() - startTime) / 1000);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    document.getElementById('statElapsed').textContent =
      h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
  }, 1000);
}

function stopElapsedTimer() {
  if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
}

// ── Log Actions ───────────────────────────────────────────────
function clearLogs() {
  logLines = [];
  document.getElementById('logContainer').innerHTML = `
    <div class="log-empty">
      <i class="fa-solid fa-satellite-dish"></i>
      <p>Logs will appear here once verification starts</p>
    </div>`;
}

function downloadLogs() {
  if (!logLines.length) { showToast('No logs to download', 'info', 'fa-info-circle'); return; }
  const text = logLines.map(l => `[${l.timestamp}] ${l.message}`).join('\n');
  const blob = new Blob([text], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: `assetbot-${Date.now()}.txt` });
  a.click();
  URL.revokeObjectURL(url);
  showToast('Logs downloaded!', 'success', 'fa-download');
}

// ── Toast ─────────────────────────────────────────────────────
function showToast(message, type = 'info', icon = 'fa-info-circle') {
  const container = document.getElementById('toastContainer');
  const toast     = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fa-solid ${icon} toast-icon"></i><span class="toast-text">${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 250);
  }, 3800);
}

// ── Helpers ───────────────────────────────────────────────────
function animateBtn(id) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.style.transform = 'scale(0.96)';
  setTimeout(() => { btn.style.transform = ''; }, 150);
}

function now() { return new Date().toTimeString().slice(0, 8); }
