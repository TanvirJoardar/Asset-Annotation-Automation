const BASE = '';

async function request(url, options = {}) {
  const res = await fetch(`${BASE}${url}`, options);
  return res.json();
}

export const api = {
  getConfig: () => request('/api/config'),
  saveConfig: (cfg) => request('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  }),

  uploadFile: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return request('/api/upload', { method: 'POST', body: fd });
  },

  verify: (cfg) => request('/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  }),

  start: (cfg) => request('/api/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  }),

  stop: () => request('/api/stop', { method: 'POST' }),
  status: () => request('/api/status'),

  extractAssets: (cfg) => request('/api/extract-assets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  }),

  downloadExtracted: async (assets) => {
    const res = await fetch(`${BASE}/api/download-extracted`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assets }),
    });
    return res.blob();
  },
};

export function createLogStream(onMessage, onDone, onError) {
  const es = new EventSource('/api/stream');
  es.onmessage = (e) => {
    const item = JSON.parse(e.data);
    if (item.message === '__ping__') return;
    if (item.level === 'done') { onDone(); return; }
    onMessage(item);
  };
  es.onerror = () => { es.close(); onError(); };
  return es;
}
