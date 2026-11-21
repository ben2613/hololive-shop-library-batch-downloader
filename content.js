(function () {
  if (!/\/order_items\/\d+/.test(location.pathname)) return;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function isVisible(el) {
    return el && el.offsetParent !== null;
  }

  function menuOptionForFormat(root, formatKeyword) {
    const prefix = `${formatKeyword} ファイル`;
    const candidates = [...root.querySelectorAll('a, button, [role="menuitem"], li, span')].filter((el) => {
      if (!isVisible(el)) return false;
      const text = el.textContent.trim();
      if (!text.startsWith(prefix)) return false;
      const link = el.closest('a') || (el.tagName === 'A' ? el : el.querySelector('a[href]'));
      if (link?.href) return true;
      return el.children.length === 0;
    });
    return candidates[candidates.length - 1] || null;
  }

  async function dismissOpenMenus() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(80);
  }

  function createFloatingPanel() {
    if (document.getElementById('holo-batch-dl-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'holo-batch-dl-panel';
    Object.assign(panel.style, {
      position: 'fixed',
      right: '20px',
      bottom: '30px',
      zIndex: '99999',
      backgroundColor: 'rgba(28, 30, 34, 0.95)',
      border: '1px solid #3c4043',
      borderRadius: '10px',
      padding: '12px',
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
      display: 'none',
      flexDirection: 'column',
      gap: '8px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      minWidth: '150px'
    });

    const title = document.createElement('div');
    title.textContent = '語音批量下載';
    Object.assign(title.style, {
      color: '#e8eaed',
      fontSize: '12px',
      fontWeight: 'bold',
      textAlign: 'center',
      marginBottom: '2px'
    });

    const btnMp3 = createButton('下載全部 MP3', '#1a73e8', '#1557b0');
    const btnWav = createButton('下載全部 WAV', '#0f9d58', '#0b8043');

    const statusText = document.createElement('div');
    statusText.id = 'holo-batch-dl-status';
    statusText.textContent = '準備就緒';
    Object.assign(statusText.style, {
      color: '#9aa0a6',
      fontSize: '11px',
      textAlign: 'center',
      marginTop: '2px'
    });

    btnMp3.addEventListener('click', () => runBatchDownload('MP3', statusText, [btnMp3, btnWav]));
    btnWav.addEventListener('click', () => runBatchDownload('WAV', statusText, [btnMp3, btnWav]));

    panel.appendChild(title);
    panel.appendChild(btnMp3);
    panel.appendChild(btnWav);
    panel.appendChild(statusText);
    document.body.appendChild(panel);
  }

  function createButton(text, bgColor, hoverColor) {
    const btn = document.createElement('button');
    btn.textContent = text;
    Object.assign(btn.style, {
      backgroundColor: bgColor,
      color: '#ffffff',
      border: 'none',
      borderRadius: '6px',
      padding: '8px 12px',
      fontSize: '13px',
      fontWeight: '500',
      cursor: 'pointer',
      transition: 'background-color 0.15s'
    });
    btn.addEventListener('mouseenter', () => (btn.style.backgroundColor = hoverColor));
    btn.addEventListener('mouseleave', () => (btn.style.backgroundColor = bgColor));
    return btn;
  }

  async function runBatchDownload(formatKeyword, statusEl, buttons) {
    const icons = Array.from(document.querySelectorAll('div.action-icon')).filter(
      (el) => el.offsetParent !== null
    );

    if (icons.length === 0) {
      statusEl.textContent = '找不到下載圖示';
      return;
    }

    buttons.forEach((b) => {
      b.disabled = true;
      b.style.opacity = '0.6';
      b.style.cursor = 'not-allowed';
    });

    let successCount = 0;

    for (let i = 0; i < icons.length; i++) {
      statusEl.textContent = `下載中：${i + 1} / ${icons.length}`;
      const icon = icons[i];
      const trackRoot = icon.closest('div.track') || icon.parentElement || document.body;

      await dismissOpenMenus();
      icon.scrollIntoView({ behavior: 'auto', block: 'center' });
      await sleep(150);

      icon.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      icon.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
      icon.click();

      let targetOption = null;
      for (let attempt = 0; attempt < 30; attempt++) {
        await sleep(80);
        targetOption = menuOptionForFormat(trackRoot, formatKeyword);
        if (!targetOption) targetOption = menuOptionForFormat(document, formatKeyword);
        if (targetOption) break;
      }

      if (targetOption) {
        const link = targetOption.closest('a[href]') || targetOption.querySelector?.('a[href]');
        const clickable = link || targetOption.closest('li, [role="menuitem"], a, button') || targetOption;
        clickable.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        clickable.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        clickable.click();
        successCount++;
      }

      await dismissOpenMenus();
      await sleep(1800);
    }

    statusEl.textContent = `完成！(${successCount}/${icons.length})`;
    buttons.forEach((b) => {
      b.disabled = false;
      b.style.opacity = '1';
      b.style.cursor = 'pointer';
    });
  }

  createFloatingPanel();
  setInterval(() => {
    const panel = document.getElementById('holo-batch-dl-panel');
    if (!panel) return;
    const hasIcons = document.querySelectorAll('div.action-icon').length > 0;
    panel.style.display = hasIcons ? 'flex' : 'none';
  }, 1000);
})();