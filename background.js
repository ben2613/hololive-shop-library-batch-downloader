chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
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
      sendResponse({ ok: true, buffer });
    } catch (err) {
      sendResponse({ ok: false, error: err?.message || String(err) });
    }
  })();

  return true;
});