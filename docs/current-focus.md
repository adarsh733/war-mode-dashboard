# Current Focus

> The fast **"where are we right now"** snapshot — read this first each session.
> Full plan & context: [roadmap.md](roadmap.md). Keep this short; update it whenever the focus moves.
>
> _Last updated: 2026-07-20_

## Current feature
🍽️ **Food module**

## Current sprint
**Clean & light, mobile-first Food redesign** (scoped to the Food tab). Shipped locally, **awaiting
review on the user's device.**

## Completed (this arc)
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
- ⬜ User reviews the redesigned Food tab on device → collect tuning feedback
- ⬜ Pre-seed his real breakfast/lunch/dinner suggestions
- ⬜ Calibrate ~15 most-eaten seed items (seed → verified)
- ⬜ **Phase 2 gate:** test Anthropic API from Netlify (CORS / proxy) — do before any AI UI
- ⬜ Phase 2: label scan · screenshot import · natural-language logging · AI estimate + dedup

## Blocked / needs the user
- 🚧 **Visual review must happen on his device** — screenshot tool is broken here
- 🚧 Needs his real per-meal foods + calibrated numbers
- 🚧 Decide whether to replicate the clean-light look to the other tabs
- 🚧 Redesign + docs **not yet pushed to GitHub** (awaiting his go-ahead)
