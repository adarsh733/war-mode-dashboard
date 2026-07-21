# CLAUDE.md — WAR MODE

Personal health dashboard for one user (Adarsh Nagar, 27M, Bengaluru, vegetarian).
Static site: GitHub → Netlify, backed by Supabase with a localStorage fallback. Installable PWA.
Repo: https://github.com/adarsh733/war-mode-dashboard

Three top-level tabs: **📓 Tracker**, **🍽️ Food**, **··· More**. Tracker and Food are the daily
surfaces; **More** is a landing page holding the rarely-read reference sections **🏋️ Fitness** and
**🩺 Health** ([ADR-0022](docs/decisions.md)). The Food tracker is the actively-developed area;
Fitness/Health/Tracker are stable legacy.

---

## Working agreement

- Before starting any multi-step feature or redesign, use plan mode and
  wait for my approval before writing code.
- After any feature reaches a stable, working state, STOP and do a
  documentation-only pass: update docs/product-spec.md (decisions like
  targets, hidden features, behavior rules), docs/decisions.md (one ADR
  per significant call, format: Decision / Reason / Status), and
  docs/design-system.md (typography, spacing, color, component rules)
  if anything visual changed. Do not write code in this pass.
- Before marking any UI or logic change "done," delegate verification to
  a subagent with only the diff and these acceptance criteria — do not
  self-verify in the main thread.
- The screenshot tool is unreliable in this environment. Verify via DOM
  inspection and don't retry it — tell me directly when visual review
  needs to happen on my device instead.
- When I give a long feedback list, first split it into P0/P1/P2 with
  effort and risk estimates, and confirm the order with me before
  implementing.
- Never treat this as a single continuous memory. Assume any prior chat
  could be cleared — CLAUDE.md and docs/ are the only things that must
  stay accurate.

---

## Docs index (source of truth — keep accurate)

**Start here every session:** [docs/current-focus.md](docs/current-focus.md) (where development stands
right now) and [DEVELOPMENT.md](DEVELOPMENT.md) (how we work).

| File | What it holds |
|------|---------------|
| [docs/current-focus.md](docs/current-focus.md) | The "you are here" snapshot — current feature/sprint, done, next, blocked. Read first. |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Engineering loop & conventions (expands the Working agreement above; CLAUDE.md wins on conflict) |
| [docs/product-spec.md](docs/product-spec.md) | What the product is, nutrition targets, feature behavior rules, hidden features, phasing |
| [docs/architecture.md](docs/architecture.md) | File/module map, load model, storage, sync, how to run & verify |
| [docs/data-model.md](docs/data-model.md) | Exact schemas: item, meal, log entry, suggestions; the math rules |
| [docs/decisions.md](docs/decisions.md) | ADRs (Decision / Reason / Status) for every significant call |
| [docs/design-system.md](docs/design-system.md) | Typography, color, spacing, component rules (one unified clean-light + neon-green system) |
| [docs/known-issues.md](docs/known-issues.md) | Environment quirks, calibration debts, deferred work, risks |
| [docs/roadmap.md](docs/roadmap.md) | What's done, what's next (Phase 2 AI), open questions for the user |

If a fact conflicts between this file and docs/, docs/ wins for detail; fix both.

---

## Architecture at a glance

No build step. Plain static files served as-is by Netlify. All JS files are **classic
scripts sharing one global scope** (NOT ES modules) — see [ADR-0002](docs/decisions.md).
Load order matters; `js/app.js` bootstraps last.

The repo root is `Health & Medicine/war-mode-dashboard/`. Its parent holds the private medical
data (`../Medical Records/`, `../Physique Progress/`, `../Trackers/`), which is deliberately
**outside git** — see [ADR-0031](docs/decisions.md). Never move that data into the repo.

