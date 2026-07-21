# Current Focus

> The fast **"where are we right now"** snapshot — read this first each session.
> Full plan & context: [roadmap.md](roadmap.md). Keep this short; update it whenever the focus moves.
>
> _Last updated: 2026-07-21_

## Current feature
🤖 **Food Phase 2 — the AI layer** (built; awaiting its first live run on the deployed site)

## Current sprint
**All five AI features built behind one Netlify Function proxy.** Label scan · natural-language
logging · meal naming · web lookup · plate photo. Governed by the accuracy contract
([ADR-0024](decisions.md)): AI proposes, `foodMath.js` calculates, a deterministic validator checks,
nothing saves or logs without an explicit confirm.
**One thing blocks "done":** the live round-trip has never run. Netlify Functions don't exist on the
local static server, so the real gate test is ⚡ **Test AI connection** on the deployed site.

## Completed (this arc)
- ✅ **Phase 2 AI layer** ([ADR-0023/0024/0025](decisions.md)) — proxy (PIN + daily cap + task
  whitelist) and all five features. Verified locally: **158/158 seed items pass the validator with
  zero false positives**, 8/8 deliberately corrupted macro sets caught, every proxy guard
  (405/401/400/429/500) passes, the API key never appears in a response, and no AI path can write
  to the pantry or the log without a click. Caught and fixed one real bug in the process:
  "3 roti" was resolving to **3 grams** when the model returned an unknown unit label.
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
- ⬜ **Run ⚡ Test AI connection on the deployed site** — the real Phase 2 gate
- ⬜ Then scan one real label end-to-end and check the numbers against the packet by hand
- ⬜ Watch actual API spend for a week (`usage` is returned on every call)

## Blocked / needs the user
- 🚧 **Visual review must happen on his device** — screenshot capture is broken here (the preview
  pane reports a 0×0 viewport, so Chart.js canvases never paint). Verify via DOM/computed styles.
- 🚧 Needs his real per-meal foods + calibrated numbers
- 🚧 **Stale test rows in the cloud:** `food_log` still holds `2099-01-01` and `2099-01-02` from old
  test sessions. Harmless (he'd have to navigate to 2099 to see them) but they're junk — awaiting
  his go-ahead to delete.
