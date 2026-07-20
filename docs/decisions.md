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
