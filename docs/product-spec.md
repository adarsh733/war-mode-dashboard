# Product Spec — WAR MODE Food Tracker

> Source of truth for **what the product does and why**. Behavior rules, targets, hidden
> features. When behavior changes, update this file. Screens are described by behavior, not pixels
> (visuals live in [design-system.md](design-system.md)).

## 1. Who & why

- **User:** Adarsh Nagar, 27M, Bengaluru. **Vegetarian** — never suggest meat/fish/egg in seed
  data, examples, or AI output. Serious about body recomposition; tracks everything.
- **Problem being solved:** third-party apps (HealthifyMe etc.) don't have his exact products,
  can't reuse his meals easily, and undercount ~100–150 kcal/day because cooking oil/ghee isn't
  logged. He wants an accurate, self-owned tracker built into his dashboard.
- **Prime directive:** accuracy of calorie/macro math matters more than features. A 200–300 kcal
  silent error ruins his deficit. Numbers must be honest about verified vs guessed.

## 2. Nutrition targets & rules

- **Calories: track to 1,750 kcal/day.** His real ceiling is ~1,900; the remaining **150 kcal is a
  deliberate buffer** for small untracked snacking he can't capture. The rings/goal show **1,750**.
- **Protein: 180 g/day** target. **Below 140 g = red-flag day.**
- **Carbs / fat are de-emphasized** — the UI shows **only calories and protein** as the day's
  headline. Carbs/fat/fiber are still stored and shown inside an item's detail, just not featured.
- **Fiber** is an optional per-item field, display-only (not a target).
- **Cooking oil/ghee** is captured explicitly (the whole reason for the tool): **~9 kcal/g,
  ~1 g fat/g, ~0 protein/carbs.** 1 tsp ≈ 5 g ≈ 45 kcal; 1 tbsp ≈ 14 g ≈ 126 kcal. Captured
  **per-meal** via fast chips (None / 1 tsp / 1 tbsp / custom).

## 3. Core principles (do not violate)

1. **Per-100 canonical.** Every item stores macros per 100 g (solids) or 100 ml (liquids).
   Servings/units are a display layer. `macro = per100[x] × amount_in_base / 100`. Always.
2. **AI interprets; code calculates.** (Phase 2) The LLM only reads labels/words into proposed
   numbers; all multiplication/summing is deterministic JS the user confirms.
3. **Every number carries a trust level:** ⭐ verified (measured/scanned/hand-calibrated),
   🤖 ai-estimated, 🌱 seed-generic. Badges must be visible so a guess is never mistaken for truth.
4. **Learn once, reuse forever.** Anything created (incl. via AI later) is saved to the pantry so
   it's never re-processed. Main cost control for Phase 2.
5. **Manual entry everywhere; AI is an accelerator, never a dependency.** Works fully offline.
6. **Ever-evolving.** Items get recalibrated (seed→verified) endlessly. No "finished" state.

## 4. Feature behavior (Phase 1 — shipped)

### Today (default Food page)
- **Hero:** two rings — **Calories / 1,750** and **Protein / 180 g** — with "X kcal left" and
  "Xg protein to go" captions and a buffer note. No macro bar.
- **Meal slots** Breakfast / Lunch / Dinner / Snacks are **always shown**, even when empty, as
  headers with a **per-slot subtotal (kcal · protein)** and a **`+` button** (opens a slot-scoped
  search-add).
- **Per-slot suggestions:** clickable chips of foods he usually eats in that slot. Tapping a chip's
  `+` logs it instantly (default serving). Suggestions are **smart** — see §6.
- **Logged entries** per slot: item/meal **legend badge**, name, "qty·unit · protein", kcal.
  - **Tap an entry → opens its detail card** (edit there). **No separate edit pencil.**
  - **Delete** (✕) and **drag-to-reorder** (drag between slots reassigns the slot).
- **Quick-add search** (top) with live results; **Repeat yesterday**; links to Meals / New item.
- **"Done for the day" button** — the ONLY thing that pushes totals to the Tracker (see §5).

