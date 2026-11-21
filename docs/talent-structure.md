# `talent-structure.json`

Hierarchical talent index for library filters (e.g. **ホロライブ → 0期生 → ときのそら**).  
Source: [タレント一覧](https://shop.hololivepro.com/pages/talent).

## What the shop page provides

| Source | Location | Contents |
|--------|----------|----------|
| **QuicklookTalentDict** | `<script type="application/json" id="QuicklookTalentDict">` | Flat list (~203): `name_ja`, `name_en`, `handle`, `image`, `theme_color` — **no** group or generation |
| **Filter modal DOM** | `.talent_modal` | Root groups, sub-groups, per-talent `gr` / `ge` classes |

There is **no** single JSON on the site with the full tree — merge **QuicklookTalentDict** with the **modal DOM**.

## DOM conventions

- **Root groups** — `.group_item[data-gr]`  
  `0` ホロライブ · `1` ホロスターズ · `2` HOLOSTARS English · `3` COVER · `4` 卒業
- **Sub-groups** — `.gene_lists.gr{N}` → `.gene_item[data-ge]` (skip `data-ge="0"` = “All”)
- **Talents** — `.member_item.gr{N}.ge{M}` with `a[href="/collections/{handle}"]`  
  Same handle can appear in multiple `(gr, ge)` rows (e.g. 白上フブキ in 1期生 and ホロライブゲーマーズ).

## Regenerate the file

### 1. Open the talent page

https://shop.hololivepro.com/pages/talent (login not required).

### 2. Run in DevTools console

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

Replace `talent-structure.json` in the repo root with the download.

### 3. Verify (optional)

- `QuicklookTalentDict` count matches `embeddedJson.QuicklookTalentDict.count`.
- Spot-check **ホロライブ → 0期生** includes `tokinosora`.
- Duplicate handles across sub-groups are expected when a member belongs to multiple units.