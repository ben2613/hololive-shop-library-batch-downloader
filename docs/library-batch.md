# Library batch download (ZIP)

## Phases at a glance

| Phase | Goal | Status |
|-------|------|--------|
| **1** | Prove `fetch` + parse: WAV in HTML, MP3 needs menu | Done (`order-item-parse.js`) |
| **2** | Filtered library → sequential WAV → one ZIP | Done (`library-batch-download.js`, `background.js`) |
| **3** | Polish for large jobs and UI | **Partial** (below) |

## Phase 3 (polish & scale)

Everything after the phase 2 MVP: safer large batches and clearer UX. **Library MP3 ZIP** is a separate problem (signed URLs only after the per-track menu) — use `content.js` on detail pages for MP3.

### Shipped

| Item | Where |
|------|--------|
| Progress bar + status text | `library-list.js` |
| ZIP filename from filters (`q-…`, `talent-…`) | `library-batch-download.js` |
| One folder per product, sanitized paths | `library-batch-download.js` |
| Confirm when **>10 visible products** | `library-batch-download.js` |
| Sidebar scroll / sticky ZIP controls | `library-list.js` |
| **Chunked fetch** via `runtime.connect` | `background.js` — avoids Chrome MV3 message size limits |
| **Save to disk** via `showSaveFilePicker` + stream | `library-batch-download.js` — cancel picker → blob download fallback |
| Base64 `sendMessage` fallback | `background.js` when port fetch unavailable |

### Not yet

| Item | Why |
|------|-----|
| Pre-run size / file-count estimate | Avoid accidental multi‑GB jobs |
| Cancel during run | Stop without closing the tab |
| True constant-memory ZIP | JSZip still holds each file until archive write |
| Library MP3 ZIP | Needs menu automation or an API |

---

## Phase 1 — fetch / parse probe

Tested on logged-in `shop.hololivepro.com` (Nov 2025).

### What works without opening the download menu

For each `order_items` URL, `fetch(url, { credentials: 'include' })` + `DOMParser` yields:

| Field | Source in HTML |
|--------|----------------|
| Product title | `h4` |
| Per-file IDs | `audio[data-file-id]`, `data-order-id`, `data-item-id` |
| **WAV** (signed CloudFront) | `audio source[type="audio/wav"]` `src` |
| **WAV** (shop redirect) | `a[href*="/apps/downloads/downloads/{fileId}"]` with `email`, `order_id`, `order_item_id` |

`div.track` rows are **not** always present in fetched HTML (Sky Pilot hydrates some UI live), but **`audio[data-file-id]` is** — use that for file lists.

### MP3

- Fetched HTML: **no** `.mp3` URLs and **no** `/stream/` paths.
- After clicking `div.action-icon`, the menu exposes signed CloudFront MP3 under `…/stream/…/*.mp3` (**different query** than WAV).

**Implication:** WAV batch from the library is feasible via parse; MP3 batch without UI needs extra work.

### Re-run the probe

1. Reload the extension.
2. Library list: add hash `#holo-dl-probe`, or on a detail page run in DevTools:

```javascript
HoloOrderItemParse.probeOrderItemDownloads(location.href).then(console.log);
// or from library:
HoloOrderItemParse.probeOrderItemDownloads(
  document.querySelector('a.sky-pilot-list-item').href
).then(console.log);
```