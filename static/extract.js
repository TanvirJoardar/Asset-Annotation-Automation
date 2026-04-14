/* ================================================================
   AssetBot — Extractor JavaScript
   ================================================================ */

let extractedAssets = [];
let pageVerified = false;
let Adjust_X = 6
let Adjust_Y = 6

document.addEventListener('DOMContentLoaded', () => {
    loadConfig();
});

// ── Config ────────────────────────────────────────────────────
async function loadConfig() {
    try {
        const res = await fetch('/api/config');
        const cfg = await res.json();
        if (cfg.login_url) document.getElementById('extractUrl').value = cfg.login_url;
        if (cfg.debugger_address) document.getElementById('exDebugger').value = cfg.debugger_address;
        if (cfg.search_bar_selector) document.getElementById('exSearchBar').value = cfg.search_bar_selector;
        
        // Sync adjustments with global config if present
        if (cfg.adjust_x !== undefined) Adjust_X = parseFloat(cfg.adjust_x);
        if (cfg.adjust_y !== undefined) Adjust_Y = parseFloat(cfg.adjust_y);
    } catch (_) { }
}

function getValue(id) { return document.getElementById(id)?.value ?? ''; }

// ── Phase 2: Verify ──────────────────────────────────────────
async function exVerifyPage() {
    const btn = document.getElementById('exVerifyBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Connecting…</span>';

    const cfg = {
        extract_url: getValue('extractUrl'),
        debugger_address: getValue('exDebugger'),
        search_bar_selector: getValue('exSearchBar')
    };

    // ── Reset UI ──────────────────────────────────────────────
    document.getElementById('exVerifiedBadge').classList.add('hidden');
    document.getElementById('exConfirmBox').classList.add('hidden');
    document.getElementById('extractSummary').classList.add('hidden');
    setTile('exTileChrome', '', 'fa-brands fa-chrome', '—', '');
    setTile('exTilePage', '', 'fa-globe', '—', '');
    setTile('exTileKonva', '', 'fa-layer-group', '—', '');

    try {
        // We use the extract-assets endpoint with a flag perhaps? 
        // Or just let it run. Let's assume it returns asset count even during verify if successful.
        const res = await fetch('/api/extract-assets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cfg),
        });
        const data = await res.json();

        document.getElementById('exVerifyPhaseB').classList.remove('hidden');

        if (data.status === 'error') {
            setTile('exTileChrome', 'fail', 'fa-brands fa-chrome', 'Failed', '✗');
            setTile('exTilePage', 'fail', 'fa-globe', 'Navigation Failed', '✗');
            setTile('exTileKonva', 'fail', 'fa-layer-group', 'Error', '✗');
            showToast(data.message, 'error', 'fa-triangle-exclamation');
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-rotate"></i> <span>Retry Connection</span>';
            return;
        }

        // Success
        setTile('exTileChrome', 'ok', 'fa-brands fa-chrome', `Port ${cfg.debugger_address}`, '✓');
        setTile('exTilePage', 'ok', 'fa-globe', (data.page_title || 'Loaded').slice(0, 30), '✓');

        if (data.assets && data.assets.length >= 0) {
            setTile('exTileKonva', 'ok', 'fa-layer-group', `${data.assets.length} nodes found`, '✓');
            extractedAssets = data.assets; // Store temporarily
        } else {
            setTile('exTileKonva', 'warn', 'fa-layer-group', 'Stage not found', '⚠');
        }

        document.getElementById('exConfirmBox').classList.remove('hidden');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-rotate"></i> <span>Re-connect</span>';

    } catch (e) {
        showToast('Server error during verify', 'error', 'fa-triangle-exclamation');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-satellite-dish"></i> <span>Connect &amp; Navigate</span>';
    }
}

function setTile(id, state, icon, val, status) {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = `verify-tile ${state}`;
    el.querySelector('.verify-tile-icon').innerHTML = `<i class="fa-solid ${icon}"></i>`;
    el.querySelector('.verify-tile-value').textContent = val;
    const sEl = el.querySelector('.verify-tile-status');
    sEl.textContent = status;
    sEl.style.color = state === 'ok' ? 'var(--success)' : state === 'fail' ? 'var(--danger)' : 'var(--warning)';
}

function exConfirmPage(yes) {
    if (yes) {
        document.getElementById('exConfirmBox').classList.add('hidden');
        document.getElementById('exVerifiedBadge').classList.remove('hidden');

        // Unlock Step 3
        const overlay = document.getElementById('exLockOverlay');
        overlay.classList.add('hidden');
        document.getElementById('exRunBadge').classList.remove('step-badge-locked');

        const startBtn = document.getElementById('exExtractBtn');
        startBtn.disabled = false;
        startBtn.classList.add('unlocked');

        document.getElementById('exReverifyBtn').classList.remove('hidden');
        pageVerified = true;
        showToast('Page verified! Ready to extract.', 'success', 'fa-lock-open');
    } else {
        exResetVerify();
    }
}

