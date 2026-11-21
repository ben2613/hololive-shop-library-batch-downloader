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

  function base64ToArrayBuffer(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  function coerceArrayBuffer(res) {
    if (res?.bufferB64) return base64ToArrayBuffer(res.bufferB64);
    const data = res?.buffer;
    if (data instanceof ArrayBuffer) return data;
    if (ArrayBuffer.isView(data)) {
      return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    }
    return null;
  }

  function concatChunks(chunks, totalBytes) {
    const out = new Uint8Array(totalBytes);
    let off = 0;
    for (const c of chunks) {
      out.set(c, off);
      off += c.byteLength;
    }
    return out.buffer;
  }

  function fetchViaPort(url, credentials) {
    if (!extApi?.runtime?.connect) return Promise.reject(new Error('port fetch unavailable'));
    return new Promise((resolve, reject) => {
      const port = extApi.runtime.connect({ name: 'HOLO_FETCH_BLOB' });
      const chunks = [];
      let total = 0;
      let settled = false;

      const finish = (err, buf) => {
        if (settled) return;
        settled = true;
        try {
          port.disconnect();
        } catch (_e) {
          /* ignore */
        }
        if (err) reject(err);
        else resolve(buf);
      };

      port.onMessage.addListener((msg) => {
        if (msg?.type === 'chunk' && msg.data?.byteLength) {
          chunks.push(msg.data);
          total += msg.data.byteLength;
        } else if (msg?.type === 'done') {
          if (!total) finish(new Error('empty response'));
          else finish(null, concatChunks(chunks, total));
        } else if (msg?.type === 'error') {
          finish(new Error(msg.error || 'port fetch failed'));
        }
      });

      port.onDisconnect.addListener(() => {
        if (!settled) finish(new Error('background port closed'));
      });

      port.postMessage({ type: 'start', url, credentials });
    });
  }

  async function fetchViaExtension(url, credentials) {
    let lastErr = new Error('extension fetch failed');
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (attempt) await sleep(250 * attempt);
      let res;
      try {
        res = await extApi.runtime.sendMessage({
          type: 'HOLO_FETCH_BLOB',
          url,
          credentials,
        });
      } catch (err) {
        lastErr = err;
        continue;
      }
      if (res === undefined) {
        lastErr = new Error('background が応答しません（再試行中…）');
        continue;
      }
      if (!res?.ok) {
        lastErr = new Error(res.error || 'extension fetch failed');
        continue;
      }
      const buf = coerceArrayBuffer(res);
      if (!buf?.byteLength) {
        lastErr = new Error('empty or invalid buffer from background');
        continue;
      }
      return buf;
    }
    throw lastErr;
  }

  /** Background fetch; port chunks avoid Chrome MV3 one-shot message size limits. */
  async function fetchBinary(url) {
    const shop = /hololivepro\.com/i.test(url);
    if (extApi?.runtime?.connect) {
      try {
        return await fetchViaPort(url, shop);
      } catch (err) {
        console.warn('[holo-batch] port fetch', err);
      }
    }
    if (extApi?.runtime?.sendMessage) {
      return fetchViaExtension(url, shop);
    }
    const res = await fetch(url, { credentials: shop ? 'include' : 'omit', redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    if (!buf.byteLength) throw new Error('empty response');
    return buf;
  }

  async function streamZipToWritable(zip, writable, onProgress) {
    const writer = writable.getWriter();
    try {
      await new Promise((resolve, reject) => {
        const stream = zip.generateInternalStream({ type: 'uint8array', compression: 'STORE' });
        let chain = Promise.resolve();
        stream.on('error', reject);
        stream.on('data', (chunk) => {
          chain = chain.then(() => writer.write(chunk));
        });
        stream.on('end', () => {
          chain.then(resolve).catch(reject);
        });
        if (onProgress) onProgress({ pct: 98, text: 'ZIP をストリーム書き込み…' });
        stream.resume();
      });
      // writer.close() commits the file; do not call writable.close() while locked
      await writer.close();
    } catch (err) {
      try {
        await writer.abort(err);
      } catch (_e) {
        /* ignore */
      }
      throw err;
    }
  }

  async function buildFilteredZip(itemLinks, format, opts = {}) {
    const JSZip = globalThis.JSZip;
    if (!JSZip) throw new Error('JSZip not loaded');
    const fetchPage = globalThis.HoloOrderItemParse?.fetchOrderItemPage;
    if (!fetchPage) throw new Error('HoloOrderItemParse not loaded');

    const delayProduct = opts.delayProductMs ?? 1200;
    const delayFile = opts.delayFileMs ?? 600;
    const onProgress = opts.onProgress || (() => {});
    const productTotal = itemLinks.length;

    function reportProgress(pi, fileIndex, fileCount, text) {
      const share = 90 / Math.max(productTotal, 1);
      const inner = fileCount > 0 ? (fileIndex + 0.5) / fileCount : 0.2;
      const pct = Math.min(95, Math.round(5 + (pi + inner) * share));
      onProgress({ pct, text });
    }

    const zip = new JSZip();
    const stats = { products: 0, filesOk: 0, filesFail: 0 };

    onProgress({ pct: 2, text: `商品 0 / ${productTotal} 準備中…` });

    for (let pi = 0; pi < itemLinks.length; pi++) {
      const link = itemLinks[pi];
      const href = link.href.split('?')[0];
      const listTitle = link.dataset.holoTitle || link.textContent.trim();
      reportProgress(pi, 0, 1, `商品 ${pi + 1}/${productTotal}: ${listTitle.slice(0, 32)}…`);

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
      const files = page.files || [];
      let fi = 0;

      for (const file of files) {
        const url = pickDownloadUrl(file, format);
        if (!url) {
          stats.filesFail += 1;
          continue;
        }
        reportProgress(
          pi,
          fi,
          files.length,
          `商品 ${pi + 1}/${productTotal} · ファイル ${fi + 1}/${files.length || 1}`
        );
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
        fi += 1;
      }
      await sleep(delayProduct);
    }

    if (stats.filesOk === 0) throw new Error('ダウンロードできたファイルがありません');

    if (opts.zipWritable) {
      await streamZipToWritable(zip, opts.zipWritable, onProgress);
      onProgress({ pct: 100, text: '保存完了' });
      return { stats, streamed: true };
    }

    onProgress({ pct: 97, text: 'ZIP を生成中…' });
    const blob = await zip.generateAsync(
      { type: 'blob', compression: 'STORE' },
      (meta) => {
        const pct = 97 + Math.round(meta.percent / 100) * 2;
        onProgress({ pct: Math.min(99, pct), text: `ZIP を生成中… ${Math.round(meta.percent)}%` });
      }
    );
    onProgress({ pct: 100, text: 'ダウンロード準備完了' });
    return { blob, stats };
  }

  function safeFileToken(str, maxLen = 36) {
    return (str || '')
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, maxLen);
  }

  function buildZipFileName(format, filterInfo = {}) {
    const stamp = new Date().toISOString().slice(0, 10);
    const segments = ['hololive-library', format, stamp];
    const q = filterInfo.titleQuery?.trim();
    if (q) segments.push(`q-${safeFileToken(q, 28)}`);
    const talents = filterInfo.talentNames || [];
    if (talents.length) {
      const shown = talents.slice(0, 2).map((n) => safeFileToken(n, 24));
      let block = `talent-${shown.join('_')}`;
      if (talents.length > 2) block += `_+${talents.length - 2}`;
      segments.push(block);
    }
    if (!q && !talents.length && filterInfo.itemCount) {
      segments.push(`${filterInfo.itemCount}items`);
    }
    let name = `${segments.join('-')}.zip`;
    if (name.length > 200) name = `${name.slice(0, 196)}.zip`;
    return name;
  }

  function saveZipBlob(blob, format, filterInfo) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = buildZipFileName(format, filterInfo);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 120_000);
  }

  async function runFromVisibleItems(format, getVisibleLinks, onProgress, filterInfo) {
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

    const filterMeta = { ...filterInfo, itemCount: items.length };
    const buildOpts = { onProgress };
    const zipName = buildZipFileName(format, filterMeta);

    if (typeof window.showSaveFilePicker === 'function') {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: zipName,
          types: [{ description: 'ZIP archive', accept: { 'application/zip': ['.zip'] } }],
        });
        buildOpts.zipWritable = await handle.createWritable();
      } catch (err) {
        if (err?.name === 'AbortError') return { cancelled: true };
        console.warn('[holo-batch] showSaveFilePicker', err);
      }
    }

    const result = await buildFilteredZip(items, format, buildOpts);
    if (result.blob) saveZipBlob(result.blob, format, filterMeta);
    return { cancelled: false, stats: result.stats, streamed: !!result.streamed };
  }

  globalThis.HoloLibraryBatchZip = { runFromVisibleItems, buildFilteredZip };
})();