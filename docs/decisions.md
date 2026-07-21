# Architecture Decision Records — WAR MODE

> One ADR per significant call. Format: **Decision / Reason / Status**. Newest concerns at the
> bottom. Status ∈ Accepted · Superseded · Proposed.

---

### ADR-0001 — Consolidate to one canonical `index.html`
- **Decision:** Promote the newest dashboard (`Latest.txt`, 2482 lines) to a single `index.html`;
  delete the byte-identical/older duplicates; keep `Phase 1 Archive/` as history.
- **Reason:** The folder had 3 identical copies + older versions; ambiguity risked editing the
  wrong file. `Latest.txt` was the true newest.
- **Status:** Accepted.

### ADR-0002 — Split the monolith into classic scripts, NOT ES modules
- **Decision:** Break the single-file dashboard into `index.html` + `styles.css` + `js/*.js`, loaded
  as **classic `<script>` tags sharing global scope**. No build step.
- **Reason:** The codebase wires ~33 functions via inline `onclick=`. ES modules would require
  `window.`-exposing all of them and adding `export`/`import` across ~90 functions — high churn/risk
  on working legacy code the spec says to leave alone. Classic scripts preserve behavior
  byte-for-byte while still splitting files for maintainability.
- **Status:** Accepted. (Trade-off: global namespace; mitigated by clear file ownership.)

### ADR-0003 — Restructure BEFORE building the feature
- **Decision:** Do the mechanical split while the code is known-good, verify identical behavior,
  then build Food on the clean base.
- **Reason:** Splitting new+old together later is harder to verify than a behavior-preserving split
  of known-good code.
- **Status:** Accepted.

### ADR-0004 — Dedicated Supabase tables for Food (not reserved rows)
- **Decision:** Three tables `food_items`, `food_meals`, `food_log` (`id/date pk + jsonb data +
  indexed columns`), instead of stuffing JSON blobs into `tracker_days` reserved rows.
- **Reason:** Long-run scalability. The log grows unbounded over years — per-row writes stay O(1)
  vs rewriting one giant blob on every meal. Queryable/indexable. Clean separation. `data jsonb`
  keeps the schema free to evolve without migrations.
- **Status:** Accepted. Cost: one-time SQL (`supabase/food_tables.sql`). Tables already exist in
  his project.

### ADR-0005 — Store macros per-100 canonical; deterministic JS math
- **Decision:** Every item stores per-100 g/ml; all quantity math is `per100 × amount/100` in pure
  JS (`foodMath.js`). AI (Phase 2) only proposes numbers.
- **Reason:** Exact arithmetic for any quantity; LLMs hallucinate numbers and his deficit can't
  survive that.
- **Status:** Accepted.

### ADR-0006 — Item-specific units + always grams/ml; add units per product
- **Decision:** Each item defines its own `servings[]` (label → base amount); grams/ml always
  available; user can add/remove units per product in the detail card's edit panel.
- **Reason:** Milk is "1 can" or "100 ml"; chana is "1 katori" or grams — units are inherently
  per-product. Confirmed against HealthifyMe screenshots.
- **Status:** Accepted.

### ADR-0007 — Oil captured per-meal via fast chips
- **Decision:** Home-cooked items and meals prompt oil at log time (None / 1 tsp / 1 tbsp /
  custom); 9 kcal/g, 1 g fat/g.
- **Reason:** The ~100–150 kcal/day undercount is the tool's reason for existing; per-meal is more
  accurate and fast.
- **Status:** Accepted.

### ADR-0008 — Log entries store base-unit amounts; meals support per-day overrides
- **Decision:** Entries store `amount` in base units (+ `disp` for friendly display). A logged meal
  can carry `overrides`/`removed` to adjust its components **for that day only**, never mutating the
  saved template.
- **Reason:** Unambiguous math; lets him tweak "today's oats bowl" without editing the reusable meal.
- **Status:** Accepted.

### ADR-0009 — Tracker push is MANUAL ("Done for the day")
- **Decision:** Logging never auto-writes to the Tracker. A **Done/Update** button pushes the day's
  total into `calories`/`proteinAmt` (+ `applyAuto`). Overwrite only on dates with food entries.
- **Reason:** Auto-push ticked `under2k`/`protein` habits mid-day (~1,715 kcal) before the day was
  fully logged — false compliance. User asked for an explicit finish action. Supersedes the earlier
  auto-push behavior.
- **Status:** Accepted (supersedes initial auto-push).

