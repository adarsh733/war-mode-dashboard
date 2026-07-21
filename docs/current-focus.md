# Current Focus

> The fast **"where are we right now"** snapshot — read this first each session.
> Full plan & context: [roadmap.md](roadmap.md). Keep this short; update it whenever the focus moves.
>
> _Last updated: 2026-07-21_

## Current feature
🤖 **Food Phase 2 — the AI layer, after its first real day of use** (fixes built locally, not yet
deployed)

## Current sprint
Phase 2 ran live for the first time and four things came back broken. All are fixed locally and
verified; **none has been exercised against the real API yet** — AI is inert on localhost, so the
next step is deploy + retry on the phone.

| # | What was wrong | Root cause | Fix |
|---|---|---|---|
| 1 | Lookup failed 100% of the time (HTTP 504) | two Opus calls + web search vs Netlify's **10s** timeout | one call, model knowledge, `assumptions` instead of sources ([ADR-0026](decisions.md)) |
| 2 | "paneer lababdar sabzi, 2 garlic naan, 1 glass lassi" matched **nothing** | pantry index sent `'i:'+id`, so the model echoed a decorated id and every row fell to "unknown"; units were never sent | bare ids + unit labels, defensive resolve, and a deterministic fuzzy matcher underneath ([ADR-0027](decisions.md)) |
| 3 | Label scan was camera-only | forced `capture:'environment'`, prompt assumed a printed panel | 📸 Add from a photo — camera or screenshot, trust follows source ([ADR-0029](decisions.md)) |
| 4 | 30 seeded combos cluttered the Meals tab | `renderMeals()` showed every non-reserved meal | hidden by id, still loggable from Today ([ADR-0030](decisions.md)) |

Plate photo was the one feature he liked, so it was deepened rather than repaired: portions are now
counted in the unit the food comes in (1 coconut, 3 roti, 1 katori), calories are correctable, and a
plate can be saved as a meal ([ADR-0028](decisions.md)). Suggestions moved below the logged entries
and collapsed by default.

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
- ⬜ **Deploy, then re-run the four that failed** — a real lookup, a HealthifyMe screenshot import,
  the sentence "paneer lababdar sabzi, 2 garlic naan and 1 glass lassi", and one plate photo. Every
  fix is verified against mocks and against his real 178-item pantry, but none has met the live API.
- ⬜ **Watch lookup latency.** The 10s budget is the whole design constraint now; if a real lookup
  still times out the next move is a background function + polling, not a longer synchronous call.
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
- 🚧 **Stale test rows in the cloud, now in two places** — awaiting his go-ahead to delete:
  - `food_log`: `2099-01-01`, `2099-01-02`
  - `food_meals`: **“Test Smoothie”, “ZZ Test Bowl” ×2** — these DO show in his Meals tab, so they're
    the visible ones. (The 2098-03-03 day and the Coconut/Roti/ZZ Plate Test rows created during
    this session's verification were cleaned up immediately; item and meal counts are back to
    178 / 38.)
