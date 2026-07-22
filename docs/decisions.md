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
- **Status:** **Superseded by [ADR-0023](#adr-0023--all-ai-traffic-goes-through-a-netlify-function-proxy-with-a-shared-pin).**
  The premise was wrong: the test would have been moot either way. The site is public, so a key in
  client JS is readable by any visitor regardless of what CORS permits — a direct browser call was
  never viable. The proxy is mandatory, not a fallback, and the gate became "does the proxy
  round-trip work" instead.

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

### ADR-0019 — Seed import via smart-merge (name + curated alias map), not literal name-match
- **Decision:** Import `data/food-seed/food-seed.v1.1.json` (151 items + 30 meals) into the live
  `food_items`/`food_meals` tables with a re-runnable script (`scripts/import_food_seed.mjs`).
  Match seed→existing by the spec's normalization
  (`name.trim().toLowerCase().replace(/\s+/g,' ')`) **plus a curated old→new alias map** (21 pairs,
  e.g. `Roti / Chapati` → `Roti / Chapati (plain, no oil)`). Replace-on-match **preserves the
  existing `id`/`useCount`/`createdAt`** and refreshes only nutrition fields; **verified rows are
  never overwritten**; known test rows are deleted. Deterministic — no macro arithmetic in the
  importer (per-100 copied verbatim). Dry-run by default; `--commit` writes after a full backup.
- **Reason:** The new names are richer than the legacy app-seed names, so literal matching would
  leave ~27 staples as visible duplicates — and several (`seed_roti`, `seed_oats`, `seed_curd`,
  `seed_toordal`…) are referenced by logged days, so they can't be deleted. Alias-merging onto the
  legacy ids keeps the log/meal history linked, kills the duplicates, and refreshes the data. The
  app's original `_SEED_ALIASES` (never persisted to cloud) are re-applied so search still matches
  `chapati`/`chole`/`dahi`/`badam`.
- **Status:** Accepted. Idempotent (a second run = 0 inserts/0 deletes). Result: 51→158 items,
  3→30 meals, 0 duplicate names, `Sids Farm` (verified) untouched.

### ADR-0020 — `js/food/seed.js` is now GENERATED from the canonical seed JSON
- **Decision:** The canonical seed is `data/food-seed/food-seed.v1.1.json` (the redundant
  `warmode_food_items_only.json` was deleted; both files moved out of the repo root into
  `data/food-seed/`). `js/food/seed.js` is regenerated from the import report to **mirror the live
  cloud item set 1:1, reusing the same ids** (merged staples keep `seed_*`, new items keep `itm_*`);
  it is marked generated and should not be hand-edited.
- **Reason:** A fresh device / cleared cache first-run-seeds locally then reconciles with cloud by
  `id`. If `seed.js` used different ids than the cloud, reconcile would re-create duplicates. Id
  parity makes the import durable across devices.
- **Status:** Accepted. `_SEED_ALIASES` behavior folded into each item's `aliases`; `useCount`
  reset to 0 (cloud carries real usage and wins on reconcile).

### ADR-0021 — Unify the whole dashboard on the clean-light + neon-green system
- **Decision:** Replicate the Food tab's clean-light design across **all four tabs**, replacing the
  warm legacy identity. Concretely: (a) **Plus Jakarta Sans everywhere** — Oswald, Fraunces and DM
  Sans removed from CSS, from inline `style=""` in `index.html`, from JS-generated markup in
  `checkin.js`, and from the Chart.js default; only Jakarta is loaded. (b) A light palette with a
  **neon-green brand accent** (`--accent #1faa5d`, bright stop `#63e79a`, `--grad`) replacing the
  terracotta `--accent`. (c) **One green across every tab** — the per-section toggle accents
  (fitness=ink, health=terracotta, tracker=green, food=blue) are gone; Food's `--fgreen` points at
  the same brand green. (d) The dark hero **banners are deleted** from Fitness and Health; the
  Tracker command deck is **kept but restyled** from near-black to a light card. (e) Gradients are
  restrained to primary interactive surfaces. This **supersedes the two-coexisting-systems premise
  of [ADR-0013](#adr-0013)**, whose own condition was "get user approval before replicating" — given.
- **Reason:** Two design languages in one app read as unfinished; the user asked for consistency,
  a light theme and a neon-green identity. Doing it as a **token remap** rather than a component
  rewrite meant the recolor cascaded automatically through inline styles, `cssv()` chart colors and
  the Food canvas rings — a presentational-only change with no logic touched.
- **Consequences / guards:**
  - `--accent` became green while `--green` already existed, so any chart plotting both would show
    two identical series. `cWaist` and `cComp` reassign their `--accent` series to **`--violet`**.
    *Rule: never plot `--accent` and `--green` in the same chart.*
  - Lightening the palette dropped pill/badge text contrast to ~2.1–3.2:1. Added **`-ink` token
    variants** (`--green-ink`, `--amber-ink`, `--red-ink`, `--blue-ink`, `--accent-ink`) for text on
    tints; base tokens remain for charts/bars/rings. All now pass WCAG AA (~5.2–5.9:1).
  - `--fgreen` is a **literal hex**, not `var(--accent)` — `foodRing` reads it via `cssv()` and needs
    a real color string for canvas.
  - `manifest.json` `theme_color`/`background_color` updated too, else the installed PWA would still
    flash the old dark identity on its splash screen.
  - Removing the banners orphaned `dayCountBanner`; its writer in `js/data.js` was deleted. The
    topbar's `.creed-line` is a *different* element and remains.
- **Status:** Accepted. Verified by DOM/computed-style inspection across all four tabs (screenshots
  are unreliable in this environment — the preview pane reports a 0×0 viewport, so Chart.js does not
  paint; colors were confirmed on the chart instances instead). Zero legacy-font elements, zero
  console errors.
- **Known tradeoff:** white-on-neon button text is ~3.0:1, below AA — a deliberate choice to keep the
  "lightest neon green" look. Fix if needed by darkening the gradient to ~`#2ec46f → #1a9450`.

### ADR-0022 — Tracker & Food promoted to top-level; Fitness/Health behind "More"; mobile-app behaviour
- **Decision:** Three top-level tabs — **Tracker | Food | ··· More**. Fitness and Health lose their
  tabs and live behind a `#more-home` landing of two big header-only `.navcard.lg` cards. Four
  rarely-used pages are **deleted outright**: `fit-training`, `fit-nutrition`, `h-meds`, `h-actions`
  (markup + subnav chips + drawer links + landing nav cards + `PAGES` entries). `fit-sleep` is kept.
  The auto-hiding top bar, previously Food-only, now applies to **every** section. The drawer keeps
  the full nav as the escape hatch, reordered Tracker → Food → Fitness → Health.
- **Reason:** Tracker and Food are used daily; Fitness and Health are reference material read
  occasionally. Splitting "top-level tab" from "section" keeps the daily surfaces uncluttered without
  burying the rest. Introduced `SEC_TAB` (section → tab) plus a `paintNav()` helper so Fitness/Health
  pages still light a tab (**More**) instead of none.
- **Mobile behaviour shipped alongside:**
  - **iOS zoom-on-focus:** any control under **16px** makes Safari zoom in and never restore. One
    rule — `@media(max-width:640px),(pointer:coarse){input,select,textarea{font-size:16px!important}}`.
    Keyed on `pointer:coarse` too, so a phone in **landscape** (wide viewport) is still covered.
    `!important` is necessary, not lazy: the designed sizes sit in higher-specificity rules
    (`.metric input`, `table.weekgrid input.gnum`, `.drawer .dsearch`) and a few **inline** styles,
    and an inline declaration beats any selector. Deliberately **not** `maximum-scale=1`, which
    "fixes" it by disabling pinch-zoom entirely.
  - **Sideways drift / white gutters:** `html,body{overflow-x:clip}` — **`clip`, not `hidden`**,
    because `hidden` creates a scroll container and silently breaks the sticky topbar/subnav — plus
    `overscroll-behavior:none` on body and `overscroll-behavior-x:contain` on every horizontally
    scrollable child (`.tscroll`, `.subnav`, chip rows) to stop scroll chaining out to the page.
  - **Safe areas:** insets must be folded into the *existing* `.wrap`/`.drawer` rules — declaring
    them earlier is dead code, since those rules use the `padding` shorthand and come later. And
    `.subnav`'s sticky `top` must track the topbar's inset (`calc(105px + env(safe-area-inset-top))`),
    or the chip rail hides behind the topbar on a notched iOS PWA.
  - Chip rows (`.fsugg-row`, `.fquick-actions`, `.fslot-chips`, `.fd-chips`) scroll horizontally
    instead of wrapping, so suggestions stop crowding the card.
- **Status:** Accepted. Verified structurally at a real 375×812 viewport: all 111 controls ≥16px,
  no horizontal document overflow, sticky preserved, all 18 routes correct, topbar hide/reveal
  confirmed on a **non-Food** tab, zero console errors. On-device confirmation still pending.
- **Known pre-existing quirk (not introduced here):** drawer search is first-match-wins over each
  page's full text, so "sleep"/"thyroid" land on `fit-home` because its nav-card labels contain those
  words. Unchanged by this ADR; fix would be to rank matches rather than take the first.

### ADR-0023 — All AI traffic goes through a Netlify Function proxy with a shared PIN
- **Decision:** The browser never talks to Anthropic. `netlify/functions/ai.js` is the only place
  the API key exists (Netlify env var `ANTHROPIC_API_KEY`, marked secret). The client posts a **task
  name + payload**; the function builds the system prompt, JSON schema, model and tool list
  server-side. Access is gated on a shared PIN (`WARMODE_AI_PIN`, sent as `x-warmode-pin`, stored in
  localStorage on his device) plus a per-day call cap.
- **Reason:** The dashboard is a **public** static site — anything in `js/` is readable by every
  visitor, so a client-side key would be stolen and auto-revoked. The PIN stops a stranger who finds
  the function URL from spending his credits; the task whitelist stops the endpoint from being used
  as a free general-purpose Claude relay (a caller cannot choose the model, the prompt, or the
  tools).
- **Status:** Accepted. Supersedes [ADR-0011](#adr-0011--phase-2-ai-gated-on-a-netlifyanthropic-connectivity-test).
  Model: `claude-opus-4-8` for every task (~$0.02–0.04 per action; ~$2–4/month at realistic use).
  **The daily cap is a best-effort fuse** — Netlify may run several warm instances, so the true
  ceiling is cap × instances. The hard money guard is the monthly spend limit set in the Anthropic
  console. Netlify's 10s synchronous-function timeout is why no task requests extended thinking.

### ADR-0024 — The accuracy contract: AI proposes, code calculates, a validator checks
- **Decision:** Six rules bind every AI path.
  1. **Structured outputs only** (`output_config.format` + JSON schema) — never free prose to parse.
  2. **The model never does arithmetic on quantities.** A label reading returns *what is printed*
     plus the printed serving size; `aiPer100FromPrinted()` in `js/food/aiValidate.js` does the
     per-serving→per-100 conversion. Natural-language logging recomputes every row locally with
     `macrosForAmount`/`mealTotals`. `foodMath.js` remains the only source of macro numbers.
  3. **A deterministic validator gates everything** (`aiValidate.js`): an Atwater cross-check
     (`4P + 4·net-carbs + 2·fiber + 9F ≈ kcal`, 20%/25 kcal band), range and impossible-mass checks,
     and a vegetarian guard. `fail` disables the save button; `warn` is shown but overridable.
  4. **Nothing auto-saves or auto-logs** — every proposal lands in an editable confirm card.
  5. **`trust:'verified'` is never overwritten without an explicit confirm**; dedup runs first via
     `findItemByNameBrand` ([ADR-0012](#adr-0012--ai-dedup-by-namebrandalias)).
  6. **Audit trail** — every AI-created item carries `aiMeta {source, model, at, confidence, …}`.
- **Reason:** A silent 200–300 kcal error ruins the deficit, and an LLM misreading "2.5g" as "25g"
  is exactly the failure mode to expect from a photo. The validator catches that class instantly.
  Trust levels: label scan → ⭐ `verified` (a real label he confirmed), web lookup and plate photo →
  🤖 `ai` (generic data, not his kitchen).
- **Status:** Accepted. Validated against all 158 seed items with **zero false positives**, and
  against 8 deliberately corrupted macro sets, all caught.

### ADR-0025 — Plate photos are draft-only, with forced portion + oil confirmation
- **Decision:** The plate-photo feature identifies dishes and *proposes* portions, but every row must
  pass through an explicit grams field and an oil/ghee chip before it can be logged. Dishes that
  match the pantry use **our** per-100 values, not the model's. Everything logged this way is
  `trust:'ai'`. The UI states plainly that it is a draft, not a measurement.
- **Reason:** Food *identification* from a photo is good; *portion mass* is not — a 2D image cannot
  measure volume or density, and cooking oil is invisible, which is the exact undercount this app
  was built to fix. Presenting a photo estimate as a measurement would violate the prime directive,
  so the interaction is designed to make the user supply the two numbers the model cannot see.
- **Status:** Accepted, and **extended by [ADR-0028](#adr-0028--plate-portions-are-expressed-in-the-unit-the-food-comes-in)** —
  the forced-confirmation principle is unchanged, but "an explicit grams field" turned out to be the
  wrong question to ask about a coconut.

---

### ADR-0026 — Web lookup uses model knowledge, not web search
- **Decision:** The `lookup` task is **one** structured call with no tools. The previous
  research-then-structure pair (a `web_search_20260209` pass with `max_uses: 4`, then a structuring
  call) is deleted. Source URLs are replaced by an `assumptions` array — preparation method, oil
  included or not, restaurant vs home style, brand substitutions.
- **Reason:** Netlify's synchronous function timeout is **10 seconds**, and the two-call path could
  never finish inside it. It failed with an HTTP 504 on **100% of real attempts** — the feature had
  never once worked in production. Opus already holds IFCT/NIN and USDA reference values for Indian
  and branded foods, so a single call returns substantially what the search would have found. The
  honest trade is losing citations; `assumptions` replaces them and is arguably more useful, since
  what makes a looked-up number wrong is almost always an assumption about preparation, not a bad
  source.
- **Consequences — the 10s budget now governs the whole proxy:** one upstream call per task, ever;
  `thinking` deliberately omitted (an absent thinking field means Opus 4.8 runs without thinking,
  which is why the vision tasks fit) with depth tuned via `output_config.effort` per task instead;
  and an 8s `AbortController` so a slow upstream returns our own readable sentence rather than
  Netlify's opaque gateway 504. **Do not switch on adaptive thinking here** — it is the single
  change most likely to reintroduce the timeout.
- **Status:** Accepted. If citations are ever genuinely needed, the route is a Netlify *background*
  function plus polling — not a longer synchronous call.

---

### ADR-0027 — A deterministic fuzzy matcher sits underneath the AI
- **Decision:** New pure module `js/food/foodMatch.js` scores a query against the pantry using token
  overlap + trigram Dice + prefix signals. It backs the AI's "unknown" rows with a *did you mean*
  picker, and replaces the substring test in every manual search box.
- **Reason:** "paneer lababdar sabzi" matched nothing, though Paneer Lababdar was in the pantry. Two
  causes: the pantry index sent to the model prefixed every id (`'i:' + it.id`), so the model echoed
  the decorated id straight back and `FOOD_ITEMS[id]` missed — every row fell through to "unknown";
  and search itself was `hay.includes(q)`, so one extra word or one transposed letter dropped a food
  entirely. The prefix is gone and ids are resolved defensively, but the deeper fix is having a
  non-AI second opinion: when the model says unknown, something deterministic, free and offline
  should still find the obvious near-miss.
- **The one subtle rule:** filler words (`sabzi`, `curry`, `masala`, `katori`, quantities) are **not
  stripped** — half of them appear in real pantry names. Instead they are asymmetric: a filler word
  that *matches* counts as evidence for; one that *doesn't* is excused rather than counted against.
  That single rule is what lets both "paneer lababdar **sabzi**" and "**masala** dosa" land correctly.
- **Status:** Accepted. Verified against the real seed: all 25 regression queries pass, every item
  self-matches by its own name, and nonsense still matches nothing.

---

### ADR-0028 — Plate portions are expressed in the unit the food comes in
- **Decision:** The plate-photo model proposes a **unit** (`count` / `household` / `weight`) with a
  per-unit weight, not a total gram figure — 1 coconut, 3 roti, 1 katori. `HOUSEHOLD_G` in
  `foodMath.js` holds the conversions and the app does the multiplication. Grams stay visible and
  editable underneath.
- **Reason:** ADR-0025 forced every dish through a grams field, which is unanswerable for a
  photographed coconut and unnatural for rotis. Asking for a number the user cannot estimate
  produces a worse figure than asking for one they can count.
- **Also decided — where a calorie correction lands.** Correcting a row that matched a pantry item
  writes `entry.macroOverride`, a one-off on that log entry; correcting a brand-new dish edits the
  per-100 of the item being created. Rationale: a bad photo estimate must never overwrite a ⭐
  verified item calibrated by weighing, but a new dish should be right from then on. `entryMacros()`
  honours the override and still adds oil on top.
- **Safety net:** when the model returns no pantry match, `fuzzyBestItem` (ADR-0027) gets a second
  look at a high threshold (0.72) and pre-links the row as *auto-matched, check it*. Without this a
  dish the model called "Roti" created a fourth roti in the pantry.
- **Status:** Accepted.

---

### ADR-0029 — Image import accepts any image; trust follows the source
- **Decision:** The label scanner becomes **📸 Add from a photo**, offering camera *or* gallery, and
  the model is told to expect a printed panel, an e-commerce product page, a nutrition-app
  screenshot, a menu, a recipe card or handwriting (`sourceKind` in the schema). A panel he
  photographed saves as `trust:'verified'`; anything else saves as `trust:'ai'` with a one-tap
  promote.
- **Reason:** Most of the time the numbers are already on a screen, and a screenshot is one tap where
  re-shooting a packet is not. But a screenshot of someone else's database is still someone else's
  estimate — conflating it with a label he read himself is how a guess quietly becomes a fact.
- **Status:** Accepted.

---

### ADR-0030 — Seeded starter meals are hidden from the Meals tab, not deleted
- **Decision:** The 30 generic combos from the importer are listed by id in `FOOD_STARTER_MEAL_IDS`
  and filtered out of the Meals tab. They stay fully searchable and loggable from Today. His own
  meals are untouched. No flag is written to any row.
- **Reason:** The Meals tab should hold meals *he* builds. Converting the starters into pantry items
  was the alternative, but 15 of the 30 are near-duplicates of items he already has (`Pav Bhaji
  (full plate)` vs `Pav Bhaji`), which would have put confusable rows next to the real ones and
  degraded the matcher from ADR-0027. Identifying them by id rather than by a written flag means no
  migration to half-apply, nothing to sync, and the change reverses by deleting the list.
- **Status:** Accepted.

---

### ADR-0031 — The repo owns a folder; private medical data lives outside it
- **Decision:** `Health & Medicine/` is now a plain parent folder, not the repo. The repo moved
  whole (with `.git`) into `Health & Medicine/war-mode-dashboard/`. Private data sits beside it as
  `../Medical Records/`, `../Physique Progress/`, `../Trackers/` — outside git's reach entirely.
  Inside the repo: PWA icons moved to `assets/`, the old `Phase 1 Archive/` to `archive/phase-1/`,
  and the two stray project docs (the Food Tracker spec, the Phase 1→2 history note) into `docs/`.
- **Reason:** The repo root was doing two unrelated jobs — public static site *and* personal medical
  archive — and the only thing keeping MRI reports and prescriptions off a public GitHub repo was
  three `.gitignore` lines. One mistaken `git add -f`, one edited ignore file, and private health
  records ship to a public remote. Moving the data outside the repo makes that failure impossible
  rather than merely discouraged. The `.gitignore` patterns are kept as a backstop.
- **Status:** Accepted.

### ADR-0032 — Swipe left/right moves between subtabs, as one chain across the whole app
- **Decision:** A horizontal swipe anywhere in the content moves to the next/previous **subtab**.
  The subtabs form **one linear 16-page chain** (`t-log → … → t-checkin → food-today → food-meals →
  more-home → fit-home → … → h-bloodwork`), so the last subtab of a tab continues into the **first
  subtab of the next tab**. It **stops at both ends** — no wrap-around — with a short shake
  (`.edge-nudge`) so a dead swipe doesn't read as a broken one. Pages arrive with a direction-aware
  slide (`.nav-fwd`/`.nav-back`), applied to **chip taps too** so tapping and swiping feel identical.
- **Reason:** The dashboard is used one-handed on a phone; reaching for the chip rail for every move
  was the main friction. One continuous chain means you never have to think about tab boundaries.
- **Key design calls:**
  - **The chain is derived from the DOM**, not hardcoded — `buildSwipeOrder()` walks the `.seg` tabs,
    then each section mapping to that tab via `SEC_TAB`, then that section's `.chip[data-p]`s. Add or
    remove a chip and the chain follows. **`SEC_TAB` key order is therefore significant** (it orders
    sections *within* the More tab); it carries a comment saying so.
  - **A horizontally scrollable ancestor always wins.** The week grid, bloodwork tables and the Food
    chip rails must scroll, not flip the page. Detected generically (computed `overflow-x` +
    `scrollWidth > clientWidth + 12`) so scrollers added later are covered for free. The **12px
    slack is load-bearing**: per CSS Overflow 3, setting `overflow-y` makes `overflow-x` compute to
    `auto`, so a purely *vertical* scroller reports as horizontal — real horizontal scrollers overrun
    by hundreds of px (the open suggestion rail is 1593 vs 329), a vertical one by a pixel or two.
  - **Listeners are passive and nothing calls `preventDefault()`**, so vertical scrolling is
    untouched. That is why the slide animates *on arrival* instead of tracking the finger —
    finger-tracking needs non-passive listeners and risks scroll jank on the long Tracker pages.
  - **The guard runs on `touchend`, not `touchstart`.** The ancestor walk reads `getComputedStyle`
    and `scrollWidth`, forcing a synchronous layout; on touchstart that would put a reflow on the
    path of every ordinary tap. By touchend the gesture is already known to be a horizontal flick.
  - **The chain is built lazily** (`swipeChain()`), not via a top-level `let SWIPE_ORDER = …`. `go()`
    calls `swipeIndexOf()`, and a `let` initialised further down the file sits in the temporal dead
    zone until execution reaches it — any future top-level bootstrap calling `go()` above that line
    would throw. Function declarations hoist, so the lazy form is safe from anywhere.
  - Swiping on a page **not** in the chain (hidden `food-pantry`/`food-add`) is a silent no-op.
- **Status:** Accepted. Verified at 375×812 by synthesised `TouchEvent`s: chain matches exactly,
  full forward and backward walks correct, stops at both ends, week grid and an open (1593px)
  suggestion rail both scroll instead of navigating, pinch/short/slow/vertical gestures ignored,
  zero console errors. Gesture *feel* still needs on-device confirmation.
- **Touch only for now** — keyboard arrows and mouse drag were deliberately left out; both are a few
  lines on top of `swipeTo(±1)` if wanted later.

### ADR-0033 — One modular type scale, mobile-first
- **Decision:** Replace ~30 ad-hoc font sizes with a **9-step modular scale** exposed as `--fs-*`
  tokens (11/12/13/14/15/17/20/24/28px, plus `--fs-4xl` 32px used *only* for page titles ≥820px),
  and three line-height tokens (`--lh-tight/snug/base`). Applied across `styles.css`, inline
  `style=""` in `index.html`, and JS-generated markup in `js/checkin.js` / `js/tracker.js`.
  Ratio ~1.2 (minor third), rounded to whole px at the pinned `html{font-size:16px}`, aligned with
  iOS HIG and Material 3. **Never write a raw `font-size` again** — only glyphs and form controls
  are exempt.
- **Reason:** Food rows read as cluttered, but the cause wasn't "fonts too big" — it was the absence
  of any system. The slot header was 19.2px while the kcal value was **18.4px** and the item name a
  full 16px, so rows visually competed with their own headers (header:item ratio 1.2:1). Nothing
  shared a ratio, so nothing read as a hierarchy.
- **Resulting hierarchy** (Food slot, the case that prompted this): section title **17** > kcal
  **15** > item name **14** > sub-line **12**, ratio 1.21. The kcal value stays emphasised by
  **weight 700, not size** — that is the specific fix for "the numbers shout."
- **Hero numbers deliberately excluded from the shrink:** rings, `.stat .v`, `.fd-bigv`,
  `.command .big` hold `--fs-3xl` (28px). Shrinking everything *around* a focal number raises
  contrast, which declutters more than shrinking the number would.
- **Density is half the fix:** dense rows also got `--lh-snug` and 10px padding (from 12–13px).
  The global `line-height:1.6` is tuned for prose and was the other reason lists felt loose.
- **Interaction with [ADR-0022](#adr-0022) (iOS zoom) — the load-bearing constraint:** form controls
  must never render below 16px on touch, or Safari zooms on focus and never restores. The guard
  `@media(max-width:640px),(pointer:coarse){input,select,textarea{font-size:16px!important}}` is
  untouched, and **no input may ever be given an `!important` font-size** — it would beat the guard.
  Verified post-change: all 111 controls compute ≥16px at 375×812.
- **Status:** Accepted. Verified at 375×812: hierarchy exactly 17/14/15/12, zero off-scale text
  (only decorative glyphs remain raw), smallest text 11px, all inputs ≥16px, no horizontal overflow,
  swipe nav and auto-hiding topbar unaffected, zero console errors.
- **Traps found during review, worth remembering:** four *later* rules were silently beating
  tokenised earlier ones — `.sec-label{font-size:.8rem !important}` killed the token outright;
  `.fsheet .fname` (same specificity, later) shrank the sheet **title** to a row-item 14px;
  `.fhero-cap b.good` made the on-target state *smaller* than the over state; `.qwheel-item.on` sat
  off-scale at 22.4px. Also, the whole **Phase-2 AI block was initially skipped** (~30 raw sizes,
  incl. `.ai-badge` at 10.6px, under the floor). After any size change, check the **computed** value,
  not the rule you edited.

---

### ADR-0034 — Remove ☰ menu bar & drawer
- **Decision:** Remove the ☰ button, slide-out drawer markup, and dashboard-wide search box from `index.html` and `js/nav.js`.
- **Reason:** Navigation is fully served by the three top-level tabs (Tracker | Food | More) and their subnav chip rails. Removing unused drawer code declutters the topbar and avoids dead event handlers.
- **Status:** Accepted.

### ADR-0035 — Freeze date row in Tracker Log week grid
- **Decision:** Pin the week grid day headers (`Mon 21`, `Tue 22`…) to the top of the viewport under the subnav while scrolling down through grid rows.
- **Implementation:** Created a sticky header clone `#weekGridHead` outside the horizontal scroller `.tscroll` that locks to top during vertical scrolling and tracks `.tscroll` horizontally.
- **Status:** Accepted.

### ADR-0036 — Pointer-driven drag to reorder
- **Decision:** Replace HTML5 `draggable` with unified Pointer Events (`pointerdown`/`pointermove`/`pointerup`) on drag handle `⠿`.
- **Reason:** HTML5 drag-and-drop does not function on mobile touch screens. Pointer events provide smooth touch and mouse reordering with insertion line indicator (`.fdropline`) and edge auto-scrolling.
- **Status:** Accepted.

### ADR-0037 — AI Usage & Cost Analysis Tab
- **Decision:** Dedicated `Food → AI cost` subtab (`#food-ai`, `js/food/aiUsage.js`) tracking token counts, Opus 4.8 spend ($5/$25 per 1M tokens), task breakdown tags (`label`, `nl`, `plate`, `lookup`, `mealname`, `ping`), credit balance entry, and month vs all-time filters.
- **Reason:** Provides transparent cost accounting per feature; derived from returned `usage` blocks and synced to cloud reserved row `__aiusage__`.
- **Status:** Accepted.

### ADR-0038 — Dashboard-wide Neon Gradient Styling & Canvas Rings
- **Decision:** Upgrade solid accent/status colors across pills, badges, progress bars, toggle buttons, and canvas donut rings (`foodRingGradient` in `foodUI.js`) to 135-degree neon gradients (`--grad-green`, `--grad-amber`, `--grad-red`, `--grad-blue`, `--grad-violet`, `--grad-gold`) with WCAG AA text contrast (`-ink` tokens).
- **Reason:** Delivers a vibrant, modern, high-contrast visual design across all app surfaces.
- **Status:** Accepted.

### ADR-0039 — Slot Search Sheet Revamp & Category Defaults
- **Decision:** In `openSlotAdd()`, provide `[ 🍲 Meals | 🥗 Items ]` subtabs with Meals active by default, showing 5 top category items before typing. Slot destination chips removed from header.
- **Reason:** Prevents result overcrowding and speeds up quick-logging of frequent meals.
- **Status:** Accepted.

### ADR-0040 — Meal Detail Customization & Master Template Sync
- **Decision:** Allow adding new pantry items on-the-spot inside `renderMealDetail()`, and provide `💾 Update master meal template` button to persist customized ingredient changes back to the master meal template (`saveMeal()`).
- **Reason:** Users can tweak or build meal templates directly from the daily logging flow without navigating away to the Meals tab.
- **Status:** Accepted.
