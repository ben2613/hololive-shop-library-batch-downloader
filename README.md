# Hololive 語音批量下載器

Browser extension for batch-downloading voice files on [shop.hololivepro.com](https://shop.hololivepro.com).

## Quick start

1. **Chrome / Edge / Brave:** `chrome://extensions` → Developer mode → **Load unpacked** → this `BatchDownloader` folder.
2. **Firefox:** `about:debugging` → **This Firefox** → **Load Temporary Add-on** → `manifest.json` in this folder.
3. Log in to the shop, open your **digital library** (`/apps/downloads/orders/{customerId}`) or an **order item** detail page.
4. Reload the tab after you reload the extension.

## What it does (short)

| Page | Behavior |
|------|----------|
| **Library list** | Merge all pages, filter by title + talent, **WAV ZIP** for visible rows |
| **Order item detail** | Floating panel — sequential **MP3 / WAV** via the shop download menu |

MP3 **library ZIP** is not supported (signed URLs only after the per-track menu). Use the detail-page panel for MP3.

## Documentation

| Doc | Contents |
|-----|----------|
| [docs/features.md](docs/features.md) | Files in the repo, library UI, detail UI, which script runs where |
| [docs/library-batch.md](docs/library-batch.md) | Phases 1–3, ZIP workflow, probe / debugging, Chrome background fetch |
| [docs/talent-structure.md](docs/talent-structure.md) | Regenerating `talent-structure.json` from `/pages/talent` |
| [docs/install.md](docs/install.md) | Dev install, `background.js` / Firefox vs Chromium |

## Credits

Initial project was done by **DW**, with **Google Gemini**.