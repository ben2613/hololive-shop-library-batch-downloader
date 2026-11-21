const runtime = globalThis.browser?.runtime || globalThis.chrome?.runtime;

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

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
      // shortcut: Chrome MV3 SW often loses raw ArrayBuffer in sendResponse
      sendResponse({ ok: true, bufferB64: arrayBufferToBase64(buffer) });
    } catch (err) {
      sendResponse({ ok: false, error: err?.message || String(err) });
    }
  })();

  return true;
});