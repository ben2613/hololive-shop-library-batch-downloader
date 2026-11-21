/**
 * Parse order-item detail HTML (from fetch + credentials) for download metadata.
 * Phase 1: WAV is available without opening the action menu; MP3 is not in raw HTML.
 */
(function () {
  const global = typeof globalThis !== 'undefined' ? globalThis : window;

  function parseOrderItemHtml(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const productTitle = doc.querySelector('h4')?.textContent?.trim() || '';

    const files = [];
    for (const audio of doc.querySelectorAll('audio[data-file-id]')) {
      const fileId = audio.getAttribute('data-file-id');
      const orderId = audio.getAttribute('data-order-id');
      const itemId = audio.getAttribute('data-item-id');
      if (!fileId) continue;

      const wavUrl = audio.querySelector('source[type="audio/wav"]')?.src || '';
      const dlLinks = [
        ...doc.querySelectorAll(`a[href*="/apps/downloads/downloads/${fileId}"]`),
      ];
      const shopDownloadUrl = dlLinks[0]?.href || '';
      const trackTitle =
        audio.closest('div.track')?.querySelector('.track-name')?.textContent?.trim() ||
        dlLinks.find((a) => /\.wav/i.test(a.textContent))?.textContent?.trim().replace(/\.wav$/i, '') ||
        '';

      files.push({ fileId, orderId, itemId, trackTitle, wavUrl, shopDownloadUrl });
    }

    return {
      productTitle,
      files,
      mp3InHtml: /\.mp3/i.test(html),
      wavInHtml: /\.wav/i.test(html),
    };
  }

  async function fetchOrderItemPage(itemUrl) {
    const url = (itemUrl || '').split('#')[0].split('?')[0];
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    return { url, html, ...parseOrderItemHtml(html) };
  }

  /** Compare fetch-parse vs live DOM (opens first action-icon menu when present). */
  async function probeOrderItemDownloads(itemUrl) {
    const fetched = await fetchOrderItemPage(itemUrl);
    let liveMenuMp3 = '';
    let liveActionIcons = 0;
    if (location.pathname.includes('/order_items/')) {
      liveActionIcons = document.querySelectorAll('div.action-icon').length;
      const icon = document.querySelector('div.action-icon');
      if (icon) {
        icon.click();
        await new Promise((r) => setTimeout(r, 350));
        liveMenuMp3 =
          [...document.querySelectorAll('a')].find((a) => a.href?.includes('.mp3'))?.href || '';
      }
    }
    return {
      fetched: {
        productTitle: fetched.productTitle,
        fileCount: fetched.files.length,
        mp3InHtml: fetched.mp3InHtml,
        wavInHtml: fetched.wavInHtml,
        files: fetched.files.map((f) => ({
          fileId: f.fileId,
          trackTitle: f.trackTitle,
          hasWavUrl: !!f.wavUrl,
          hasShopDownloadUrl: !!f.shopDownloadUrl,
        })),
      },
      live: { actionIcons: liveActionIcons, menuMp3Found: !!liveMenuMp3 },
      conclusion:
        fetched.mp3InHtml || !liveMenuMp3
          ? fetched.mp3InHtml
            ? 'mp3_present_in_html'
            : 'mp3_likely_needs_menu_or_api'
          : 'mp3_only_after_menu',
    };
  }

  global.HoloOrderItemParse = { parseOrderItemHtml, fetchOrderItemPage, probeOrderItemDownloads };
})();