### ADR-0010 — Target 1,750 kcal with a 150 kcal buffer; show only calories + protein
- **Decision:** Rings/goal track **1,750** kcal (real ceiling ~1,900; 150 reserved for untracked
  snacks). Hero features **only calories and protein**; carbs/fat/fiber demoted to item detail.
- **Reason:** He knowingly can't track small snacks; and he only cares about cal + protein day to day.
- **Status:** Accepted.

### ADR-0011 — Phase 2 AI gated on a Netlify→Anthropic connectivity test
- **Decision:** Before building any AI UI, prove one hard-coded Anthropic API call works from the
  deployed Netlify site. If CORS/auth blocks direct browser calls, add a tiny Netlify Function
  proxy.
- **Reason:** #1 technical risk; the artifact sandbox differs from his deployment. Fail fast.
- **Status:** Proposed (Phase 2 not started).

### ADR-0012 — AI dedup by name/brand/alias
- **Decision:** When AI later reads an image of an item he already created, edit the existing item
  instead of adding a duplicate. Hook `findItemByNameBrand()` exists now.
- **Reason:** Prevent pantry redundancy; user explicitly asked.
- **Status:** Accepted (hook ready; used in Phase 2).

### ADR-0013 — Redesign the Food tab: clean & light + Plus Jakarta Sans (scoped)
- **Decision:** New clean-light visual system (white rounded cards, soft neutral bg, soft green
  accent) and **Plus Jakarta Sans**, **scoped to Food only** via `section[id^="food-"]` + food
  sheets. Legacy tabs keep the warm WAR MODE identity for now.
- **Reason:** User liked reference health apps; disliked the Oswald/Fraunces mix. Test on Food
  before replicating app-wide.
- **Status:** Accepted. Replication to other tabs = pending user approval.

### ADR-0014 — Detail card + iOS quantity wheel replace inline expand/log sheets
- **Decision:** Tapping an item/meal opens a spacious bottom-sheet **detail card**; quantity uses an
  **iOS-style scroll wheel** (0.25…500 presets + type). Removed the old inline entry editor, the
  redundant row edit pencil, and the meal-slot chips (drag handles slot assignment).
- **Reason:** Inline expansion is cramped on mobile; user wanted a clean spacious screen like
  HealthifyMe and a native-feeling quantity picker.
- **Status:** Accepted.

### ADR-0015 — Hide Pantry from nav; keep it in the backend
- **Decision:** Remove Pantry from the Food subnav/drawer; item management happens in the detail
  card. `renderPantry()`/`food-pantry` remain for internal use.
- **Reason:** User finds the Pantry list unhelpful on the UI.
- **Status:** Accepted.

### ADR-0016 — Smart, recency-weighted suggestions
- **Decision:** Suggestions per slot = taught favorites first, then learned from log history ranked
  by recency-weighted frequency (~0.93^daysAgo).
- **Reason:** User wants suggestions to adapt to what he actually eats, favoring recent habits.
- **Status:** Accepted.

### ADR-0017 — Auto-hide top bar on scroll (Food only)
- **Decision:** In the Food section, the top masthead/toggle bar slides up on scroll-down and
  returns on scroll-up (body class `nav-hidden`, gated on `curSec==='food'`).
- **Reason:** Free vertical space on mobile; user request. Kept out of other tabs to respect the
  "changes restricted to Food" instruction.
- **Status:** Accepted.

### ADR-0018 — Non-destructive merge with the existing GitHub repo
- **Decision:** The local fresh-init history was merged with the pre-existing remote (unrelated
  histories) keeping the new modular `index.html` and absorbing the remote's PWA files; not a
  force-push.
- **Reason:** Preserve the remote's history and PWA assets (`manifest.json`, appicons) rather than
  clobbering them.
- **Status:** Accepted.

### ADR-0019 — Seed import via smart-merge (name + curated alias map), not literal name-match
- **Decision:** Import `data/food-seed/food-seed.v1.1.json` (151 items + 30 meals) into the live
  `food_items`/`food_meals` tables with a re-runnable script (`scripts/import_food_seed.mjs`).
  Match seed→existing by the spec's normalization
  (`name.trim().toLowerCase().replace(/\s+/g,' ')`) **plus a curated old→new alias map** (21 pairs,
  e.g. `Roti / Chapati` → `Roti / Chapati (plain, no oil)`). Replace-on-match **preserves the
  existing `id`/`useCount`/`createdAt`** and refreshes only nutrition fields; **verified rows are
  never overwritten**; known test rows are deleted. Deterministic — no macro arithmetic in the
  importer (per-100 copied verbatim). Dry-run by default; `--commit` writes after a full backup.
