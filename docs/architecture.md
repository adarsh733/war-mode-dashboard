# Architecture — WAR MODE

> How the code is organized, loaded, stored, and synced. Update when structure changes.

## 1. Deploy & build model

- **No build step.** Plain HTML/CSS/JS served statically. Deploy = push to GitHub → Netlify.
- **One serverless function** since Phase 2: `netlify/functions/ai.js` (the Anthropic proxy — see
  [ADR-0023](decisions.md)). `netlify.toml` pins `publish = "."` and `functions =
  "netlify/functions"`. The static site itself still has no build step; Netlify bundles the function
  automatically. Functions do **not** run on the local `python -m http.server` — AI is live only on
  the deployed site, and `aiIsLocalStatic()` says so plainly instead of throwing a 404.
- **Secrets:** `ANTHROPIC_API_KEY` and `WARMODE_AI_PIN` live in the Netlify UI as *secret*
  environment variables. They are never in the repo. Netlify's secrets scanning will fail the build
  if either value ever appears in published output.
- CDNs in `<head>`: Chart.js 4.4.1, `@supabase/supabase-js@2`, Google Fonts
  (**Plus Jakarta Sans** only — the sole font across all four tabs since [ADR-0021](decisions.md)).
- PWA: `manifest.json` + `appicon-180/192/512.png`; `index.html` links them.

## 2. Script model — classic scripts, one global scope

All `js/*.js` are **classic `<script>` tags**, not ES modules. They share a single global scope
(exactly like the original single-file dashboard did), so functions call each other and inline
`onclick="..."` handlers resolve without any `export`/`import`/`window.` wiring. See
[ADR-0002](decisions.md) for why.

**Load order (in `index.html`, end of body):**
```
config → dates → data → charts → nav → tracker → checkin           (legacy engine)
food/foodMath → food/seed → food/foodData → food/foodSuggest
  → food/foodUI → food/foodForm → food/foodLog → food/foodDetail → food/bridge
food/aiClient → food/aiValidate                                    (AI plumbing)
  → food/aiLabel → food/aiParse → food/aiMealName → food/aiLookup → food/aiPlate
app.js   (bootstrap — MUST be last)
```
Rules that keep this safe:
- Only **top-level immediate statements** care about order; cross-file calls happen inside
  functions (runtime), so most order is flexible. The **bootstrap** (`app.js`) runs last.
- `foodDetail.js` loads **after** `foodLog.js` and intentionally **overrides**
  `openItemLogSheet`/`openMealLogSheet` to open the new detail card.
- The `ai*.js` modules are **entirely optional** — delete every `<script src="js/food/ai*">` tag and
  the app still works; the AI entry points are all guarded (`aiLogText&&aiLogText()`), so they become
  no-ops rather than errors. `aiClient` and `aiValidate` must load before the five feature modules.

## 3. Module map

### Legacy engine (stable — do not refactor casually)
| File | Responsibility |
|------|----------------|
| `js/config.js` | constants, Supabase URL/anon key, DB/supa globals, goal helpers, SEED (tracker) |
| `js/dates.js`  | date helpers (`todayStr`, `iso`, `addDays`, `fmtDate`, `monthKey`, week window) |
| `js/data.js`   | tracker data layer: `loadDB`, `persist`, `applyAuto`, sync badge, goals |
| `js/charts.js` | Chart.js helpers + `buildCharts` + monthly aggregations + `cssv()` |
| `js/nav.js`    | routing (`PAGES`, `HOME`, `SEC_TAB`, `setSec`, `go`, `paintNav`), drawer, search, **scroll-hide topbar (all sections)** |
| `js/tracker.js`| daily tracker: week grid, goals, tags, history, CSV export |
| `js/checkin.js`| progress-photo check-in engine |
| `js/app.js`    | bootstrap: `loadDB → loadGoals → loadCheckins → loadFood → render` |

### Food modules (`js/food/`)
| File | Responsibility |
|------|----------------|
| `foodMath.js`   | **pure deterministic math**: per-100, `toBaseAmount`, `macrosForAmount`, `mealTotals` (+overrides), `entryMacros`, `dayTotals`, oil, `fmtMacros`. No DOM/state. |
| `foodData.js`   | in-memory maps `FOOD_ITEMS/MEALS/LOG`; local-first cache; Supabase load/reconcile/CRUD; `itemMatchesQuery`, `findItemByNameBrand` (dedup), `normName` |
| `seed.js`       | **GENERATED** — 158 vegetarian seed items (`FOOD_SEED`), mirrors the live cloud set 1:1 (same ids); aliases folded per-item. Source: `data/food-seed/food-seed.v1.1.json`. Do not hand-edit — see [ADR-0020](decisions.md) |
| `foodSuggest.js`| `FOOD_SUGGESTIONS` (taught) + `learnedScores` (recency) + `suggestionsFor`, quick-log, manager UI |
| `foodUI.js`     | `FOOD_TARGETS`; Today (`renderToday`, hero rings, `slotsHtml`, `entryRowHtml`), Pantry, Meals, drag reorder, `foodRing` |
| `foodForm.js`   | Add/Edit item manual form + deterministic per-serving→per-100 conversion |
| `foodLog.js`    | quick-add search, **per-slot add** (`openSlotAdd`), meal builder, repeat-yesterday, bottom-sheet infra (`fsheetOpen`) |
| `foodDetail.js` | **detail card** (`openItemDetail`/`openMealDetail`/`openEntryDetail`), **quantity wheel**, units editor, commit/save/remove |
| `bridge.js`     | `finishDay` (manual push), `syncFoodToTracker`, `markDayDirty` |

