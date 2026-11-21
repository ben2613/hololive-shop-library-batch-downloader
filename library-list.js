(function () {
  if (!/^\/apps\/downloads\/orders\/\d+\/?$/.test(location.pathname)) return;

  const ext = typeof chrome !== 'undefined' ? chrome : typeof browser !== 'undefined' ? browser : null;

  injectStyles();

  const skyPilot = document.querySelector('.sky-pilot.rte, .sky-pilot');
  if (!skyPilot) return;

  const { filterAside, mainWrap } = wrapTwoColumn(skyPilot);
  widenLibraryPageShell();
  let filterHeightRaf = 0;
  function scheduleFilterPanelHeight() {
    cancelAnimationFrame(filterHeightRaf);
    filterHeightRaf = requestAnimationFrame(() => syncFilterPanelHeight(filterAside));
  }
  scheduleFilterPanelHeight();
  window.addEventListener('resize', scheduleFilterPanelHeight, { passive: true });
  window.addEventListener('scroll', scheduleFilterPanelHeight, { passive: true });
  const statusEl = filterAside.querySelector('#holo-lib-status');
  const searchInput = filterAside.querySelector('#holo-lib-search');
  const talentBox = filterAside.querySelector('#holo-lib-talent-list');
  const talentSearch = filterAside.querySelector('#holo-lib-talent-search');

  const ROOT_GROUP_ORDER = ['ホロライブ', 'ホロスターズ', 'HOLOSTARS English', 'COVER', '卒業'];
  let catalogTalentNames = [];

  (async () => {
    try {
      statusEl.textContent = '正在載入所有分頁…';
      await fetchAllPages(statusEl);
      indexListItems();
      const talentData = await loadTalentStructure();
      catalogTalentNames = buildCatalogTalentNames(talentData.tree);
      renderTalentCheckboxes(talentBox, talentData);
      markItemsTalentMatch();
      statusEl.textContent = `共 ${countItems()} 件（已合併全部分頁）`;
      applyFilters();
      if (location.hash === '#holo-dl-probe' && globalThis.HoloOrderItemParse) {
        const probeHref = document.querySelector('a.sky-pilot-list-item[href*="order_items"]')?.href;
        if (probeHref) {
          globalThis.HoloOrderItemParse.probeOrderItemDownloads(probeHref).then((report) => {
            console.log('[holo-dl-probe]', report);
            statusEl.textContent += ' · probe logged to console';
          });
        }
      }
    } catch (err) {
      statusEl.textContent = `載入失敗：${err.message}`;
      console.error('[holo-library]', err);
    } finally {
      clearNextLinkLoading();
    }
  })();

  const unmappedLink = filterAside.querySelector('#holo-lib-unmapped-link');
  let unmappedPopupDismissed = false;

  searchInput.addEventListener('input', applyFilters);
  talentSearch.addEventListener('input', () => filterTalentCheckboxRows(talentSearch.value));
  talentBox.addEventListener('change', () => {
    unmappedPopupDismissed = false;
    applyFilters();
  });
  unmappedLink.addEventListener('click', () => {
    unmappedPopupDismissed = false;
    updateUnmappedPopup(true, searchInput.value.trim().toLowerCase(), true);
  });

  const btnBatchWav = filterAside.querySelector('#holo-lib-dl-wav');
  const btnBatchMp3 = filterAside.querySelector('#holo-lib-dl-mp3');

  function visibleListItemLinks() {
    return [...document.querySelectorAll('.sky-pilot-files-list a.sky-pilot-list-item')].filter(
      (a) => a.style.display !== 'none'
    );
  }

  function buildFilterDownloadInfo() {
    const titleQuery = searchInput.value.trim();
    const talentNames = [
      ...new Set(
        [...talentBox.querySelectorAll('input[type="checkbox"]:checked')]
          .map((cb) => cb.dataset.nameJa)
          .filter(Boolean)
      ),
    ];
    return { titleQuery, talentNames };
  }

  const progressBox = () => filterAside.querySelector('#holo-lib-progress');
  const progressFill = () => filterAside.querySelector('#holo-lib-progress-fill');
  const progressTrack = () => filterAside.querySelector('#holo-lib-progress-track');
  const progressPct = () => filterAside.querySelector('#holo-lib-progress-pct');
  const progressText = () => filterAside.querySelector('#holo-lib-progress-text');

  function setBatchProgress(info) {
    const box = progressBox();
    const fill = progressFill();
    const track = progressTrack();
    const pctEl = progressPct();
    const textEl = progressText();
    if (!box || !fill) return;

    if (typeof info === 'string') {
      box.hidden = false;
      textEl.textContent = info;
      return;
    }

    const pct = Math.max(0, Math.min(100, info.pct ?? 0));
    box.hidden = false;
    fill.style.width = `${pct}%`;
    if (track) track.setAttribute('aria-valuenow', String(pct));
    if (pctEl) pctEl.textContent = `${pct}% `;
    if (textEl) {
      const t = info.text || '';
      textEl.textContent = t.length > 48 ? `${t.slice(0, 48)}…` : t;
      textEl.title = t.length > 48 ? t : '';
    }
  }

  function hideBatchProgress() {
    const box = progressBox();
    const fill = progressFill();
    if (box) box.hidden = true;
    if (fill) fill.style.width = '0%';
  }

  async function runLibraryZipBatch(format) {
    if (!globalThis.HoloLibraryBatchZip) {
      statusEl.textContent = 'ZIP モジュールが読み込まれていません';
      return;
    }
    const batchButtons = [btnBatchWav, btnBatchMp3];
    batchButtons.forEach((b) => {
      b.disabled = true;
    });
    setBatchProgress({ pct: 0, text: '開始…' });
    try {
      const result = await globalThis.HoloLibraryBatchZip.runFromVisibleItems(
        format,
        visibleListItemLinks,
        setBatchProgress,
        buildFilterDownloadInfo()
      );
      if (result?.cancelled) {
        statusEl.textContent = 'キャンセルしました';
        hideBatchProgress();
        return;
      }
      if (result?.stats) {
        const s = result.stats;
        setBatchProgress({ pct: 100, text: `完了 · ${s.filesOk} ファイル / ${s.products} 商品` });
        statusEl.textContent = `ZIP 完了 · ${s.filesOk} ファイル / ${s.products} 商品` + (s.filesFail ? ` · 失敗 ${s.filesFail}` : '');
      }
    } catch (err) {
      statusEl.textContent = `ZIP 失敗: ${err.message}`;
      console.error('[holo-library-batch]', err);
      hideBatchProgress();
    } finally {
      batchButtons.forEach((b) => {
        b.disabled = false;
      });
    }
  }

  btnBatchWav.addEventListener('click', () => runLibraryZipBatch('wav'));
  btnBatchMp3.addEventListener('click', () => runLibraryZipBatch('mp3'));

  function injectStyles() {
    if (document.getElementById('holo-library-styles')) return;
    const style = document.createElement('style');
    style.id = 'holo-library-styles';
    style.textContent = `
      #container:has(#holo-library-layout),
      .Container:has(#holo-library-layout),
      .holo-library-shell-wide.Container,
      #container.holo-library-shell-wide,
      .account.holo-library-shell-wide,
      .holo-library-shell-wide {
        max-width: min(1320px, calc(100vw - 40px)) !important;
        width: 100% !important;
        margin-left: auto !important;
        margin-right: auto !important;
        box-sizing: border-box;
      }
      .holo-library-layout {
        display: flex;
        gap: 20px;
        align-items: flex-start;
        width: 100%;
        max-width: min(1320px, calc(100vw - 40px));
        margin: 0 auto;
        text-align: left;
        box-sizing: border-box;
      }
      #holo-library-filter {
        flex: 0 0 280px;
        width: 280px;
        min-width: 280px;
        max-width: 280px;
        position: sticky;
        top: 16px;
        display: flex;
        flex-direction: column;
        padding: 14px;
        background: #f8f9fa;
        border: 1px solid #dadce0;
        border-radius: 10px;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 13px;
        box-sizing: border-box;
        overflow: hidden;
      }
      #holo-library-filter h3,
      #holo-library-filter > label.field-label,
      #holo-library-filter > input[type="text"],
      #holo-lib-unmapped-link,
      .holo-lib-batch,
      #holo-lib-status {
        flex-shrink: 0;
      }
      #holo-library-filter > * {
        min-width: 0;
        max-width: 100%;
      }
      #holo-library-filter h3 {
        margin: 0 0 10px;
        font-size: 14px;
      }
      #holo-library-filter label.field-label {
        display: block;
        margin: 10px 0 4px;
        color: #5f6368;
        font-size: 12px;
      }
      #holo-library-filter input[type="text"] {
        width: 100%;
        box-sizing: border-box;
        padding: 8px 10px;
        border: 1px solid #dadce0;
        border-radius: 6px;
      }
      #holo-lib-talent-list {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        border: 1px solid #dadce0;
        border-radius: 6px;
        padding: 6px 8px;
        background: #fff;
      }
      #holo-lib-talent-list label.row {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 3px 0;
        cursor: pointer;
        font-size: 12px;
      }
      #holo-lib-talent-list .holo-talent-count {
        color: #5f6368;
        font-size: 11px;
        font-variant-numeric: tabular-nums;
        flex-shrink: 0;
      }
      #holo-lib-talent-list label.row.hidden { display: none; }
      #holo-lib-talent-list .holo-talent-root { margin-bottom: 10px; }
      #holo-lib-talent-list .holo-talent-root.hidden,
      #holo-lib-talent-list .holo-talent-sub.hidden { display: none; }
      #holo-lib-talent-list .holo-talent-root-title {
        font-weight: 600;
        font-size: 12px;
        color: #202124;
        margin: 6px 0 4px;
        padding-top: 4px;
        border-top: 1px solid #e8eaed;
      }
      #holo-lib-talent-list .holo-talent-root:first-child .holo-talent-root-title {
        border-top: none;
        padding-top: 0;
        margin-top: 0;
      }
      #holo-lib-talent-list .holo-talent-sub-title {
        font-size: 11px;
        color: #5f6368;
        margin: 4px 0 2px 4px;
      }
      #holo-library-main {
        flex: 1;
        min-width: 0;
      }
      #holo-library-main .sky-pilot,
      #holo-library-layout .sky-pilot {
        max-width: none !important;
        width: 100% !important;
        margin-left: 0 !important;
        margin-right: 0 !important;
      }
      #holo-library-main .sky-pilot-files-list {
        width: 100%;
      }
      a.holo-next-loading {
        pointer-events: none;
        opacity: 0.85;
      }
      .holo-dl-spin {
        display: inline-block;
        animation: holo-spin 0.8s linear infinite;
      }
      @keyframes holo-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      #holo-lib-status {
        flex-shrink: 0;
        margin-top: 10px;
        color: #5f6368;
        font-size: 11px;
        line-height: 1.4;
        overflow: hidden;
        text-overflow: ellipsis;
        word-break: break-word;
        max-width: 100%;
      }
      #holo-unmapped-overlay {
        display: none;
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 100000;
        pointer-events: none;
        box-sizing: border-box;
      }
      #holo-unmapped-dialog {
        pointer-events: auto;
        width: min(380px, calc(100vw - 32px));
        max-height: min(70vh, 520px);
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        display: flex;
        flex-direction: column;
        font-family: system-ui, -apple-system, sans-serif;
        overflow: hidden;
      }
      #holo-unmapped-dialog header {
        padding: 14px 16px 10px;
        border-bottom: 1px solid #e8eaed;
        position: relative;
      }
      #holo-unmapped-dialog h4 {
        margin: 0 24px 6px 0;
        font-size: 14px;
        color: #202124;
      }
      #holo-unmapped-dialog .holo-unmapped-desc {
        margin: 0;
        font-size: 11px;
        color: #5f6368;
        line-height: 1.45;
      }
      #holo-unmapped-close {
        position: absolute;
        top: 10px;
        right: 10px;
        border: none;
        background: #f1f3f4;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
      }
      #holo-unmapped-clones {
        overflow-y: auto;
        padding: 12px 16px 16px;
        text-align: left;
      }
      #holo-unmapped-clones .holo-unmapped-clone {
        display: block !important;
        margin-bottom: 10px;
        padding: 10px;
        border: 1px solid #f9ab00;
        border-radius: 8px;
        background: #fef7e0;
        text-decoration: none;
        color: inherit;
      }
      #holo-unmapped-clones .sky-pilot-file-heading {
        font-size: 12px;
        font-weight: 500;
      }
      #holo-lib-unmapped-link {
        display: none;
        margin-top: 6px;
        padding: 0;
        border: none;
        background: none;
        color: #1a73e8;
        font-size: 11px;
        cursor: pointer;
        text-align: left;
        text-decoration: underline;
      }
      .holo-lib-batch {
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px solid #dadce0;
        width: 100%;
        min-width: 0;
        overflow: hidden;
      }
      .holo-lib-batch button {
        display: block;
        width: 100%;
        margin-top: 6px;
        padding: 8px 10px;
        border: none;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        color: #fff;
        cursor: pointer;
      }
      .holo-lib-batch button:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      #holo-lib-dl-wav { background: #0f9d58; }
      #holo-lib-dl-wav:hover:not(:disabled) { background: #0b8043; }
      #holo-lib-dl-mp3 { background: #1a73e8; }
      #holo-lib-dl-mp3:hover:not(:disabled) { background: #1557b0; }
      #holo-lib-progress {
        margin-top: 8px;
        width: 100%;
        min-width: 0;
        max-width: 100%;
        overflow: hidden;
      }
      #holo-lib-progress[hidden] {
        display: none !important;
      }
      #holo-lib-progress-track {
        height: 8px;
        background: #e8eaed;
        border-radius: 4px;
        overflow: hidden;
      }
      #holo-lib-progress-fill {
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, #0f9d58, #34a853);
        border-radius: 4px;
        transition: width 0.2s ease;
      }
      #holo-lib-progress-label {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 8px;
        margin-top: 5px;
        font-size: 10px;
        color: #5f6368;
        line-height: 1.35;
        width: 100%;
        min-width: 0;
        max-width: 100%;
      }
      #holo-lib-progress-pct {
        flex-shrink: 0;
        font-variant-numeric: tabular-nums;
        color: #188038;
        font-weight: 600;
      }
      #holo-lib-progress-text {
        flex: 1 1 0;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    `;
    document.head.appendChild(style);
  }

  const FILTER_STICKY_TOP_PX = 16;
  const FILTER_VIEWPORT_BOTTOM_PAD_PX = 16;
  const FILTER_PANEL_MIN_HEIGHT_PX = 280;

  function syncFilterPanelHeight(aside) {
    if (!aside) return;
    const top = Math.max(aside.getBoundingClientRect().top, FILTER_STICKY_TOP_PX);
    const h = Math.max(
      FILTER_PANEL_MIN_HEIGHT_PX,
      window.innerHeight - top - FILTER_VIEWPORT_BOTTOM_PAD_PX
    );
    aside.style.height = `${h}px`;
    aside.style.maxHeight = `${h}px`;
  }

  function wrapTwoColumn(skyPilotEl) {
    const layout = document.createElement('div');
    layout.id = 'holo-library-layout';
    layout.className = 'holo-library-layout';

    const filterAside = document.createElement('aside');
    filterAside.id = 'holo-library-filter';
    filterAside.innerHTML = `
      <h3>ライブラリーフィルター</h3>
      <label class="field-label" for="holo-lib-search">タイトル検索</label>
      <input type="text" id="holo-lib-search" placeholder="商品名の一部" autocomplete="off" />
      <label class="field-label" for="holo-lib-talent-search">タレント（複数可・OR）</label>
      <input type="text" id="holo-lib-talent-search" placeholder="タレント名で絞り込み" autocomplete="off" />
      <div id="holo-lib-talent-list"></div>
      <button type="button" id="holo-lib-unmapped-link"></button>
      <div class="holo-lib-batch">
        <span class="field-label">表示中の商品を ZIP</span>
        <button type="button" id="holo-lib-dl-wav">順次ダウンロード（WAV）</button>
        <button type="button" id="holo-lib-dl-mp3" disabled title="ZIP の MP3 は未対応。詳細ページの一括 MP3 を使用">順次ダウンロード（MP3・未対応）</button>
        <div id="holo-lib-progress" hidden>
          <div id="holo-lib-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100">
            <div id="holo-lib-progress-fill"></div>
          </div>
          <div id="holo-lib-progress-label">
            <span id="holo-lib-progress-pct"></span>
            <span id="holo-lib-progress-text"></span>
          </div>
        </div>
      </div>
      <div id="holo-lib-status">準備中…</div>
    `;

    const mainWrap = document.createElement('div');
    mainWrap.id = 'holo-library-main';

    skyPilotEl.parentNode.insertBefore(layout, skyPilotEl);
    mainWrap.appendChild(skyPilotEl);
    layout.appendChild(filterAside);
    layout.appendChild(mainWrap);

    return { filterAside, mainWrap };
  }

  function widenLibraryPageShell() {
    const layout = document.getElementById('holo-library-layout');
    if (!layout) return;
    const shells = [
      layout.closest('#container'),
      layout.closest('.Container'),
      layout.closest('.account'),
    ].filter(Boolean);
    for (const el of shells) {
      el.classList.add('holo-library-shell-wide');
    }
  }

  function findNextPageLink(root = document) {
    const loading = root.querySelector('a.holo-next-loading');
    if (loading) return loading;
    for (const a of root.querySelectorAll('a')) {
      if (/次のページへ/.test(a.textContent)) return a;
    }
    return null;
  }

  function listContainer(root = document) {
    return root.querySelector('.sky-pilot-files-list');
  }

  function itemHref(a) {
    try {
      return new URL(a.getAttribute('href'), location.origin).pathname;
    } catch {
      return a.getAttribute('href');
    }
  }

  function existingHrefs(list) {
    return new Set(
      [...list.querySelectorAll('a.sky-pilot-list-item, a[href*="/order_items/"]')].map(itemHref)
    );
  }

  function setNextLinkLoading(link, loading) {
    if (!link) return;
    if (loading) {
      link.classList.add('holo-next-loading');
      if (!link.dataset.holoOrigHtml) link.dataset.holoOrigHtml = link.innerHTML;
      link.innerHTML = '<span class="holo-dl-spin">⟳</span> 読み込み中…';
      return;
    }
    clearNextLinkLoading();
  }

  function clearNextLinkLoading() {
    const link = findNextPageLink(document);
    if (!link) return;
    link.classList.remove('holo-next-loading');
    link.style.pointerEvents = '';
    if (link.dataset.holoOrigHtml) {
      link.innerHTML = link.dataset.holoOrigHtml;
      delete link.dataset.holoOrigHtml;
    }
  }

  function finishPaginationUi() {
    clearNextLinkLoading();
    hidePagination(document);
  }

  function hidePagination(root = document) {
    const next = root.querySelector('a.holo-next-loading') || findNextPageLink(root);
    if (next) {
      const block = next.closest('p, div, nav, .pagination') || next;
      block.style.display = 'none';
    }
    for (const a of root.querySelectorAll('a')) {
      if (/前のページ/.test(a.textContent)) {
        const block = a.closest('p, div, nav') || a;
        block.style.display = 'none';
      }
    }
  }

  function nextPageUrl(root = document) {
    const link = findNextPageLink(root);
    return link ? new URL(link.getAttribute('href'), location.origin).href : null;
  }

  async function fetchAllPages(statusEl) {
    const list = listContainer();
    if (!list) throw new Error('找不到 .sky-pilot-files-list');

    const hrefs = existingHrefs(list);
    let url = nextPageUrl(document);
    let page = 1;
    const footerNext = () => findNextPageLink(document);

    while (url) {
      page += 1;
      setNextLinkLoading(footerNext(), true);
      statusEl.textContent = `正在載入第 ${page} 頁…`;

      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status} (${url})`);
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');

      for (const a of doc.querySelectorAll('.sky-pilot-files-list a.sky-pilot-list-item')) {
        const href = itemHref(a);
        if (hrefs.has(href)) continue;
        hrefs.add(href);
        list.appendChild(a.cloneNode(true));
      }

      url = nextPageUrl(doc);
    }

    finishPaginationUi();
  }

  function indexListItems() {
    for (const a of document.querySelectorAll('.sky-pilot-files-list a.sky-pilot-list-item')) {
      const title =
        a.querySelector('.sky-pilot-file-heading')?.textContent.trim() ||
        a.textContent.trim().replace(/\s+/g, ' ');
      a.dataset.holoTitle = title;
    }
  }

  // shortcut: shop titles (NFC ベ) vs JSON from DOM scrape (NFD ヘ+゙) — normalize before compare
  function normalizeForMatch(str) {
    return (str || '').normalize('NFKC');
  }

  const TALENT_MATCH_PREFIX_RE = /【(?:卒業|配信活動終了|退職)】/g;

  function stripForTalentMatch(str) {
    return normalizeForMatch(str).replace(TALENT_MATCH_PREFIX_RE, '');
  }

  function normalizedIncludes(haystack, needle) {
    if (!needle) return true;
    const h = stripForTalentMatch(haystack).toLowerCase();
    const n = stripForTalentMatch(needle).toLowerCase();
    return h.includes(n);
  }

  function buildCatalogTalentNames(tree) {
    const names = new Set();
    for (const subs of Object.values(tree || {})) {
      for (const list of Object.values(subs)) {
        for (const t of list) {
          if (t.name_ja) names.add(t.name_ja);
          if (t.name_en) names.add(t.name_en);
        }
      }
    }
    return [...names];
  }

  function titleHasCatalogTalent(title) {
    if (!title || !catalogTalentNames.length) return false;
    return catalogTalentNames.some((name) => normalizedIncludes(title, name));
  }

  function markItemsTalentMatch() {
    for (const a of document.querySelectorAll('.sky-pilot-files-list a.sky-pilot-list-item')) {
      const title = a.dataset.holoTitle || '';
      if (titleHasCatalogTalent(title)) {
        delete a.dataset.holoNoTalent;
      } else {
        a.dataset.holoNoTalent = '1';
      }
    }
  }

  function getUnmappedItems(textQuery) {
    const q = textQuery || '';
    const rawQ = searchInput.value.trim();
    return [...document.querySelectorAll('.sky-pilot-files-list a.sky-pilot-list-item')].filter((a) => {
      if (a.dataset.holoNoTalent !== '1') return false;
      if (!q && !rawQ) return true;
      const title = a.dataset.holoTitle || '';
      return normalizedIncludes(title, q) || (rawQ && normalizedIncludes(title, rawQ));
    });
  }

  function ensureUnmappedPopup() {
    let overlay = document.getElementById('holo-unmapped-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'holo-unmapped-overlay';
    overlay.innerHTML = `
      <div id="holo-unmapped-dialog" role="complementary" aria-live="polite">
        <header>
          <button type="button" id="holo-unmapped-close" aria-label="閉じる">×</button>
          <h4>タレント名が含まれない商品</h4>
          <p class="holo-unmapped-desc">
            タイトルに <code>talent-structure.json</code> のいずれのタレント名も含まれないため、タレント絞り込みではヒットしません（ユニット名・セット名のみ等）。
            <strong class="holo-unmapped-count"></strong>
          </p>
        </header>
        <div id="holo-unmapped-clones"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#holo-unmapped-close').addEventListener('click', () => {
      unmappedPopupDismissed = true;
      overlay.style.display = 'none';
    });
    return overlay;
  }

  function updateUnmappedPopup(talentFilterOn, textQuery, forceOpen) {
    const unmapped = getUnmappedItems(textQuery);
    const link = filterAside.querySelector('#holo-lib-unmapped-link');

    if (!talentFilterOn || unmapped.length === 0) {
      link.style.display = 'none';
      const overlay = document.getElementById('holo-unmapped-overlay');
      if (overlay) overlay.style.display = 'none';
      return;
    }

    link.style.display = 'block';
    link.textContent = `タレント名なし ${unmapped.length} 件を表示`;

    const overlay = ensureUnmappedPopup();
    const container = overlay.querySelector('#holo-unmapped-clones');
    const countEl = overlay.querySelector('.holo-unmapped-count');
    countEl.textContent = ` ${unmapped.length} 件`;
    container.innerHTML = '';

    for (const a of unmapped) {
      const clone = a.cloneNode(true);
      clone.classList.add('holo-unmapped-clone');
      clone.style.display = '';
      container.appendChild(clone);
    }

    if (!unmappedPopupDismissed || forceOpen) {
      overlay.style.display = 'block';
      if (forceOpen) unmappedPopupDismissed = false;
    }
  }

  function countItems() {
    return document.querySelectorAll('.sky-pilot-files-list a.sky-pilot-list-item').length;
  }

  async function loadTalentStructure() {
    if (!ext?.runtime?.getURL) return { rootGroups: ROOT_GROUP_ORDER, tree: {} };
    const res = await fetch(ext.runtime.getURL('talent-structure.json'));
    if (!res.ok) return { rootGroups: ROOT_GROUP_ORDER, tree: {} };
    const data = await res.json();
    const order = data.rootGroups?.length ? data.rootGroups : ROOT_GROUP_ORDER;
    return { rootGroups: order, tree: data.tree || {} };
  }

  function renderTalentCheckboxes(container, { rootGroups, tree }) {
    container.innerHTML = '';
    for (const root of rootGroups) {
      const subs = tree[root];
      if (!subs) continue;

      const rootEl = document.createElement('div');
      rootEl.className = 'holo-talent-root';

      const rootTitle = document.createElement('div');
      rootTitle.className = 'holo-talent-root-title';
      rootTitle.textContent = root;
      rootEl.appendChild(rootTitle);

      for (const [subName, talents] of Object.entries(subs)) {
        if (!talents?.length) continue;

        const subEl = document.createElement('div');
        subEl.className = 'holo-talent-sub';

        const subTitle = document.createElement('div');
        subTitle.className = 'holo-talent-sub-title';
        subTitle.textContent = subName;
        subEl.appendChild(subTitle);

        for (const t of talents) {
          const label = document.createElement('label');
          label.className = 'row';
          label.dataset.talentLabel = `${t.name_ja} ${t.name_en || ''}`.toLowerCase();
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.value = t.handle;
          cb.dataset.nameJa = t.name_ja;
          cb.dataset.nameEn = t.name_en || '';
          const span = document.createElement('span');
          span.className = 'holo-talent-name';
          span.textContent = t.name_ja;
          const countSpan = document.createElement('span');
          countSpan.className = 'holo-talent-count';
          countSpan.textContent = '';
          label.appendChild(cb);
          label.appendChild(span);
          label.appendChild(countSpan);
          subEl.appendChild(label);
        }

        rootEl.appendChild(subEl);
      }

      if (rootEl.querySelector('.holo-talent-sub')) container.appendChild(rootEl);
    }
  }

  function filterTalentCheckboxRows(query) {
    const q = query.trim().toLowerCase();
    for (const label of talentBox.querySelectorAll('label.row')) {
      const hay = label.dataset.talentLabel || '';
      label.classList.toggle('hidden', q && !hay.includes(q));
    }
    for (const sub of talentBox.querySelectorAll('.holo-talent-sub')) {
      const anyVisible = [...sub.querySelectorAll('label.row')].some((l) => !l.classList.contains('hidden'));
      sub.classList.toggle('hidden', q && !anyVisible);
    }
    for (const root of talentBox.querySelectorAll('.holo-talent-root')) {
      const anyVisible = [...root.querySelectorAll('.holo-talent-sub')].some((s) => !s.classList.contains('hidden'));
      root.classList.toggle('hidden', q && !anyVisible);
    }
  }

  function selectedTalentNames() {
    return [...talentBox.querySelectorAll('input[type="checkbox"]:checked')].flatMap((cb) => {
      const names = [cb.dataset.nameJa, cb.dataset.nameEn].filter(Boolean);
      return names;
    });
  }

  function countProductsForTalent(names, titleQuery) {
    const needles = names.filter(Boolean);
    if (!needles.length) return 0;
    const q = titleQuery || '';
    let n = 0;
    for (const a of document.querySelectorAll('.sky-pilot-files-list a.sky-pilot-list-item')) {
      const title = a.dataset.holoTitle || '';
      if (q && !normalizedIncludes(title, q)) continue;
      if (needles.some((name) => normalizedIncludes(title, name))) n += 1;
    }
    return n;
  }

  function updateTalentProductCounts(titleQuery) {
    for (const label of talentBox.querySelectorAll('label.row')) {
      const cb = label.querySelector('input[type="checkbox"]');
      const countEl = label.querySelector('.holo-talent-count');
      if (!cb || !countEl) continue;
      const n = countProductsForTalent([cb.dataset.nameJa, cb.dataset.nameEn], titleQuery);
      countEl.textContent = `(${n})`;
    }
  }

  function applyFilters() {
    const q = searchInput.value.trim();
    const talentNames = selectedTalentNames();
    let visible = 0;

    for (const a of document.querySelectorAll('.sky-pilot-files-list a.sky-pilot-list-item')) {
      const title = a.dataset.holoTitle || '';
      const textOk = !q || normalizedIncludes(title, q);
      const talentOk =
        talentNames.length === 0 || talentNames.some((name) => normalizedIncludes(title, name));
      const show = textOk && talentOk;
      a.style.display = show ? '' : 'none';
      if (show) visible += 1;
    }

    const total = countItems();
    const unmappedTotal = getUnmappedItems('').length;
    statusEl.textContent =
      talentNames.length || q
        ? `顯示 ${visible} / ${total} 件`
        : `共 ${total} 件（已合併全部分頁）`;
    if (unmappedTotal > 0 && !talentNames.length) {
      statusEl.textContent += ` · タレント名なし ${unmappedTotal} 件`;
    }

    updateUnmappedPopup(talentNames.length > 0, q);
    updateTalentProductCounts(q);
  }
})();