function exResetVerify() {
    pageVerified = false;
    document.getElementById('exVerifyPhaseB').classList.add('hidden');
    document.getElementById('exVerifiedBadge').classList.add('hidden');
    document.getElementById('exLockOverlay').classList.remove('hidden');
    document.getElementById('exRunBadge').classList.add('step-badge-locked');
    document.getElementById('exExtractBtn').disabled = true;
    document.getElementById('exReverifyBtn').classList.add('hidden');

    const btn = document.getElementById('exVerifyBtn');
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-satellite-dish"></i> <span>Connect &amp; Navigate</span>';
}

// ── Phase 3: Extract ─────────────────────────────────────────
async function doExtract() {
    const btn = document.getElementById('exExtractBtn');
    btn.classList.add('loading');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Extracting...</span>';

    const cfg = {
        extract_url: getValue('extractUrl'),
        debugger_address: getValue('exDebugger')
    };

    try {
        const res = await fetch('/api/extract-assets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cfg),
        });
        const data = await res.json();

        if (data.status === 'ok') {
            // ── Apply Global Adjustments ──────────────────────────
            extractedAssets = data.assets.map(a => ({
                ...a,
                x: a.x - Adjust_X,
                y: a.y - Adjust_Y
            }));
            
            renderTable(extractedAssets);

            document.getElementById('sumTotal').textContent = data.count;
            document.getElementById('sumPage').textContent = data.page_title;
            document.getElementById('extractSummary').classList.remove('hidden');
            document.getElementById('ex-card-results').classList.remove('hidden');
            document.getElementById('resultsSubtitle').textContent = `Found ${data.count} assets on "${data.page_title}"`;

            showToast(`Extraction complete! ${data.count} assets found.`, 'success', 'fa-check');

            // Scroll to results
            setTimeout(() => {
                document.getElementById('ex-card-results').scrollIntoView({ behavior: 'smooth' });
            }, 300);
        } else {
            showToast(data.message || 'Extraction failed', 'error', 'fa-triangle-exclamation');
        }
    } catch (e) {
        showToast('Server error during extraction', 'error', 'fa-triangle-exclamation');
    } finally {
        btn.classList.remove('loading');
        btn.innerHTML = '<i class="fa-solid fa-crosshairs"></i> <span>Extract All Assets</span>';
    }
}

// ── Table Logic ──────────────────────────────────────────────
function renderTable(assets) {
    const body = document.getElementById('resultsBody');
    body.innerHTML = '';

    if (assets.length === 0) {
        body.innerHTML = `<tr><td colspan="7" class="table-empty"><i class="fa-solid fa-inbox"></i>No assets found</td></tr>`;
        return;
    }

    assets.forEach(a => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="cell-index">${a.index}</td>
            <td class="cell-id ${a.id ? '' : 'empty'}">${a.id || 'No ID'}</td>
            <td><span class="cell-type"><i class="fa-solid ${getIcon(a.type)}"></i> ${a.type}</span></td>
            <td class="cell-coord">${a.x}</td>
            <td class="cell-coord">${a.y}</td>
            <td class="cell-dim">${a.width || '-'}</td>
            <td class="cell-dim">${a.height || '-'}</td>
        `;
        body.appendChild(row);
    });

    document.getElementById('tableInfo').textContent = `Showing all ${assets.length} assets`;
}

function getIcon(type) {
    if (type === 'Image') return 'fa-image';
    if (type === 'Circle') return 'fa-circle';
    if (type === 'Rect') return 'fa-square';
    if (type === 'Group') return 'fa-boxes-stacked';
    return 'fa-shapes';
}

function filterTable() {
    const query = document.getElementById('tableFilter').value.toLowerCase();
    const filtered = extractedAssets.filter(a =>
        (a.id || '').toLowerCase().includes(query) ||
        (a.type || '').toLowerCase().includes(query)
    );
    renderTable(filtered);
    document.getElementById('tableInfo').textContent = `Showing ${filtered.length} of ${extractedAssets.length}`;
}

let sortDir = 1;
function sortTable(key) {
    sortDir *= -1;
    const sorted = [...extractedAssets].sort((a, b) => {
        const valA = a[key];
        const valB = b[key];
        if (typeof valA === 'string') return valA.localeCompare(valB) * sortDir;
        return (valA - valB) * sortDir;
    });
    renderTable(sorted);
}

// ── Export ───────────────────────────────────────────────────
async function exportExcel() {
    if (!extractedAssets.length) return;
    try {
        const res = await fetch('/api/download-extracted', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assets: extractedAssets }),
        });
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `extracted_assets_${Date.now()}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast('Excel export started!', 'success', 'fa-file-excel');
    } catch (_) {
        showToast('Export failed', 'error', 'fa-triangle-exclamation');
    }
}

function exportCSV() {
    if (!extractedAssets.length) return;
    const headers = ['index', 'id', 'type', 'x', 'y', 'width', 'height'];
    const csvRows = [
        headers.join(','),
        ...extractedAssets.map(a => headers.map(h => `"${a[h] || ''}"`).join(','))
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `extracted_assets_${Date.now()}.csv`;
    a.click();
    showToast('CSV export started!', 'success', 'fa-file-csv');
}

// ── Toast ─────────────────────────────────────────────────────
function showToast(message, type = 'info', icon = 'fa-info-circle') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fa-solid ${icon} toast-icon"></i><span class="toast-text">${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 250);
    }, 3800);
}