### AI layer (`js/food/ai*.js` + one function) — Phase 2, see [ADR-0023/0024/0025](decisions.md)
| File | Responsibility |
|------|----------------|
| `netlify/functions/ai.js` | **the only place the API key exists.** PIN gate, daily cap, task whitelist (`ping`/`label`/`nl`/`mealname`/`lookup`/`plate`); builds every system prompt + JSON schema server-side; maps refusal/429/5xx to readable errors |
| `aiClient.js`   | `aiCall(task, payload)` — PIN storage, client-side image downscale to 2576px, fail-soft errors, `aiTestConnection()`. Never throws |
| `aiValidate.js` | **pure guards:** `aiCheckMacros` (Atwater + ranges), `aiCheckVegetarian`, `aiPer100FromPrinted` (the per-serving→per-100 arithmetic the model is not allowed to do), `aiVetProposal` |
| `aiLabel.js`    | label photo → confirm card → `saveItem` as ⭐ verified; correction/negotiation loop; dedup |
| `aiParse.js`    | natural-language logging: pantry index → mapped rows → editable confirm list → log. Recomputes every row locally |
| `aiMealName.js` | 3 name suggestions for the meal builder (text only, no numbers) |
| `aiLookup.js`   | web-search lookup for unknown foods → 🤖 ai item with sources |
| `aiPlate.js`    | plate photo → **draft** rows with forced grams + oil confirmation |

## 3b. Navigation model (ADR-0022)

**Three top-level tabs, five sections.** Tracker and Food are the daily surfaces and own a tab each.
Fitness and Health are reference material with no tab of their own — they sit behind the **More**
landing (`#more-home`, two big `.navcard.lg` header cards).

- `PAGES` maps every **page id → section**. `HOME` maps **section → landing page id**.
- `SEC_TAB` maps **section → the tab that should light up**: `fitness`/`health`/`more` all → `more`.
- `paintNav(sec)` is the single place that lights the tab (via `SEC_TAB`) and shows that section's
  subnav chip group; it also collapses the rail (`.subnav.empty`) when a section has no chips,
  which is the case on the More landing.

Two invariants worth guarding:
1. **Every `PAGES` key must have a matching `<section id>`.** The drawer search walks `PAGES` and
   calls `getElementById(id).textContent` with no null check — a stale key throws and kills search.
   Delete sections and their `PAGES` entries in the same change.
2. **`'more-home'` is deliberately the LAST `PAGES` key.** Search is a first-match-wins walk, and the
   More landing merely lists the words "Fitness"/"Health"; leading with it would hijack those queries.

## 4. Storage & sync

- **Supabase project** `sfilvcffrcdcsrimcatz` (anon key in `config.js`). localStorage is the
  offline-first cache; cloud is reconciled after.
- **Tracker:** table `tracker_days (date pk, data jsonb)`, with reserved rows `__periods__`,
  `__checkins__`, etc.
- **Food:** dedicated tables (see [ADR-0004](decisions.md)), SQL in `supabase/food_tables.sql`:
  - `food_items (id pk, name, use_count, data jsonb, updated_at)`
  - `food_meals (id pk, name, data jsonb, updated_at)`
  - `food_log   (date pk, data jsonb, updated_at)`
- **Suggestions** are stored in a **reserved `food_meals` row `__suggestions__`** (filtered out of
  meal lists) so no extra table is needed. localStorage mirrors it.
- **Reconcile:** last-write-wins by `updated_at` vs local `updatedAt`. If the tables don't exist
  (SQL not run), the app degrades to **local-only** and flags "⚠ Local only" — never blocks.
- On first run the 158 seed items (`js/food/seed.js`) are created locally and pushed to the cloud.

### Seed source of truth & importer
- Canonical seed data: **`data/food-seed/food-seed.v1.1.json`** (151 items + 30 meals,
  IFCT-2017/USDA-anchored). `js/food/seed.js` is generated from it (id-parity with cloud).
- **`scripts/import_food_seed.mjs`** loads the canonical JSON into `food_items`/`food_meals` via the
  Supabase REST API (reads `SUPA_URL`/`SUPA_KEY` from `config.js`), de-duplicating by normalized
  name + a curated alias map (see [ADR-0019](decisions.md)). Deterministic, idempotent, dry-run by
  default (`--commit` to write). Backs up current cloud state to `data/food-seed/backups/`
  (gitignored) and writes a report to `data/food-seed/reports/` before/after each run.

## 5. How to run & verify

- `python -m http.server <port>` → `http://localhost:<port>/index.html` (config `static` in
  `.claude/launch.json`; its port gets bumped on purpose when the preview serves stale JS).
- **Verify via DOM/JS inspection**, not screenshots (capture is broken here). Example checks used
  this session: read `.fslot`, `.fring-center`, `_detail`, `FOOD_LOG`, run `dayTotals` and assert
  numbers by hand.
- The preview browser **caches JS aggressively** — after editing a `.js`, bump the server port or
  hard-reload, else you'll test stale code (this bit us once — see [known-issues.md](known-issues.md)).
- **Test writes on a throwaway date** (e.g. `foodDate='2099-01-01'`) and clean up, to avoid
  polluting real days / his Supabase.

## 6. Git

- Repo is the source of truth; committed in stages with descriptive messages ending in the
  `Co-Authored-By: Claude Opus 4.8` trailer. Private data (`Clinical Records/`, `Physique
  Progress/`, `*.xlsx`) is gitignored. `Phase 1 Archive/` kept as history.
