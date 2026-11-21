const runtime = globalThis.browser?.runtime || globalThis.chrome?.runtime;

const PORT_FETCH = 'HOLO_FETCH_BLOB';

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function streamFetchToPort(port, url, credentials) {
  const res = await fetch(url, {
    credentials: credentials ? 'include' : 'omit',
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!res.body) {
    const buf = await res.arrayBuffer();
    if (buf.byteLength) port.postMessage({ type: 'chunk', data: new Uint8Array(buf) });
  } else {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.byteLength) port.postMessage({ type: 'chunk', data: value });
    }
  }
  port.postMessage({ type: 'done' });
}

runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_FETCH) return;

  port.onMessage.addListener((msg) => {
    if (msg?.type !== 'start') return;
    (async () => {
      try {
        await streamFetchToPort(port, msg.url, msg.credentials);
      } catch (err) {
        port.postMessage({ type: 'error', error: err?.message || String(err) });
      }
    })();
  });
});

runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'HOLO_FETCH_BLOB') return;

  (async () => {
    try {
      const res = await fetch(msg.url, {
        credentials: msg.credentials ? 'include' : 'omit',
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buffer = await res.arrayBuffer();
      if (!buffer.byteLength) throw new Error('empty response');
      // fallback path for browsers without runtime.connect chunking
      sendResponse({ ok: true, bufferB64: arrayBufferToBase64(buffer) });
    } catch (err) {
      sendResponse({ ok: false, error: err?.message || String(err) });
    }
  })();

  return true;
});