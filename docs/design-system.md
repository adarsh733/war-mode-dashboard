# Design System — WAR MODE

> Two coexisting systems: the **warm legacy** WAR MODE identity (Fitness/Health/Tracker) and the
> **clean-light Food** system (ADR-0013). Update when visuals change. All CSS is in `styles.css`;
> Food v3 rules live at the bottom, scoped to `section[id^="food-"]` and the food sheets.

## 1. Warm legacy (Fitness / Health / Tracker) — unchanged

- **Fonts:** Oswald (labels/headings, condensed), Fraunces (serif display titles), DM Sans (body).
- **Palette tokens** (`:root`): `--bg #f5f4ef`, `--paper #fffdfa`, `--paper2 #ece8df`,
  `--ink #17191b`, `--ink2`, `--muted`, `--line/-2`; accents `--accent #a43a24` (terracotta),
  `--green #2f7652`, `--amber`, `--red`, `--blue`, each with a `-bg` tint.
- **Section accent on the top toggle:** fitness = ink, health = accent, tracker = green,
  **food = blue** (`.seg button.on[data-sec="food"]`).
- **Components:** `.card`, `.stat`, `.pill` (`p-green/amber/red/blue/ink`), `.sec-label`,
  `.kicker`, `.title`, `.navcard`, chips. Radius `--r 10px`. Soft shadows `--shadow`.

## 2. Clean-light Food (ADR-0013) — the active design

**Scope:** applied via `section[id^="food-"]`, `.fsheet`, `.fd-card`. Does NOT touch other tabs.
When Food is active, `body.food-active` sets the light background.

### Typography
- **Plus Jakarta Sans** everywhere in Food (400–800). Numbers use 700–800.
- Titles `.title` 800 / ~2rem, tight tracking. Slot titles 700 / ~1.2rem. Body ~1rem.
- Uppercase micro-labels (`.fd-lbl`, `.fmini`) 700, letter-spacing .06em, muted.

### Color tokens (`:root`, Food-only usage)
```
--fbg #eef1ef   page background        --fcard #ffffff  cards
--fink #17241d  text                   --fmut #7b8a82   muted text
--fline #e9eeeb hairlines
--fgreen #3f9d5a  (+bg #e6f4ea)  primary accent / calories ring / positive
--fblue  #3b7fc4  (+bg #e7f0f9)  meal badge / links / secondary
--famber #dd9a2b  (+bg #fbf1dc)  protein-mid / warnings
--fred   #d75a4a  (+bg #fbe9e6)  over-target / destructive
--fviolet #7a6bd6 (+bg #ece9fb)  spare accent for headers
```
- **Ring colors:** calories = green (red when over 1,750); protein = green if ≥180, amber if
  140–180, red if <140.

### Shape & spacing
- Radius: cards `--fr 18px`, inputs/sheets 12–16px, detail card 24px top corners.
- Shadow `--fshadow` (soft, low-contrast). Generous padding (cards 16–24px). Airy.

### Components
- **`.fcard`** — white rounded card with `--fshadow`.
- **Hero** (`.fhero`): two rings (`.fring-wrap` 132px canvas + centered value/label overlay),
  caption row (`.fhero-cap`), green buffer note (`.fhero-buf`).
- **Slot card** (`.fslot`): header (`.fslot-title` + `.fslot-sub` subtotal + round green
  `.fslot-add` `+`), suggestion chips (`.fsugg-chip.item/.meal` with `+`), entry rows.
- **Log row** (`.logrow` in `.fslot`): drag handle (`.fdrag`), `.fbadge.item/.meal/.adhoc`, name,
  kcal, delete. Tap opens the detail card.
- **Detail card** (`.fd-*`): bottom-sheet, `max-height 92vh`, sticky footer buttons
  (`.fd-btn.primary` green / `.fd-btn.danger`). Header band tinted from item name hash. Big
  calories+protein (`.fd-two`/`.fd-bigv`). Inline edit panel `.fd-edit` (macros + units).
- **Quantity wheel** (`.qwheel`): 184px tall, item height **46px** (kept in sync with
  `QWHEEL_IH` in `foodDetail.js`), center highlight `.qwheel-hl` at top:69px, scroll-snap; the
  centered value gets `.on`; "type" button for manual entry.
- **Pills/buttons:** `.fpill-btn` (quick actions), `.fd-chip`/`.fchip` (selectable), `.btn-primary.wide`.
- **Search** `.fsearch-input`: big (15–18px padding), rounded 14px, soft shadow, green focus ring;
  live results dropdown `.fsearch-results`.
- **Badges/legend:** items = green (`🥗`), meals = blue (`🍲`), ad-hoc = amber.

### Motion
- Sheets slide up (`translateY` + opacity, ~.25–.28s). Topbar hide/show `.3s`. Ring draw ~.45s.

## 3. Rules of thumb

- Keep **calories + protein** the visual headline in Food; carbs/fat are secondary detail.
- New Food UI uses Food tokens/`--ffont`; never reach for the warm legacy tokens inside Food.
- Any change here that alters look → update this file (per the working agreement).
- Before replicating this system to other tabs, get user approval (ADR-0013).
