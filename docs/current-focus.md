# Current Focus

> The fast **"where are we right now"** snapshot — read this first each session.
> Full plan & context: [roadmap.md](roadmap.md). Keep this short; update it whenever the focus moves.
>
> _Last updated: 2026-07-21_

## Current feature
📱 **Mobile-app feel + nav restructure** (just shipped) → next up: 🍽️ Food Phase 2 (AI)

## Current sprint
**Made it behave like a phone app, and put the daily surfaces first.** Nav is now
**Tracker | Food | ··· More**, with Fitness/Health behind More; four unused pages deleted; iOS
input-zoom and sideways-scroll drift fixed. See [ADR-0022](decisions.md).

## Completed (this arc)
- ✅ **Mobile correctness + nav restructure** ([ADR-0022](decisions.md)) — top bar now auto-hides on
  *every* tab (was Food-only); all form controls forced ≥16px on touch so iOS stops zooming and
  sticking; `overflow-x:clip` + overscroll containment kills the sideways drift; safe-area insets;
  chip rows scroll instead of wrapping; `fit-training`, `fit-nutrition`, `h-meds`, `h-actions` deleted.
- ✅ **Dashboard-wide unification** ([ADR-0021](decisions.md)) — all legacy fonts (Oswald/Fraunces/
  DM Sans) retired for **Plus Jakarta Sans**; terracotta → **neon green** brand accent + `--grad`;
  one identical toggle accent on every tab; dark hero banners removed from Fitness/Health; Tracker
  command deck restyled light; `-ink` token variants added so pill/badge text passes WCAG AA;
  `cWaist`/`cComp` charts moved to `--violet` to avoid an accent/green collision.
- ✅ **Real seed loaded** — 158 items + 30 meals imported to Supabase via
  `scripts/import_food_seed.mjs` (smart-merge, no dupes, verified data preserved, logs intact);
  `js/food/seed.js` regenerated to match. See [ADR-0019/0020](decisions.md).
- ✅ Repo consolidation + restructure into classic-script modules
- ✅ Food Phase 1 (no AI): pantry/items, meals, logging, oil capture, Tracker bridge
- ✅ Hero: calories + protein **rings** (target 1,750 kcal + 150 buffer, 180 g protein)
- ✅ Always-on meal **slots** with per-slot subtotals + a `+` on each
- ✅ **Smart** recency-weighted suggestions (learns from what he logs)
- ✅ Spacious **detail card** + iOS **quantity wheel** + per-product **units**
- ✅ Per-day meal **overrides**; **manual "Done for the day"** push (no premature ticking)
- ✅ Aliases, hidden Pantry, scroll-hide top bar, **Plus Jakarta Sans**
- ✅ Docs / knowledge base (CLAUDE.md + docs/)

## Next
- ⬜ **On-device check on the phone** — the mobile fixes (no input zoom, no sideways drift, safe-area
  insets on a notched screen) can only be truly confirmed there; also button label legibility
  (white-on-neon is ~3.0:1 by design — see the tradeoff note in [design-system.md](design-system.md))
- ⬜ Pre-seed his real breakfast/lunch/dinner suggestions (per-slot)
- ⬜ Calibrate ~15 most-eaten items seed → verified (composite dishes vary by kitchen)
- ⬜ **Phase 2 gate:** test Anthropic API from Netlify (CORS / proxy) — do before any AI UI
- ⬜ Phase 2: label scan · screenshot import · natural-language logging · AI estimate + dedup

## Blocked / needs the user
- 🚧 **Visual review must happen on his device** — screenshot capture is broken here (the preview
  pane reports a 0×0 viewport, so Chart.js canvases never paint). Verify via DOM/computed styles.
- 🚧 Needs his real per-meal foods + calibrated numbers
