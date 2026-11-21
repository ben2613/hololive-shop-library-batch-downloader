# Features & file map

## What this repo includes (v3.1)

| File | Role |
|------|------|
| `manifest.json` | MV3 content scripts on `*.hololivepro.com` |
| `content.js` | Floating panel on **order item** detail pages: sequential click-through download for all tracks (MP3 / WAV) |
| `library-list.js` | **Digital library** list (`/apps/downloads/orders/{customerId}`): merge all pagination, two-column layout, filters |
| `order-item-parse.js` | `fetch` + parse order-item HTML for WAV URLs / file IDs (`HoloOrderItemParse`) |
| `library-batch-download.js` | Filtered library → sequential fetch → ZIP (`HoloLibraryBatchZip`) |
| `background.js` | Extension-origin fetch for CloudFront (CORS bypass) |
| `vendor/jszip.min.js` | JSZip 3.10.1 (bundled) |
| `talent-structure.json` | Talent tree for library filters ([regenerate](talent-structure.md)) |
| `popup.html` / `popup.js` | **Unused** — no `action` / `default_popup` in `manifest.json` |

## Library list (`library-list.js`)

- Fetches every `line_items_page` with session cookies and merges `a.sky-pilot-list-item` into one list.
- Left sidebar: title search, talent checklist (OR) from `talent-structure.json`, status line.
- Slightly wider page shell with the filter column (up to ~1320px).
- Talent matching uses Unicode **NFKC** and strips **`【卒業】`**, **`【配信活動終了】`**, **`【退職】`** only when matching titles to catalog names.
- Unmapped titles: sidebar link + non-blocking panel (top-right) when a talent filter is active.
- Dev probe: library URL hash `#holo-dl-probe` logs `HoloOrderItemParse.probeOrderItemDownloads` for the first item.
- **WAV ZIP:** sidebar downloads **currently visible** products into one ZIP ([details](library-batch.md)).
- **Sidebar layout:** talent list scrolls; ZIP buttons stay visible; height tracks viewport below the shop header.

## Order item detail (`content.js`)

- Runs only on URLs matching `.../order_items/{id}` (not on the library list).
- Injects a floating MP3 / WAV panel when `div.action-icon` exists; ~1.8s between tracks.
- Menu labels like `MP3 ファイル(18.1 MB)` — matching uses `startsWith('MP3 ファイル')` / `WAV ファイル`, scoped per `div.track` when possible.

## Scripts on each page load

| Page | `content.js` | `library-list.js` | `order-item-parse.js` |
|------|----------------|-------------------|------------------------|
| Library list | no-op (early exit) | active | loaded, idle unless probed |
| Order item detail | batch panel | no-op (early exit) | loaded, idle unless probed |
| Other shop pages | no-op | no-op | idle |

## ZIP batch (quick steps)

1. Apply filters so only wanted `sky-pilot-list-item` rows are visible.
2. Click **順次ダウンロード（WAV）** (**MP3・未対応** on the library).
3. On Chromium you may get a **save file** picker; cancel to fall back to a normal download.
4. Large jobs still hold each file in JSZip until the archive is written — filter small first if memory is tight.

See [library-batch.md](library-batch.md) for phases, probes, and Chrome notes.