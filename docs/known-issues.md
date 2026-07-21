# Known Issues & Debts — WAR MODE

> Environment quirks, calibration debts, deferred work, and risks. Keep current.

## Environment / tooling
- **Screenshot tool is broken here.** `computer{action:"screenshot"}` times out every time, on all
  ports — not a page bug (it failed on the untouched baseline too). **Verify via DOM/JS inspection.**
  Real visual review must happen on the user's device.
- **The preview pane reports a 0×0 viewport** (`window.innerWidth/innerHeight === 0`, `.wrap` ~44px).
  Consequence: **Chart.js refuses to paint** — every chart/ring canvas reads back 0 painted pixels
  even though the instances build fine. Raw canvas 2D still works (a control `fillRect` reads back
  normally), so a blank chart canvas here is **not** a regression. To verify chart/ring colors,
  inspect the instances instead: `charts.cWaist.data.datasets[].borderColor`,
  `foodCharts.ringKcal.data.datasets[0].backgroundColor`. Note `charts`/`DB` are top-level `const`s
  in classic scripts — reachable by bare name, **not** on `window`.
- **Preview browser caches JS hard.** After editing a `.js`, a normal reload can serve stale code
  (bit us: a `nav.js` change didn't take until we moved the dev server to a new port). Workaround:
  bump the port in `.claude/launch.json` and restart, or hard-reload.
- Windows shell: `cat << 'EOF'` heredocs with quotes broke once — prefer writing content to a temp
  file and `cat tempfile >> target` for large appends.

## Data / calibration debts
- **Seed macros are generic** (`trust:"seed"`, ~50 items). They WILL be off for his kitchen.
  He should calibrate his ~15 most-eaten items (editing an item flips it seed→verified).
- **Suggestion defaults** point at seed items. He was invited to send his real
  breakfast/lunch/dinner foods to pre-seed suggestions; until then the system learns from logs.
- **50 seed items were pushed to his Supabase** on first run (expected, by design).
- **Possible stale Tracker value:** before the manual-push change (ADR-0009), his real 20 Jul-ish
  logging may have auto-written a partial calorie figure (~1,715) into `tracker_days`. New logs
  no longer auto-push; he can correct via "Done for the day" or edit the tracker.
- **His packaged products** (Whole Truth WPI whey, Epigamia) are seeded with reasonable-but-generic
  numbers; only Sids Farm milk is seeded verified from a real label. Verify whey scoop weight/macros.

## UX / implementation debts
- **Meal builder editor** (`renderMealEditor` in `foodLog.js`) still uses the older sheet styling,
  not the full clean-light detail-card treatment. Functional, but visually behind the new cards.
- **Add-Item screen** intentionally not redesigned (user said "leave for now").
- **Quantity wheel** is a scroll-snap implementation; verified functional in Chromium via DOM.
  Needs a real touch device pass (momentum/snap feel) during the user's review.
- **Drag-to-reorder** uses HTML5 DnD (good on desktop); touch-drag on mobile may need a long-press
  or a pointer-based fallback — confirm on device.
- **Suggestions cloud sync** rides a reserved `food_meals` row; primary is localStorage, so a fresh
  device shows defaults until it syncs/learns.
- Rest of app (Fitness/Health/Tracker) not migrated to clean-light — intentional (ADR-0013).

## Risks / open
- **Phase 2 #1 risk:** direct browser→Anthropic calls from Netlify may be CORS/auth-blocked; may
  need a Netlify Function proxy. Untested. (ADR-0011)
- No automated tests yet; verification is manual DOM/JS checks. Consider a tiny `foodMath` test
  harness before Phase 2 math-adjacent work.
