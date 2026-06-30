import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';
import { useToast } from '../hooks/useToast';

export default function Extract() {
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [debuggerAddr, setDebuggerAddr] = useState('127.0.0.1:9222');
  const [searchBar, setSearchBar] = useState('input.search-field');
  const [adjustX, setAdjustX] = useState(6);
  const [adjustY, setAdjustY] = useState(21);

  const [verifyPhase, setVerifyPhase] = useState('idle');
  const [verifyResult, setVerifyResult] = useState(null);
  const [pageVerified, setPageVerified] = useState(false);

  const [extracting, setExtracting] = useState(false);
  const [assets, setAssets] = useState([]);
  const [pageName, setPageName] = useState('');

  const [filter, setFilter] = useState('');
  const [sortKey, setSortKey] = useState('index');
  const [sortDir, setSortDir] = useState(1);

  useEffect(() => {
    api.getConfig().then((cfg) => {
      if (cfg.login_url) setUrl(cfg.login_url);
      if (cfg.debugger_address) setDebuggerAddr(cfg.debugger_address);
      if (cfg.search_bar_selector) setSearchBar(cfg.search_bar_selector);
      if (cfg.adjust_x !== undefined) setAdjustX(parseFloat(cfg.adjust_x));
      if (cfg.adjust_y !== undefined) setAdjustY(parseFloat(cfg.adjust_y) + 15);
    });
  }, []);

  const exVerifyPage = async () => {
    setVerifyPhase('loading');
    try {
      const data = await api.extractAssets({ extract_url: url, debugger_address: debuggerAddr, search_bar_selector: searchBar });
      setVerifyResult(data);
      if (data.status === 'error') {
        setVerifyPhase('error');
        toast(data.message, 'error', 'fa-triangle-exclamation');
        return;
      }
      setVerifyPhase('done');
      toast('Page connected! Confirm below.', 'success', 'fa-shield-halved');
    } catch {
      setVerifyPhase('error');
      toast('Server error during verify', 'error', 'fa-triangle-exclamation');
    }
  };

  const confirmPage = (yes) => {
    if (yes) {
      setPageVerified(true);
      toast('Page verified! Ready to extract.', 'success', 'fa-lock-open');
    } else {
      exResetVerify();
    }
  };

  const exResetVerify = () => {
    setPageVerified(false);
    setVerifyPhase('idle');
    setVerifyResult(null);
    setAssets([]);
  };

  const doExtract = async () => {
    setExtracting(true);
    try {
      const data = await api.extractAssets({ extract_url: url, debugger_address: debuggerAddr });
      if (data.status === 'ok') {
        const adjusted = data.assets.map((a) => ({ ...a, x: a.x - adjustX, y: a.y - adjustY }));
        setAssets(adjusted);
        setPageName(data.page_title || '');
        toast(`Extraction complete! ${data.count} assets found.`, 'success', 'fa-check');
      } else {
        toast(data.message || 'Extraction failed', 'error', 'fa-triangle-exclamation');
      }
    } catch {
      toast('Server error during extraction', 'error', 'fa-triangle-exclamation');
    } finally {
      setExtracting(false);
    }
  };

  const exportExcel = async () => {
    if (!assets.length) return;
    const blob = await api.downloadExtracted(assets);
    const urlStr = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: urlStr, download: `extracted_assets_${Date.now()}.xlsx` });
    a.click();
    URL.revokeObjectURL(urlStr);
    toast('Excel export started!', 'success', 'fa-file-excel');
  };

  const exportCSV = () => {
    if (!assets.length) return;
    const headers = ['index', 'id', 'type', 'x', 'y', 'width', 'height'];
    const csvRows = [headers.join(','), ...assets.map((a) => headers.map((h) => `"${a[h] || ''}"`).join(','))];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const urlStr = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: urlStr, download: `extracted_assets_${Date.now()}.csv` });
    a.click();
    toast('CSV export started!', 'success', 'fa-file-csv');
  };

  const filteredAssets = assets.filter((a) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (a.id || '').toLowerCase().includes(q) || (a.type || '').toLowerCase().includes(q);
  });

  const sortedAssets = [...filteredAssets].sort((a, b) => {
    const va = a[sortKey], vb = b[sortKey];
    if (typeof va === 'string') return va.localeCompare(vb) * sortDir;
    return ((va || 0) - (vb || 0)) * sortDir;
  });

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => -d);
    else { setSortKey(key); setSortDir(1); }
  };

  const iconFor = (type) => {
    if (type === 'Image') return 'fa-image';
    if (type === 'Circle') return 'fa-circle';
    if (type === 'Rect') return 'fa-square';
    if (type === 'Group') return 'fa-boxes-stacked';
    return 'fa-shapes';
  };

  return (
    <>
      {/* Step 1: URL Config */}
      <section className="card">
        <div className="card-header">
          <div className="step-badge" style={{ background: 'linear-gradient(135deg,hsl(260,80%,60%),hsl(300,70%,60%))' }}>01</div>
          <div>
            <h2 className="card-title">Floorplan URL</h2>
            <p className="card-subtitle">Enter the URL of the floorplan containing annotated assets</p>
          </div>
          <div className="card-icon"><i className="fa-solid fa-link" /></div>
        </div>
        <div className="config-grid">
          <div className="config-group full-width">
            <label className="config-label"><i className="fa-solid fa-globe" /> Floorplan URL to Extract From</label>
            <input className="config-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-dashboard.com/floorplan/..." />
          </div>
          <div className="config-group">
            <label className="config-label"><i className="fa-solid fa-plug" /> Chrome Debugger Address</label>
            <input className="config-input" value={debuggerAddr} onChange={(e) => setDebuggerAddr(e.target.value)} placeholder="127.0.0.1:9222" />
          </div>
          <div className="config-group">
            <label className="config-label"><i className="fa-solid fa-magnifying-glass" /> Search Bar Selector (for verify)</label>
            <input className="config-input config-mono" value={searchBar} onChange={(e) => setSearchBar(e.target.value)} placeholder="input.search-field" />
          </div>
        </div>
        <div className="config-actions" style={{ marginTop: 18 }}>
          <div className="chrome-hint">
            <i className="fa-brands fa-chrome" /> Chrome must be running with: <code>chrome.exe --remote-debugging-port=9222</code>
          </div>
        </div>
      </section>

      {/* Step 2: Verify */}
      <section className="card">
        <div className="card-header">
          <div className="step-badge" style={{ background: 'linear-gradient(135deg,hsl(260,80%,60%),hsl(300,70%,60%))' }}>02</div>
          <div>
            <h2 className="card-title">Verify Page</h2>
            <p className="card-subtitle">Connect to Chrome and confirm the floorplan loaded correctly</p>
          </div>
          <div className="card-icon"><i className="fa-solid fa-shield-halved" /></div>
        </div>

        {(verifyPhase === 'idle' || verifyPhase === 'loading') && (
          <div style={{ marginBottom: 20 }}>
            <p className="verify-instruction">
              <i className="fa-solid fa-circle-info" />
              Make sure you are <strong>logged in</strong> and the floorplan is visible in Chrome before connecting.
            </p>
            <button className="btn btn-extract" onClick={exVerifyPage} disabled={verifyPhase === 'loading'}>
              {verifyPhase === 'loading'
                ? <><i className="fa-solid fa-spinner fa-spin" /> <span>Connecting…</span></>
                : <><i className="fa-solid fa-satellite-dish" /> <span>Connect &amp; Navigate</span></>}
            </button>
          </div>
        )}

        {verifyPhase !== 'idle' && verifyPhase !== 'loading' && (
          <div>
            <div className="verify-results">
              <VerifyTile
                icon="fa-brands fa-chrome" label="Chrome Connection"
                state={verifyResult?.status === 'error' ? 'fail' : 'ok'}
                value={verifyResult?.status === 'error' ? 'Failed' : `Port ${debuggerAddr}`}
                statusChar={verifyResult?.status === 'error' ? '✗' : '✓'}
              />
              <VerifyTile
                icon="fa-solid fa-globe" label="Page Title"
                state={verifyResult?.status === 'error' ? 'fail' : 'ok'}
                value={verifyResult?.status === 'error' ? 'Navigation Failed' : (verifyResult?.page_title || 'Loaded').slice(0, 30)}
                statusChar={verifyResult?.status === 'error' ? '✗' : '✓'}
              />
              <VerifyTile
                icon="fa-solid fa-layer-group" label="Konva.js Stage"
                state={verifyResult?.assets ? 'ok' : 'warn'}
                value={verifyResult?.assets ? `${verifyResult.assets.length} nodes found` : 'Stage not found'}
                statusChar={verifyResult?.assets ? '✓' : '⚠'}
              />
            </div>

            {!pageVerified && (
              <div className="confirm-box">
                <div className="confirm-icon"><i className="fa-solid fa-eye" /></div>
                <div className="confirm-body">
                  <p className="confirm-question">Can you see the annotated floorplan in Chrome?</p>
                  <p className="confirm-hint">Verify all assets are visible on the canvas before extracting.</p>
                </div>
                <div className="confirm-actions">
                  <button className="btn btn-confirm-yes" onClick={() => confirmPage(true)}>
                    <i className="fa-solid fa-check" /> Yes, ready to extract
                  </button>
                  <button className="btn btn-confirm-no" onClick={() => confirmPage(false)}>
                    <i className="fa-solid fa-xmark" /> No, retry
                  </button>
                </div>
              </div>
            )}

            {pageVerified && (
              <div className="verified-badge">
                <i className="fa-solid fa-circle-check" /> Page verified — ready to extract!
              </div>
            )}

            {verifyPhase === 'error' && (
              <button className="btn btn-extract" onClick={exVerifyPage} style={{ marginTop: 12 }}>
                <i className="fa-solid fa-rotate" /> <span>Retry Connection</span>
              </button>
            )}
            {verifyPhase === 'done' && (
              <button className="btn btn-secondary" onClick={exResetVerify} style={{ marginTop: 12 }}>
                <i className="fa-solid fa-rotate" /> Re-verify
              </button>
            )}
          </div>
        )}
      </section>

      {/* Step 3: Extract */}
      <section className={`card${pageVerified ? '' : ' card-locked'}`}>
        {!pageVerified && (
          <div className="lock-overlay">
            <i className="fa-solid fa-lock" /> <span>Please verify the page first (Step 02)</span>
          </div>
        )}
        <div className="card-header">
          <div className="step-badge step-badge-locked" style={{ background: pageVerified ? 'linear-gradient(135deg,hsl(260,80%,60%),hsl(300,70%,60%))' : undefined }}>03</div>
          <div>
            <h2 className="card-title">Extract Assets</h2>
            <p className="card-subtitle">Read all Konva node positions from the live floorplan</p>
          </div>
          <div className="card-icon"><i className="fa-solid fa-magnifying-glass-location" /></div>
        </div>
        <div className="extract-controls">
          <button className={`btn btn-extract btn-run${extracting ? ' loading' : ''}`} onClick={doExtract} disabled={!pageVerified || extracting}>
            {extracting
              ? <><i className="fa-solid fa-spinner fa-spin" /> <span>Extracting...</span></>
              : <><i className="fa-solid fa-crosshairs" /> <span>Extract All Assets</span></>}
          </button>
          {pageVerified && (
            <button className="btn btn-secondary" onClick={exResetVerify}>
              <i className="fa-solid fa-rotate" /> Re-verify
            </button>
          )}
        </div>
        {assets.length > 0 && (
          <div className="extract-summary">
            <div className="summary-chip"><i className="fa-solid fa-database" /> {assets.length} assets found</div>
            <div className="summary-chip"><i className="fa-solid fa-globe" /> {pageName}</div>
          </div>
        )}
      </section>

      {/* Step 4: Results Table */}
      {assets.length > 0 && (
        <section className="card">
          <div className="card-header">
            <div className="step-badge" style={{ background: 'linear-gradient(135deg,hsl(260,80%,60%),hsl(300,70%,60%))' }}>04</div>
            <div>
              <h2 className="card-title">Extracted Assets</h2>
              <p className="card-subtitle">Found {assets.length} assets on "{pageName}"</p>
            </div>
            <div className="result-actions">
              <button className="btn btn-secondary" onClick={exportCSV}><i className="fa-solid fa-file-csv" /> CSV</button>
              <button className="btn btn-extract" onClick={exportExcel}><i className="fa-solid fa-file-excel" /> Excel</button>
            </div>
          </div>
          <div className="table-toolbar">
            <div className="search-box">
              <i className="fa-solid fa-filter" />
              <input type="text" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by ID or type…" />
            </div>
            <div className="table-info">Showing {filteredAssets.length} of {assets.length} assets</div>
          </div>
          <div className="results-table-wrap">
            <table className="results-table">
              <thead>
                <tr>
                  {[
                    ['index', '#'], ['id', 'ID / Name'], ['type', 'Type'],
                    ['x', 'X'], ['y', 'Y'], ['width', 'W'], ['height', 'H'],
                  ].map(([key, label]) => (
                    <th key={key} onClick={() => toggleSort(key)}>
                      {label}<i className="fa-solid fa-sort sort-icon" />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedAssets.length === 0 ? (
                  <tr><td colSpan={7} className="table-empty"><i className="fa-solid fa-inbox" />No assets found</td></tr>
                ) : sortedAssets.map((a, i) => (
                  <tr key={i}>
                    <td className="cell-index">{a.index}</td>
                    <td className={`cell-id ${a.id ? '' : 'empty'}`}>{a.id || 'No ID'}</td>
                    <td><span className="cell-type"><i className={`fa-solid ${iconFor(a.type)}`} /> {a.type}</span></td>
                    <td className="cell-coord">{a.x}</td>
                    <td className="cell-coord">{a.y}</td>
                    <td className="cell-dim">{a.width || '-'}</td>
                    <td className="cell-dim">{a.height || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
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
