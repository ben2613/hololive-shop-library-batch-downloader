document.getElementById('dlMp3').addEventListener('click', () => startAutoClick('MP3'));
document.getElementById('dlWav').addEventListener('click', () => startAutoClick('WAV'));

async function startAutoClick(formatKeyword) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: autoDownloadScript,
    args: [formatKeyword]
  });

  window.close();
}

async function autoDownloadScript(formatKeyword) {
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const icons = Array.from(document.querySelectorAll('div.action-icon')).filter(el => el.offsetParent !== null);

  if (icons.length === 0) {
    alert('找不到下載圖示，請確認是否在正確的語音列表頁面。');
    return;
  }

  let successCount = 0;

  for (let i = 0; i < icons.length; i++) {
    const icon = icons[i];
    // 1. 瞬移捲動，等待時間縮短為 50 毫秒
    icon.scrollIntoView({ behavior: 'instant', block: 'center' });
    await sleep(50);

    // 2. 點擊下載圖示
    icon.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    icon.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    icon.click();

    // 3. 高頻率偵測選單（每 50 毫秒檢查一次，一出現立刻點擊，不浪費時間等待）
    let targetOption = null;
    for (let attempt = 0; attempt < 30; attempt++) {
      await sleep(50);
      
      const allMatches = Array.from(document.querySelectorAll('li, div, span, a, button')).filter(el => {
        if (el.offsetParent === null) return false;
        const text = el.textContent.trim();
        return text === `${formatKeyword} ファイル` && el.children.length === 0;
      });

      if (allMatches.length > 0) {
        targetOption = allMatches[allMatches.length - 1];
        break;
      }
    }

    if (targetOption) {
      const clickable = targetOption.closest('li, [role="menuitem"], a, button') || targetOption;
      clickable.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      clickable.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
      clickable.click();
      successCount++;
    }

    // 4. 間隔大幅縮短為 400 毫秒（0.4 秒），兼顧極速與穩定性
    await sleep(1500);
  }

  alert(`極速下載完成！共成功觸發 ${successCount} / ${icons.length} 首「${formatKeyword} ファイル」下載！`);
}