### Detail card (items & meals) — the main interaction
Opens as a **spacious bottom-sheet card** (not an inline expand), modeled on HealthifyMe's
item screen. Used when logging (from search / suggestion / slot `+`) and when editing a logged entry.
- **Item card:** colored header + name + trust; **iOS-style quantity wheel** (presets 0.25…500,
  plus "type" for any value) + **Measure** dropdown (the item's units, or grams/ml); big
  **Calories + Protein** (small carbs/fat/fiber + net wt/vol); oil chip if home-cooked;
  a **"⚙ Edit item & units"** panel to fix macros and **add/remove custom units for that product**;
  footer **"＋ Add to <slot>"** (new) or **"Save changes" + "Remove"** (editing an entry).
- **Meal card:** servings wheel + total calories/protein; **lists component items**, each with an
  editable quantity and a remove toggle — these are **per-day overrides that do NOT change the saved
  meal template**; oil chip; Add / Save + Remove.

### Pantry (hidden from UI)
The food database still exists and powers search/suggestions, but its nav entry is **hidden** —
he manages items through the detail card instead. Reachable in code via `renderPantry()` /
`food-pantry` page if needed.

### Meals
List of saved reusable bundles (letter-avatar, totals, badges). Build/edit templates via the
meal builder (name + component items + amounts + optional oil). "＋ log" opens the meal detail card.

### Add Item (manual form)
Exists (`food-add`): name, brand, basis g/ml, per-100 **or** per-serving entry (deterministic
conversion), item-specific units, home-cooked toggle. Manual entries default to ⭐ verified.
**De-prioritized** — the user expects to mostly create items via AI later, so this screen is
"leave as-is for now."

## 5. Tracker integration (the bridge) — MANUAL

- Logging food **does not** auto-write to the Tracker (that previously ticked `under2k`/`protein`
  habits mid-day before the full day was logged).
- The **"Done for the day"** button (`finishDay`) writes that date's deterministic total into the
  Tracker's `calories` + `proteinAmt`, calls `applyAuto` (re-ticks `under2k`/`protein`), and
  persists. Editing after pushing marks the day **dirty** → button becomes "Update Tracker".
- **Overwrite rule:** food totals overwrite `calories`/`proteinAmt` **only on dates with food
  entries**; manual-only days are untouched.

## 6. Smart suggestions

Per slot, suggestions = **taught favorites first** (the user can pin items/meals per slot via the
✎ manager), then **learned** entries ranked by **recency-weighted frequency** of what he actually
logs in that slot (recent days weigh more; weight ≈ 0.93^daysAgo). Both items and meals, badged.
Sensible vegetarian defaults ship pre-seeded until he teaches/logs his own.

## 7. Aliases

Items carry alternate names (e.g. roti↔chapati, dahi↔curd, chole↔chana) so search matches either.

## 8. Phasing

- **Phase 1 — no AI: COMPLETE.** Everything above.
- **Phase 2 — AI: BUILT, awaiting its first live run.** Five features, all behind one Netlify
  Function proxy ([ADR-0023](decisions.md)):
  1. **Label scan** — photograph a nutrition panel → the model transcribes *only what is printed* →
     the app converts per-serving to per-100 → confirm card → ⭐ verified item. A "✎ correct
     reading" box re-runs the read with your correction (the negotiate step).
  2. **Natural-language logging** — "3 roti, a katori of dal, curd" mapped onto *his own* pantry,
     shown as an editable confirm list, logged only on "Add all".
  3. **Meal naming** — 3 suggestions in the meal builder, always editable.
  4. **Web lookup** — an unknown food is researched with web search and saved 🤖 `ai` with sources.
  5. **Plate photo — draft only** ([ADR-0025](decisions.md)): identifies dishes and proposes
     portions, but every row must pass an explicit grams field and an oil chip before logging,
     because a photo can measure neither mass nor oil.
  6. **AI Usage & Cost Analysis Tab** ([ADR-0037](decisions.md)) — dedicated `Food → AI cost` subtab (`food-ai`) tracking every AI action, tokens spent, Opus 4.8 cost math ($5/$25 per 1M tokens), task breakdown tags, credit balance tracking, and month vs all-time filters.
  **AI dedup** runs on every AI-driven create via `findItemByNameBrand`
  ([ADR-0012](decisions.md)), and `trust:'verified'` is never overwritten without a confirm.
  The governing rule is the accuracy contract in [ADR-0024](decisions.md): **AI interprets, code
  calculates.** The model never multiplies or sums; `foodMath.js` remains the only source of macro
  numbers, and a deterministic validator (Atwater cross-check, range checks, vegetarian guard) gates
  everything before it can be saved.

## 9. Deferred / not doing yet

- Add-Item screen redesign (leave as-is).
- ~~Replicating the clean-light look to Fitness/Health/Tracker~~ — **done** ([ADR-0021](decisions.md)).
- Cross-device parity of suggestions relies on the cloud reserved row; localStorage is the primary.