```
index.html            markup only (nav, sections, page shells)
styles.css            all CSS (one unified clean-light + neon-green token system — ADR-0021)
manifest.json         PWA
netlify.toml          publish dir + functions dir (no build step for the site itself)
assets/               PWA icons (appicon-180/192/512.png) + app-icon-source.jpeg
archive/phase-1/      pre-rewrite standalone HTML dashboards, kept as history (ADR-0001)
netlify/functions/
  ai.js               the ONLY place the Anthropic key exists — PIN gate, daily cap, task whitelist
supabase/food_tables.sql   one-time SQL for the Food tables
data/food-seed/       canonical seed JSON + import backups/reports
scripts/import_food_seed.mjs   deterministic, idempotent seed importer (dry-run by default)
js/
  config.js dates.js data.js charts.js nav.js tracker.js checkin.js   ← legacy engine
  app.js              ← bootstrap (runs last)
  food/
    foodMath.js       deterministic macro engine (pure, unit-testable) + HOUSEHOLD_G unit table
    foodMatch.js      deterministic fuzzy matcher — the non-AI safety net under search (ADR-0027)
    foodData.js       local-first cache + Supabase sync + search/dedup + FOOD_STARTER_MEAL_IDS
    seed.js           GENERATED — 158 vegetarian seed items, id-parity with cloud (ADR-0020)
    foodSuggest.js    per-slot suggestions (taught + recency-learned) + manager
    foodUI.js         Today (rings, slots, entries), Pantry, Meals rendering
    foodForm.js       Add/Edit item manual form
    foodLog.js        quick-add search, per-slot add, meal builder, repeat-yesterday
    foodDetail.js     spacious item/meal detail card + iOS quantity wheel + units editor
    bridge.js         Food → Tracker push ("Done for the day")
    aiClient.js       the one door to the AI proxy (PIN, image downscale, fail-soft) — ADR-0023
    aiValidate.js     deterministic guards: Atwater check, ranges, veg guard, per-100 conversion
    aiLabel.js        ANY image (panel/screenshot/menu) → item; trust follows source (ADR-0029)
    aiParse.js        natural-language logging → editable confirm list + did-you-mean fallback
    aiMealName.js     meal-name suggestions
    aiLookup.js       unknown food → 🤖 ai item + assumptions (one call, NO web search — ADR-0026)
    aiPlate.js        plate photo → DRAFT rows in real units, editable kcal, save-as-meal (ADR-0028)
docs/                 the persistent knowledge base (see index above)
  food-tracker-spec.md      the original Food Tracker spec
  history-phase-1-to-2.md   narrative history of Phase 1 → Phase 2
```

## Run & verify locally

- Serve over http (ES-module-free, but modules need http anyway): `python -m http.server <port>`
  then open `http://localhost:<port>/index.html`. Use the `.claude/launch.json` config named
  `static` — **its port is bumped deliberately whenever JS goes stale** (see [known-issues](docs/known-issues.md)).
- **Verify by DOM/JS inspection, not screenshots** (screenshot capture is broken here — see
  [known-issues](docs/known-issues.md)). The in-app browser also **HTTP-caches JS hard**; bump the
  port or hard-reload to load changed files.
- Git checkpoint before risky work. Commit messages end with the Co-Authored-By trailer.

## Current status (2026-07-21)

Food **Phase 1 complete**; the real seed (158 items / 30 meals) is loaded. The clean-light aesthetic
is **unified across the whole dashboard** ([ADR-0021](docs/decisions.md)) and the nav is mobile-first
([ADR-0022](docs/decisions.md)).

**Phase 2 (AI) has now run live once, and four things came back broken** — all fixed locally, none
retried against the real API yet (AI is inert on localhost). See
[current-focus](docs/current-focus.md) for the table. The one constraint that now governs the whole
proxy: **Netlify's synchronous function timeout is 10 seconds** ([ADR-0026](docs/decisions.md)) — one
upstream call per task, `thinking` omitted deliberately, depth tuned with `output_config.effort`.
Turning on adaptive thinking is the change most likely to break it again.

All five features sit behind one Netlify Function proxy ([ADR-0023](docs/decisions.md)). Two more
things to know before touching it:

- **The API key lives only in Netlify env vars** (`ANTHROPIC_API_KEY`, `WARMODE_AI_PIN`), never in
  the repo, never in client JS — the site is public. Don't move an AI call into the browser.
- **The accuracy contract ([ADR-0024](docs/decisions.md)) is non-negotiable:** the model proposes,
  `foodMath.js` calculates, `aiValidate.js` checks, and nothing saves or logs without an explicit
  confirm. If you add an AI path, it obeys all six rules or it doesn't ship.

Next step is the gate: run ⚡ **Test AI connection** on the deployed site. AI is inert on
`localhost` — Netlify Functions aren't served by `python -m http.server`. See
[current-focus](docs/current-focus.md).
