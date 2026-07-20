# CLAUDE.md — WAR MODE

Personal health dashboard for one user (Adarsh Nagar, 27M, Bengaluru, vegetarian).
Static site: GitHub → Netlify, backed by Supabase with a localStorage fallback. Installable PWA.
Repo: https://github.com/adarsh733/war-mode-dashboard

Four top-level sections: **🏋️ Fitness**, **🩺 Health**, **📓 Tracker**, **🍽️ Food**.
The Food tracker is the actively-developed area; the other three are stable legacy.

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

| File | What it holds |
|------|---------------|
| [docs/product-spec.md](docs/product-spec.md) | What the product is, nutrition targets, feature behavior rules, hidden features, phasing |
| [docs/architecture.md](docs/architecture.md) | File/module map, load model, storage, sync, how to run & verify |
| [docs/data-model.md](docs/data-model.md) | Exact schemas: item, meal, log entry, suggestions; the math rules |
| [docs/decisions.md](docs/decisions.md) | ADRs (Decision / Reason / Status) for every significant call |
| [docs/design-system.md](docs/design-system.md) | Typography, color, spacing, component rules (warm legacy + clean-light Food) |
| [docs/known-issues.md](docs/known-issues.md) | Environment quirks, calibration debts, deferred work, risks |
| [docs/roadmap.md](docs/roadmap.md) | What's done, what's next (Phase 2 AI), open questions for the user |

If a fact conflicts between this file and docs/, docs/ wins for detail; fix both.

---

## Architecture at a glance

No build step. Plain static files served as-is by Netlify. All JS files are **classic
scripts sharing one global scope** (NOT ES modules) — see [ADR-0002](docs/decisions.md).
Load order matters; `js/app.js` bootstraps last.

```
index.html            markup only (nav, sections, page shells)
styles.css            all CSS (warm legacy tokens + Food v3 clean-light tokens)
manifest.json         PWA
appicon-*.png         PWA icons
supabase/food_tables.sql   one-time SQL for the Food tables
js/
  config.js dates.js data.js charts.js nav.js tracker.js checkin.js   ← legacy engine
  app.js              ← bootstrap (runs last)
  food/
    foodMath.js       deterministic macro engine (pure, unit-testable)
    foodData.js       local-first cache + Supabase sync + search/dedup helpers
    seed.js           ~50 vegetarian seed items + aliases
    foodSuggest.js    per-slot suggestions (taught + recency-learned) + manager
    foodUI.js         Today (rings, slots, entries), Pantry, Meals rendering
    foodForm.js       Add/Edit item manual form
    foodLog.js        quick-add search, per-slot add, meal builder, repeat-yesterday
    foodDetail.js     spacious item/meal detail card + iOS quantity wheel + units editor
    bridge.js         Food → Tracker push ("Done for the day")
docs/                 the persistent knowledge base (see index above)
```

## Run & verify locally

- Serve over http (ES-module-free, but modules need http anyway): `python -m http.server 8130`
  then open `http://localhost:8130/index.html`. A `.claude/launch.json` config named `static` exists.
- **Verify by DOM/JS inspection, not screenshots** (screenshot capture is broken here — see
  [known-issues](docs/known-issues.md)). The in-app browser also **HTTP-caches JS hard**; bump the
  port or hard-reload to load changed files.
- Git checkpoint before risky work. Commit messages end with the Co-Authored-By trailer.

## Current status (2026-07-20)

Food **Phase 1 complete** (no AI) and **redesigned** to a clean-light aesthetic. Phase 2 (AI) not
started and is gated on a Netlify→Anthropic connectivity test. See [roadmap](docs/roadmap.md).
