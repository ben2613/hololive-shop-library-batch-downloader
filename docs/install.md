# Install (development)

1. `chrome://extensions` or `about:debugging` → load unpacked / temporary add-on  
2. Select this `BatchDownloader` folder (or `manifest.json` on Firefox)  
3. **Library list** (`/apps/downloads/orders/{customer_id}`): filters and ZIP batch run automatically  
4. **Detail pages** (`.../order_items/...`): floating MP3/WAV panel from `content.js`

After changing `manifest.json` or any script, **reload the extension**, then reload the shop tab.

## Background script (browser difference)

Library ZIP downloads call `background.js` to fetch CloudFront without page CORS.

| Browser | Notes |
|---------|--------|
| **Chrome / Edge / Brave** | `manifest.json` uses MV3 `"service_worker": "background.js"`. |
| **Firefox** | Recent Firefox (MV3) also accepts `service_worker`. If an older build only allows `background.scripts`, temporarily replace the `background` block with `"scripts": ["background.js"]` (not valid in Chrome). |

Large files use **`runtime.connect`** chunk streaming when possible; `sendMessage` + base64 is the fallback. See [library-batch.md](library-batch.md).