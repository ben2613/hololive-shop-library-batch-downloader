(function () {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function safeName(str, fallback) {
    const s = (str || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim();
    return (s || fallback).slice(0, 100);
  }

  function pickDownloadUrl(file, format) {
    if (format === 'wav') return file.shopDownloadUrl || file.wavUrl || '';
    return '';
  }

  const extApi = typeof chrome !== 'undefined' ? chrome : typeof browser !== 'undefined' ? browser : null;

  function coerceArrayBuffer(data) {
    if (data instanceof ArrayBuffer) return data;
    if (ArrayBuffer.isView(data)) {
      return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    }
    return null;
  }

  async function fetchViaExtension(url, credentials) {
    const res = await extApi.runtime.sendMessage({
      type: 'HOLO_FETCH_BLOB',
      url,
      credentials,
    });
    if (!res?.ok) throw new Error(res?.error || 'extension fetch failed');
    const buf = coerceArrayBuffer(res.buffer);
    if (!buf?.byteLength) throw new Error('empty or invalid buffer from background');
    return buf;
  }

  /** Always use extension background (avoids CORS after shop → CloudFront redirect). */
  async function fetchBinary(url) {
    const shop = /hololivepro\.com/i.test(url);
    if (extApi?.runtime?.sendMessage) {
      return fetchViaExtension(url, shop);
    }
    const res = await fetch(url, { credentials: shop ? 'include' : 'omit', redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    if (!buf.byteLength) throw new Error('empty response');
    return buf;
  }

  async function buildFilteredZip(itemLinks, format, opts = {}) {
    const JSZip = globalThis.JSZip;
    if (!JSZip) throw new Error('JSZip not loaded');
    const fetchPage = globalThis.HoloOrderItemParse?.fetchOrderItemPage;
    if (!fetchPage) throw new Error('HoloOrderItemParse not loaded');

    const delayProduct = opts.delayProductMs ?? 1200;
    const delayFile = opts.delayFileMs ?? 600;
    const onProgress = opts.onProgress || (() => {});

    const zip = new JSZip();
    const stats = { products: 0, filesOk: 0, filesFail: 0 };

    for (let pi = 0; pi < itemLinks.length; pi++) {
      const link = itemLinks[pi];
      const href = link.href.split('?')[0];
      const listTitle = link.dataset.holoTitle || link.textContent.trim();
      onProgress(`商品 ${pi + 1}/${itemLinks.length}: ${listTitle.slice(0, 36)}…`);

      let page;
      try {
        page = await fetchPage(href);
      } catch (err) {
        console.warn('[holo-batch] page', href, err);
        stats.filesFail += 1;
        await sleep(delayProduct);
        continue;
      }

      const folder = safeName(page.productTitle || listTitle, `product_${pi + 1}`);
      stats.products += 1;
      const usedPaths = new Set();

      for (const file of page.files) {
        const url = pickDownloadUrl(file, format);
        if (!url) {
          stats.filesFail += 1;
          continue;
        }
        onProgress(`商品 ${pi + 1}/${itemLinks.length} · file ${file.fileId}`);
        try {
          const binary = await fetchBinary(url);
          let base = safeName(file.trackTitle, `file_${file.fileId}`);
          const ext = `.${format}`;
          if (!base.toLowerCase().endsWith(ext)) base += ext;
          let zipPath = `${folder}/${base}`.normalize('NFC');
          let n = 2;
          while (usedPaths.has(zipPath)) {
            zipPath = `${folder}/${safeName(file.trackTitle, `file_${file.fileId}`)}_${n}${ext}`.normalize(
              'NFC'
            );
            n += 1;
          }
          usedPaths.add(zipPath);
          zip.file(zipPath, binary, { binary: true });
          stats.filesOk += 1;
        } catch (err) {
          console.warn('[holo-batch] file', file.fileId, err);
          stats.filesFail += 1;
        }
        await sleep(delayFile);
      }
      await sleep(delayProduct);
    }

    if (stats.filesOk === 0) throw new Error('ダウンロードできたファイルがありません');

    onProgress('ZIP を生成中…');
    const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    return { blob, stats };
  }

  function saveZipBlob(blob, format) {
    const stamp = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hololive-library-${format}-${stamp}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 120_000);
  }

  async function runFromVisibleItems(format, getVisibleLinks, onProgress) {
    const items = getVisibleLinks();
    if (!items.length) throw new Error('表示中の商品がありません');

    if (format === 'mp3') {
      throw new Error('ライブラリ ZIP の MP3 は未対応です（CORS・署名 URL）。WAV を使うか、商品詳細ページの一括ボタンを使ってください。');
    }

    if (items.length > 10) {
      const ok = confirm(
        `表示中の商品は ${items.length} 件です（10 件超）。順次ダウンロードのため時間がかかり、サーバー負荷も大きくなります。\n続行しますか？`
      );
      if (!ok) return { cancelled: true };
    }

    const { blob, stats } = await buildFilteredZip(items, format, { onProgress });
    saveZipBlob(blob, format);
    return { cancelled: false, stats };
  }

  globalThis.HoloLibraryBatchZip = { runFromVisibleItems, buildFilteredZip };
})();