- **Reason:** The new names are richer than the legacy app-seed names, so literal matching would
  leave ~27 staples as visible duplicates — and several (`seed_roti`, `seed_oats`, `seed_curd`,
  `seed_toordal`…) are referenced by logged days, so they can't be deleted. Alias-merging onto the
  legacy ids keeps the log/meal history linked, kills the duplicates, and refreshes the data. The
  app's original `_SEED_ALIASES` (never persisted to cloud) are re-applied so search still matches
  `chapati`/`chole`/`dahi`/`badam`.
- **Status:** Accepted. Idempotent (a second run = 0 inserts/0 deletes). Result: 51→158 items,
  3→30 meals, 0 duplicate names, `Sids Farm` (verified) untouched.

### ADR-0020 — `js/food/seed.js` is now GENERATED from the canonical seed JSON
- **Decision:** The canonical seed is `data/food-seed/food-seed.v1.1.json` (the redundant
  `warmode_food_items_only.json` was deleted; both files moved out of the repo root into
  `data/food-seed/`). `js/food/seed.js` is regenerated from the import report to **mirror the live
  cloud item set 1:1, reusing the same ids** (merged staples keep `seed_*`, new items keep `itm_*`);
  it is marked generated and should not be hand-edited.
- **Reason:** A fresh device / cleared cache first-run-seeds locally then reconciles with cloud by
  `id`. If `seed.js` used different ids than the cloud, reconcile would re-create duplicates. Id
  parity makes the import durable across devices.
- **Status:** Accepted. `_SEED_ALIASES` behavior folded into each item's `aliases`; `useCount`
  reset to 0 (cloud carries real usage and wins on reconcile).

### ADR-0021 — Unify the whole dashboard on the clean-light + neon-green system
- **Decision:** Replicate the Food tab's clean-light design across **all four tabs**, replacing the
  warm legacy identity. Concretely: (a) **Plus Jakarta Sans everywhere** — Oswald, Fraunces and DM
  Sans removed from CSS, from inline `style=""` in `index.html`, from JS-generated markup in
  `checkin.js`, and from the Chart.js default; only Jakarta is loaded. (b) A light palette with a
  **neon-green brand accent** (`--accent #1faa5d`, bright stop `#63e79a`, `--grad`) replacing the
  terracotta `--accent`. (c) **One green across every tab** — the per-section toggle accents
  (fitness=ink, health=terracotta, tracker=green, food=blue) are gone; Food's `--fgreen` points at
  the same brand green. (d) The dark hero **banners are deleted** from Fitness and Health; the
  Tracker command deck is **kept but restyled** from near-black to a light card. (e) Gradients are
  restrained to primary interactive surfaces. This **supersedes the two-coexisting-systems premise
  of [ADR-0013](#adr-0013)**, whose own condition was "get user approval before replicating" — given.
- **Reason:** Two design languages in one app read as unfinished; the user asked for consistency,
  a light theme and a neon-green identity. Doing it as a **token remap** rather than a component
  rewrite meant the recolor cascaded automatically through inline styles, `cssv()` chart colors and
  the Food canvas rings — a presentational-only change with no logic touched.
- **Consequences / guards:**
  - `--accent` became green while `--green` already existed, so any chart plotting both would show
    two identical series. `cWaist` and `cComp` reassign their `--accent` series to **`--violet`**.
    *Rule: never plot `--accent` and `--green` in the same chart.*
  - Lightening the palette dropped pill/badge text contrast to ~2.1–3.2:1. Added **`-ink` token
    variants** (`--green-ink`, `--amber-ink`, `--red-ink`, `--blue-ink`, `--accent-ink`) for text on
    tints; base tokens remain for charts/bars/rings. All now pass WCAG AA (~5.2–5.9:1).
  - `--fgreen` is a **literal hex**, not `var(--accent)` — `foodRing` reads it via `cssv()` and needs
    a real color string for canvas.
  - `manifest.json` `theme_color`/`background_color` updated too, else the installed PWA would still
    flash the old dark identity on its splash screen.
  - Removing the banners orphaned `dayCountBanner`; its writer in `js/data.js` was deleted. The
    topbar's `.creed-line` is a *different* element and remains.
- **Status:** Accepted. Verified by DOM/computed-style inspection across all four tabs (screenshots
  are unreliable in this environment — the preview pane reports a 0×0 viewport, so Chart.js does not
  paint; colors were confirmed on the chart instances instead). Zero legacy-font elements, zero
  console errors.
- **Known tradeoff:** white-on-neon button text is ~3.0:1, below AA — a deliberate choice to keep the
  "lightest neon green" look. Fix if needed by darkening the gradient to ~`#2ec46f → #1a9450`.
