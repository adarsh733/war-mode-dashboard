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

## Product quirks
- **Drawer search is first-match-wins** over each page's entire text (`js/nav.js`), so a query can
  land on a page that merely *links* to the topic. E.g. "sleep" and "thyroid" both open `fit-home`,
  whose nav-card labels contain those words. Pre-existing, not caused by the nav restructure. A real
  fix would rank matches (title/heading hits first) instead of taking the first page that contains
  the string. Note `'more-home'` is deliberately the **last** `PAGES` key so the More landing — which
  lists the words "Fitness"/"Health" — doesn't hijack those searches.

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

## Phase 2 / AI layer

- **AI only works on the deployed site.** Netlify Functions are not served by
  `python -m http.server`, so every AI entry point returns a "use the deployed site" message
  locally. `aiIsLocalStatic()` detects this deliberately so the failure is legible instead of a 404.
- **The daily call cap is best-effort.** The counter lives in function memory, and Netlify may run
  several warm instances, so the real ceiling is `cap × instances`. The hard money guard is the
  monthly spend limit in the Anthropic console. Making it exact would need a shared store — a
  reserved `food_meals` row (like `__suggestions__`) would work without new SQL if it ever matters.
- **Netlify's 10s synchronous-function timeout** is why no AI task requests extended thinking and
  why `max_tokens` is kept tight. If real-world calls start timing out (most likely on plate photos),
  the fix is a background function plus polling, or bumping the function timeout on a paid plan.
- **Structured outputs + server-side web search are not proven to compose**, so `lookup` deliberately
  makes **two** calls (research with web search → structure the notes). Costs ~2c on a rare path;
  revisit if they're confirmed compatible.
- **Prompt caching probably never engages.** The stable prefix (system + pantry index) is ~2.5k
  tokens and Opus 4.8's minimum cacheable prefix is 4,096 — below the floor, caching silently does
  nothing. Harmless at this volume; `usage.cache_read_input_tokens` will confirm it either way.
- **Unknown units fall back to the default serving, not grams.** Found during verification: a model
  reply of `unit:"1 roti (40g)"` (a label that doesn't exist on the item) was resolving to **3 grams**
  for "3 roti" — a silent ~350 kcal error. `aiResolveUnit()` now returns `{si, guessed}` and prefers
  the item's default serving, with a visible "check it" note on the row. Watch this class of bug:
  anything that silently coerces a unit is dangerous.
- **`mergeCloud` never deletes.** Rows removed from Supabase (e.g. the test meals deleted during the
  seed import) survive in a device's localStorage forever, so an old device can still show them.
  Pre-existing behaviour, unrelated to AI, but worth knowing when counts disagree between devices.

### Bugs found by review + testing, and fixed (kept as a watch-list)
These are the failure *classes* this codebase is prone to — worth re-checking after any AI change.

- **`lookup` was rejected as an unknown task.** The whitelist tested `TASKS[task]`, but `lookup` is
  served by a two-call branch and has no `TASKS` entry — so the entire web-lookup feature 400'd on
  every call. Fixed with an explicit `PUBLIC_TASKS` list. It slipped past the first round of tests
  because the guard test only probed `ping`/`evil`/`lookup_structure` and the browser tests mocked
  `aiCall`. **Lesson: test each public task name against the real handler.**
- **`htmlSafe()` inside an `onclick="…"` is actively wrong.** The browser HTML-decodes an attribute
  *before* parsing it as JS, so `&#39;` becomes a quote again and closes the string — breaking on any
  apostrophe and executable when the string is model-supplied. Use `aiJsAttr()`
  (`JSON.stringify` + escape `"`), never `htmlSafe`, for anything entering an inline handler.
- **`fail` didn't disable Save until a field was touched** — the initial render omitted the
  `disabled` attribute. Save re-checked before writing, so no bad data could land, but the guard
  looked stronger than it was.
- **A full re-render on every keystroke** in the qty/grams inputs swapped the focused node out.
  Those two now patch only the macro line and the total.
- **`aiPickImage` never settled when the picker was cancelled**, hanging the caller and leaking an
  `<input>` per attempt. Now resolves on `cancel` plus a window-focus fallback.
- **Plate photo skipped dedup**, so the same home-cooked dish photographed twice created two items.
  Now runs `findItemByNameBrand` first, like the other AI paths.
- **`lookup` costs two upstream calls** but decremented the cap once; it now consumes 2 units.
- **Unknown units silently became grams** (see above) — the highest-severity find, caught only
  because the test asserted the *number* rather than that the flow "worked".
