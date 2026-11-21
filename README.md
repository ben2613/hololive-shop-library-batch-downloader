# Hololive 語音批量下載器

Browser extension for batch-downloading voice files on [shop.hololivepro.com](https://shop.hololivepro.com) order-item pages.

## What this repo includes (v3.0)

| File | Role |
|------|------|
| `manifest.json` | MV3 content scripts on `*.hololivepro.com` |
| `content.js` | Floating panel on **order item** detail pages: sequential click-through download for all tracks (MP3 / WAV) |
| `library-list.js` | **Digital library** list (`/apps/downloads/orders/{customerId}`): merge all pagination, two-column layout, filters |
| `order-item-parse.js` | `fetch` + parse order-item HTML for WAV URLs / file IDs (`HoloOrderItemParse`) |
| `library-batch-download.js` | Phase 2: filtered library → sequential fetch → ZIP (`HoloLibraryBatchZip`) |
| `vendor/jszip.min.js` | JSZip 3.10.1 (bundled) |
| `talent-structure.json` | Talent tree for library filters (regenerate from `/pages/talent`; see below) |
| `popup.html` / `popup.js` | **Unused** — no `action` / `default_popup` in `manifest.json` (old MV2-style flow) |

### Library list (`library-list.js`)

- Fetches every `line_items_page` with session cookies and merges `a.sky-pilot-list-item` into one list.
- Left sidebar: title search, talent checklist (OR) from `talent-structure.json`, status line.
- Slightly wider page shell with the filter column (up to ~1320px; was 1200px before the sidebar).
- Talent matching uses Unicode **NFKC** and strips status prefixes **`【卒業】`**, **`【配信活動終了】`**, **`【退職】`** only when matching titles to catalog names.
- Items with no catalog talent match: sidebar link + non-blocking panel (top-right) when a talent filter is active.
- Dev probe: library URL hash `#holo-dl-probe` logs `HoloOrderItemParse.probeOrderItemDownloads` for the first item.
- **ZIP batch (phase 2):** sidebar **WAV** downloads **currently visible** products sequentially into one ZIP. File bytes are always fetched in `background.js` (shop redirect → CloudFront without page CORS). Confirms when **>10 products**. **MP3 ZIP** is disabled — use the detail-page floating panel for MP3.
- **Sidebar layout (phase 3, partial):** talent list scrolls inside the panel; ZIP buttons and status stay visible. Panel height follows the visible viewport (`syncFilterPanelHeight` — accounts for shop header / sticky `top`, updates on scroll and resize).

### Order item detail (`content.js`)

- Runs only on URLs matching `.../order_items/{id}` (not on the library list).
- Injects a floating MP3 / WAV panel when `div.action-icon` exists; ~1.8s between tracks.
- Menu labels on the shop are like `MP3 ファイル(18.1 MB)` — matching uses `startsWith('MP3 ファイル')` / `WAV ファイル`, scoped per `div.track` when possible.

### Scripts on each page load

| Page | `content.js` | `library-list.js` | `order-item-parse.js` |
|------|----------------|-------------------|------------------------|
| Library list | no-op (early exit) | active | loaded, idle unless probed |
| Order item detail | batch panel | no-op (early exit) | loaded, idle unless probed |
| Other shop pages | no-op | no-op | idle |

### ZIP batch (phase 2)

1. Apply filters so only wanted `sky-pilot-list-item` rows are visible.
2. Click **順次ダウンロード（WAV）** in the sidebar (**MP3・未対応** is disabled on the library).
3. Large jobs hold audio in memory until the ZIP is generated — start with a small filter if you hit browser limits.

### Library batch download — phases at a glance

| Phase | Goal | Status |
|-------|------|--------|
| **1** | Prove `fetch` + parse: WAV in HTML, MP3 needs menu | Done (`order-item-parse.js`, probe below) |
| **2** | Filtered library → sequential WAV → one ZIP | Done (`library-batch-download.js`, `background.js`) |
| **3** | Polish for large jobs and UI | **Partial** (see next section) |

## Library batch download — phase 3 (polish & scale)

Phase 3 is everything after the phase 2 MVP: safer large batches, clearer UX, and optional disk streaming. **MP3 ZIP from the library list** is a separate hard problem (signed URLs only after the per-track menu) — not part of phase 3 unless we add a dedicated approach later.

### Shipped (in this repo)

| Item | Where |
|------|--------|
| Progress bar + status text during ZIP build | `library-list.js` |
| ZIP filename from active filters (`q-…`, `talent-…`) | `library-batch-download.js` |
| One folder per product title, sanitized paths / track names | `library-batch-download.js` |
| Confirm when **>10 visible products** (before start only) | `library-batch-download.js` |
| Sidebar: only talent checklist scrolls; WAV / MP3 / progress pinned | `library-list.js` |
| Panel height = viewport minus actual top offset (shop header), sticky-aware | `syncFilterPanelHeight` in `library-list.js` |
| **Chunked fetch** via `runtime.connect` (background streams response body) | `background.js`, `library-batch-download.js` — avoids Chrome MV3 single-message size limits; base64 `sendMessage` is fallback |
| **Save to disk** via File System Access API when supported | `showSaveFilePicker` → JSZip `generateInternalStream` → writable file (Chromium, secure context). Cancelling the picker falls back to normal browser download blob |
| Chrome MV3 blob bridge | `bufferB64` in `sendMessage` when port fetch is unavailable |

### Not yet (remaining phase 3)

| Item | Why it matters |
|------|----------------|
| **Pre-run estimate** (product count, track count, rough WAV size) | Avoid accidental multi‑GB jobs |
| **Cancel during run** | Stop fetch loop without closing the tab |
| **Lower peak RAM** (true streaming ZIP without holding all entries) | JSZip still buffers each file until final archive is written |
| **Library MP3 ZIP** | Requires menu automation or an API — use `content.js` on detail pages today |

Phase 1 probe notes remain below for debugging parse URLs.

## `talent-structure.json`

Hierarchical talent index used for naming / lookup (e.g. **ホロライブ → 0期生 → ときのそら**).  
Source page: [タレント一覧](https://shop.hololivepro.com/pages/talent).

### What the shop page already provides

| Source | Location | Contents |
|--------|----------|----------|
| **QuicklookTalentDict** | `<script type="application/json" id="QuicklookTalentDict">` | Flat list (~203): `name_ja`, `name_en`, `handle`, `image`, `theme_color` — **no** group or generation |
| **Filter modal DOM** | `.talent_modal` (also injected on the talent page) | Root groups, sub-groups, and per-talent `gr` / `ge` CSS classes |

There is **no** single JSON on the site that matches the full tree; you merge **QuicklookTalentDict** with the **modal DOM**.

### DOM conventions

- **Root groups** — `.group_item[data-gr]`  
  `0` ホロライブ · `1` ホロスターズ · `2` HOLOSTARS English · `3` COVER · `4` 卒業
- **Sub-groups** — `.gene_lists.gr{N}` → `.gene_item[data-ge]` (skip `data-ge="0"` = “All”)
- **Talents** — `.member_item.gr{N}.ge{M}` with `a[href="/collections/{handle}"]`  
  The same handle can appear in **multiple** `(gr, ge)` rows (e.g. 白上フブキ in 1期生 and ホロライブゲーマーズ). The exporter lists a talent once per sub-group they belong to.

## Recreate `talent-structure.json`

### 1. Open the talent page

Load https://shop.hololivepro.com/pages/talent in a normal browser tab (login not required for this scrape).

### 2. Run in DevTools console

Open **Developer Tools → Console**, paste and run:

```javascript
(() => {
  const dictEl = document.getElementById('QuicklookTalentDict');
  if (!dictEl) throw new Error('QuicklookTalentDict not found');
  const dict = JSON.parse(dictEl.textContent);
  const byHandle = Object.fromEntries(dict.map((t) => [t.handle, t]));

  const groupNames = {
    0: 'ホロライブ',
    1: 'ホロスターズ',
    2: 'HOLOSTARS English',
    3: 'COVER',
    4: '卒業',
  };

  const genesByGr = {};
  for (const list of document.querySelectorAll('.gene_lists')) {
    const gr = [...list.classList].find((c) => /^gr\d+$/.test(c))?.slice(2);
    if (!gr) continue;
    genesByGr[gr] = Object.fromEntries(
      [...list.querySelectorAll('.gene_item[data-ge]')]
        .filter((el) => el.dataset.ge !== '0')
        .map((el) => [el.dataset.ge, el.textContent.trim()])
    );
  }

  const talentUnits = {};
  for (const m of document.querySelectorAll('.member_item')) {
    const a = m.querySelector('a[href*="/collections/"]');
    if (!a) continue;
    const handle = a.getAttribute('href').replace('/collections/', '');
    const gr = [...m.classList].find((c) => /^gr\d+$/.test(c))?.slice(2);
    const ge = [...m.classList].find((c) => /^ge\d+$/.test(c))?.slice(2);
    if (!gr || ge === undefined) continue;

    const key = `${handle}|${gr}`;
    if (!talentUnits[key]) talentUnits[key] = { handle, gr: +gr, generations: new Set() };
    if (ge !== '0') talentUnits[key].generations.add(ge);
    else if (!talentUnits[key].generations.size) talentUnits[key].generations.add('_all');
  }

  const tree = {};
  for (const name of Object.values(groupNames)) tree[name] = {};

  for (const unit of Object.values(talentUnits)) {
    const root = groupNames[unit.gr];
    const meta = byHandle[unit.handle] || {};
    const talent = {
      name_ja: meta.name_ja || unit.handle,
      name_en: meta.name_en,
      handle: unit.handle,
      collection: `/collections/${unit.handle}`,
      image: meta.image,
      theme_color: meta.theme_color,
    };

    const gens = [...unit.generations].filter((g) => g !== '_all');
    if (gens.length === 0) {
      if (!tree[root]['(All)']) tree[root]['(All)'] = [];
      if (!tree[root]['(All)'].some((t) => t.handle === talent.handle)) tree[root]['(All)'].push(talent);
    } else {
      for (const ge of gens) {
        const subName = genesByGr[unit.gr]?.[ge] || `ge${ge}`;
        if (!tree[root][subName]) tree[root][subName] = [];
        if (!tree[root][subName].some((t) => t.handle === talent.handle)) tree[root][subName].push(talent);
      }
    }
  }

  const output = {
    source: 'https://shop.hololivepro.com/pages/talent',
    generatedAt: new Date().toISOString(),
    rootGroups: Object.values(groupNames),
    embeddedJson: {
      QuicklookTalentDict: {
        id: 'QuicklookTalentDict',
        count: dict.length,
        fields: ['name_ja', 'name_en', 'handle', 'image', 'theme_color'],
        note: 'flat list; no group/generation',
      },
      hierarchy: 'DOM member_item gr/ge classes + gene_lists labels (not in QuicklookTalentDict)',
    },
    tree,
  };

  const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'talent-structure.json';
  link.click();
  URL.revokeObjectURL(url);
  console.log('Downloaded talent-structure.json', { talents: dict.length, rootGroups: output.rootGroups });
  return output;
})();
```

The browser downloads `talent-structure.json`. Replace the file in this folder if you are updating the repo copy.

### 3. Verify (optional)

- `QuicklookTalentDict` count matches `embeddedJson.QuicklookTalentDict.count`.
- Spot-check **ホロライブ → 0期生** includes `tokinosora`.
- Expect duplicate handles across sub-groups when a member belongs to multiple units (e.g. GAMERS + a gen).

## Extension install (dev)

1. `chrome://extensions` or `about:debugging` → load unpacked  
2. Select this `BatchDownloader` folder  
3. **Library list** (`/apps/downloads/orders/{customer_id}`): `library-list.js` auto-fetches all pages, merges `sky-pilot-list-item` rows, and adds a left filter (title + multi-talent OR) beside the shop layout  
4. **Download batch buttons** only on `.../order_items/...` detail pages (`content.js`)

After changing `manifest.json` or scripts, reload the extension.

### Background script (browser difference)

ZIP downloads call `background.js` to fetch CloudFront without page CORS.

| Browser | Notes |
|---------|--------|
| **Chrome / Edge / Brave** | Load unpacked — `manifest.json` uses MV3 `"service_worker": "background.js"`. |
| **Firefox** | Recent Firefox (MV3) also accepts `service_worker`. If an older build only allows `background.scripts`, temporarily replace the `background` block with `"scripts": ["background.js"]` (MV2-style; not valid in Chrome). |

After changing `manifest.json`, reload the extension in the browser’s extension page.

## Library batch download — phase 1 (fetch / parse probe)

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

- Fetched HTML: **no** `.mp3` URLs and **no** `/stream/` paths (checked on several order items).
- After clicking `div.action-icon`, the menu exposes a **signed CloudFront MP3** under `…/stream/…/*.mp3` with **different query params** than the WAV `source` URL (not a simple path swap).

**Implication for phase 2**

- **WAV batch from the library list**: feasible via fetch + parse (`order-item-parse.js`).
- **MP3 batch without UI**: needs extra work (capture menu XHR when opening the icon, hidden iframe + menu clicks per track, or accept WAV-only ZIP first).

### Re-run the probe

1. Reload the extension.
2. Open the library list, add hash `#holo-dl-probe`, or on any detail page run in DevTools:

```javascript
HoloOrderItemParse.probeOrderItemDownloads(location.href).then(console.log);
// or from library:
HoloOrderItemParse.probeOrderItemDownloads(
  document.querySelector('a.sky-pilot-list-item').href
).then(console.log);
```

## Credits

Initial project was done by **DW**