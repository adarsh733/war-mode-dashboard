# WAR MODE — Food & Calorie Tracker
## Build Specification & Single Source of Truth

> **READ THIS FIRST (for Claude Code):** This document is the complete spec for a new feature being added to an existing personal health dashboard. You will be given the current dashboard as a single HTML file (~4,000 lines) named something like `WAR_MODE_Dashboard_v4.html`. **Do not start writing code until you have read that file and Sections 1–4 below, and confirmed the open questions in Section 12 with the user.** This is a personal tool for one user (Adarsh). Accuracy of calorie/macro math matters more than features — a 200–300 kcal error silently ruins his diet deficit. When in doubt, ask him rather than guess. Anything marked **⚠️ CONFIRM** must be checked with the user before building that part.

---

## 1. Context — who this is for and why

**User:** Adarsh Nagar, 27M, Bengaluru, India. Vegetarian (never suggest meat/fish/egg items in any seed data or examples). Serious about body recomposition; tracks everything.

**The existing product:** A single-file HTML dashboard called **WAR MODE**, deployed via GitHub → Netlify, backed by Supabase (with localStorage as offline fallback). It has three top-level sections today:
- **🏋️ Fitness** — goals, progress, compliance, phase plan, training, nutrition guidance, sleep
- **🩺 Health** — bloodwork, thyroid, lipids, meds
- **📓 Tracker** — a daily habit + metrics logger (this is the part we'll connect to)

**Why we're building this:** He currently logs daily calories in third-party apps (HealthifyMe etc.). Those apps frustrate him because: (a) his exact products aren't in their database, forcing him to pick "similar" items that are wrong, and (b) there's no easy way to build and reuse his own meals. He wants a **calorie + macro tracker built into his own dashboard** where:
1. He owns the food database (his exact products, his portions).
2. He can add a new product by photographing its nutrition label; AI reads it and creates the item.
3. He can build meals from items and log them daily in a few taps.
4. He can log by talking naturally ("3 paratha and paneer kebab", "repeat yesterday").
5. The system is accurate, and honest about when a number is a guess vs. verified.
6. It's essentially free to run.

**His nutrition targets (for context in the UI):**
- Calories: **1900–1950 kcal/day** (real, with cooking oil counted)
- Protein: **175–180g/day** (below 140g = red-flag day)
- Carbs: 160–170g. Fat: 50–60g.
- **Known issue he cares about:** apps undercount ~100–150 kcal/day because cooking oil/ghee isn't logged. This tool must capture oil explicitly (see §6).

---

## 2. What we are building (scope in one paragraph)

A new **4th top-level section, "🍽️ Food"**, added to the existing dashboard. It contains a personal **food database ("Pantry")** where every item stores macros normalized **per 100g / per 100ml**; a **Meal builder** for saving reusable bundles of items; a **daily food log ("Today")** that sums macros against his targets; and **AI-assisted item creation** (photograph a label → Claude reads it → negotiate → save) plus **AI-assisted logging** (natural language → matched to his database → confirmed → logged). The day's total calories and protein **auto-write into the existing Tracker** so his compliance scoring and charts update from what he actually ate. Everything syncs via his existing Supabase project, with manual entry available everywhere as a fallback so the tool never *depends* on AI.

**This is phased.** Phase 1 has zero AI and must be fully usable on its own. Phase 2 adds the AI layers on top. See §9.

---

## 3. Core design principles (do not violate these)

1. **Store macros per-100 canonical.** Every food item stores `kcal, protein, carbs, fat` **per 100g (solids) or per 100ml (liquids)**. Serving sizes and household units are *display/convenience* layers on top. This makes every quantity calculation — half a can, three rotis, 180ml — exact arithmetic. This is the single most important rule.

2. **AI interprets; code calculates.** The LLM is used ONLY to (a) read labels/screenshots into numbers and (b) map the user's words to database items + quantities. **All macro multiplication and summing is done in plain deterministic JavaScript, never by the AI.** LLMs hallucinate numbers; his deficit can't survive that. Any number the AI produces is a *proposal* the user confirms, after which code owns the math.

3. **Every number carries a trust level.** Each item is flagged as one of:
   - ⭐ **Verified** — user calibrated it to his kitchen, or it's a packaged label he scanned. Trust fully.
   - 🤖 **AI-estimated** — from general knowledge. A reasonable starting guess, visually marked as unverified.
   - 🌱 **Seed-generic** — from the pre-loaded Indian food seed. Reasonable but not tuned to him.
   The UI must show these badges so a guess is never mistaken for a measured value.

4. **Learn once, reuse forever (the cache principle).** Any food that required AI is **saved to the Pantry on approval**, so it's never AI-processed again — next time it's a one-tap database item. This is both a UX win and the main cost-control mechanism. After a few weeks of his normal rotation, AI is rarely called.

5. **Fallback ladder for any food** (in priority order): (1) his Pantry → (2) AI general estimate, flagged, user-verified → (3) user-supplied image (a HealthifyMe screenshot or a label photo) which AI reads for hard numbers. He should always be able to override AI with an image.

6. **Manual entry everywhere.** If the API is down or he's offline, he can type numbers directly on every screen. AI is an accelerator, never a dependency.

7. **Ever-evolving, nothing hardcoded.** Items get added, edited, re-calibrated (generic→verified) endlessly. The seed database is just a starting point he overwrites with reality. There is no "finished" state.

8. **Surgical changes to the existing file.** Alter only what's needed to add the Food section. Do not refactor or "clean up" the existing 4,000-line dashboard. Leave the Fitness/Health/Tracker code untouched except at the explicit integration points in §7.

---

## 4. How the EXISTING dashboard works (so you don't break it)

> You will have the full HTML file. Here are the load-bearing structures you must understand and reuse rather than reinvent. **Verify these against the actual file — line references will differ; the patterns are what matter.**

- **Single HTML file.** All CSS in one `<style>` block, all JS in one `<script>` block. Uses Google Fonts (Oswald/Fraunces/DM Sans), Chart.js, and `@supabase/supabase-js@2` via CDN. **Keep the single-file architecture** (see §12 decision — user confirmed single-file).

- **Section/page routing:** `PAGES` object maps page-id → section (`'fitness'|'health'|'tracker'`). `setSec(sec)` switches top-level section; `go(id)` switches to a page and calls `buildCharts(id)` + any render fns. Top bar has a `.seg` toggle (Fitness/Health/Tracker buttons). Sub-nav `.chip-group[data-for="..."]` holds the chips per section. A mobile `.drawer` mirrors all nav links. **You will add a 4th section `'food'` to all of these.**

- **CSS design tokens** are in `:root` (`--bg, --paper, --ink, --accent, --green, --amber, --red, --blue`, plus `--r, --shadow`, etc.). **Reuse these tokens** — the Food section must look native to the app (same cards, pills, `.stat`, `.note`, tables, `.sec-label`, `.kicker`, `.title`). Match the existing visual language exactly.

- **Supabase data layer:**
  - Client created as `supa = window.supabase.createClient(SUPA_URL, SUPA_KEY)`.
  - `SUPA_URL = 'https://sfilvcffrcdcsrimcatz.supabase.co'` and a public anon `SUPA_KEY` are already in the file.
  - The tracker stores days in a table **`tracker_days`** with columns `date` (text, PK) and `data` (jsonb). Special rows use reserved keys like `__periods__`, `__checkins__`. Reads: `supa.from('tracker_days').select(...)`. Writes: `.upsert({date, data})`.
  - Pattern: **local-first** (localStorage for instant UI) then **cloud reconcile**; a sync badge shows `☁ Synced / ⚠ Local only / ⟳ Syncing`. Reuse this exact pattern for Food.

- **The daily tracker `DB` object:** keyed by date string `YYYY-MM-DD`. Each day holds habit flags (`thyroid, water, protein, gym, cardio, steps10k, omega3, under2k, sleep8`) and metric numbers (`weight, proteinAmt, calories, sleepHrs, steps, puffiness`) and optional measurements. **`calories` and `proteinAmt` are the two fields the Food log will write into.** There's an `under2k` habit auto-ticked when `calories < ceiling`, and a `protein` habit auto-ticked when `proteinAmt >= goal`. Writing food totals into these fields will make the existing scoring/charts "just work" — this is the integration goal.

- **Date helpers already exist:** `todayStr()`, `iso(d)`, `addDays(s,n)`, `fmtDate(s)`, `monthKey(s)`. Reuse them.

- **Persistence fns already exist:** `persist(date)` (one day) / `persist()` (all), `localPersist()`. Follow the same shape for food persistence.

---

## 5. Data model (the schema)

Store everything in the **existing `tracker_days` table** using new reserved keys (so no new tables are strictly required — but see §12 for the option of dedicated tables). Recommended approach: **dedicated reserved rows** holding JSON blobs, mirroring how `__checkins__` and `__periods__` already work.

### 5.1 Food items — reserved row `__food_items__`
A JSON object keyed by a generated `itemId`. Each item:

```
{
  "id": "itm_<timestamp>",
  "name": "Sids Farm High Protein Milk",
  "brand": "Sids Farm",                  // optional
  "basis": "ml",                          // "g" for solids, "ml" for liquids
  "per100": {                             // CANONICAL — macros per 100g or 100ml
    "kcal": 62,
    "protein": 6.1,
    "carbs": 4.7,
    "fat": 2.0
  },
  "servings": [                           // household/default units, all in base unit
    { "label": "1 can", "amount": 250 },  // 250 ml
    { "label": "half can", "amount": 125 }
  ],
  "defaultServingIndex": 0,               // which serving is pre-selected
  "trust": "verified",                    // "verified" | "ai" | "seed"
  "isHomeCooked": false,                  // if true, oil/ghee capture applies (see §6)
  "tags": ["dairy","protein"],            // optional, for search/filter
  "notes": "",                            // e.g. "grilled, medium oil, ~120g portion"
  "createdAt": "2026-07-19",
  "updatedAt": "2026-07-19",
  "source": "label-scan"                  // "manual" | "label-scan" | "ai-estimate" | "screenshot" | "seed"
}
```

**Math rule:** macros for any logged amount = `per100[x] * (amount_in_base_unit / 100)`. Always. Round only for display (kcal to integer, macros to 1 decimal).

### 5.2 Meals — reserved row `__food_meals__`
Reusable bundles. A meal references items by id; it does NOT copy their macros (so editing an item updates every meal using it).

```
{
  "id": "meal_<timestamp>",
  "name": "Sunday Paratha + Paneer",
  "components": [
    { "itemId": "itm_paratha", "amount": 180 },   // 3 paratha, if 1 paratha ≈ 60g
    { "itemId": "itm_paneer_lababdar", "amount": 200 }
  ],
  "addedOil": { "type": "ghee", "grams": 15 },     // optional, see §6
  "createdAt": "...", "updatedAt": "..."
}
```

Meal totals are computed live by summing component items' per-100 math + any `addedOil`.

### 5.3 Daily food log — reserved row `__food_log__`
Keyed by date `YYYY-MM-DD`. Each day is a list of logged entries (items and/or meals with amounts).

```
{
  "2026-07-19": {
    "entries": [
      { "kind": "item", "itemId": "itm_whey", "amount": 35, "meal": "breakfast" },
      { "kind": "meal", "mealId": "meal_sunday_paratha", "servings": 1, "meal": "lunch" },
      { "kind": "adhoc", "name": "Belgian waffle", "kcal": 310, "protein": 6, "carbs": 40, "fat": 14, "meal": "snack" }
    ],
    "addedOilTotal": { "grams": 10, "type": "oil" }  // optional day-level oil if not per-meal
  }
}
```

- `kind:"adhoc"` = a one-off entry whose macros are stored inline (used when the user doesn't want to save it to Pantry). Everything else references Pantry/Meals by id.
- `meal` field ("breakfast/lunch/dinner/snack") is for grouping in the UI — optional, nice-to-have.

### 5.4 Day total computation (deterministic, in JS)
For a given date: for each entry, resolve to per-100 macros × amount (item), or sum of components (meal), or inline macros (adhoc); add any oil grams (oil ≈ 9 kcal/g, ~0 protein/carb, ~1g fat per g). Produce `{kcal, protein, carbs, fat}`. **This total is what writes into the tracker (§7).**

---

## 6. The cooking-oil / ghee capture (important — his specific need)

His known problem: apps undercount ~100–150 kcal/day from cooking oil not logged. So:
- Any item flagged `isHomeCooked: true`, OR any meal, prompts an **"oil/ghee added?"** input at log time.
- Oil/ghee math: **~9 kcal per gram, ~1g fat per gram, ~0 protein/carbs.** (1 tsp oil ≈ 5g ≈ 45 kcal; 1 tbsp ≈ 14g ≈ 126 kcal.) Offer tsp/tbsp/grams entry, convert to grams internally.
- **⚠️ CONFIRM** with user: does he want oil captured **per-meal** (asked each time he logs a home meal) or **once per day** (a single "today's cooking oil" number)? Default to per-meal but make it fast (a chip: "None / 1 tsp / 1 tbsp / custom").

---

## 7. Integration with the existing Tracker (the bridge)

**Goal:** the day's food totals auto-fill the existing tracker's `calories` and `proteinAmt` for that date, so his compliance scoring, monthly charts, and the `under2k`/`protein` habits update from real logged food.

**How:**
- After any change to `__food_log__` for a date, recompute that day's total (§5.4) and write:
  - `DB[date].calories = Math.round(total.kcal)`
  - `DB[date].proteinAmt = Math.round(total.protein)`
  - then call the existing `applyAuto(DB[date], date)` (re-ticks `under2k`/`protein` habits) and `persist(date)`.
- If the tracker view is currently open, refresh it (the file already has patterns like `renderWeek()` / `renderHistory()` — call whichever is active, mirroring how `mirrorCheckinToDB` already refreshes views).

**⚠️ CONFIRM edge case with user:** On days he logs food here, food is the source of truth for calories/protein. But some past/travel days have manually-typed calories. **Rule to confirm:** food log overwrites `calories`/`proteinAmt` ONLY on dates that have food entries; days with no food entries keep their manual values untouched. (Recommended. Confirm he agrees.)

---

## 8. Screens & UX (the four Food pages)

All pages live under the new **🍽️ Food** section, with sub-nav chips mirroring the existing pattern. Match existing components (`.card`, `.stat`, `.note`, `.pill`, `.sec-label`, `.kicker`, `.title`, tables, `.datestrip`).

### 8.1 Today (the daily driver — default Food page)
- Date strip at top (reuse the tracker's `.datestrip` component/logic).
- **Running totals** vs targets: a calories number (e.g. `1,740 / 1,900`), a protein number (`168 / 180g`), and a macro bar (protein/carbs/fat). Color against targets using existing green/amber/red pills.
- **Logged entries list** for the day, grouped by meal slot, each showing name, amount, kcal, protein, trust badge, and edit/delete.
- **Fast-add bar** with three ways to add:
  1. **Quick pick** — search/tap a Pantry item or saved Meal (this is the primary daily flow — must be fast).
  2. **"Repeat yesterday"** and **"Repeat a day…"** buttons (copies that day's entries).
  3. **Talk to log** (Phase 2 AI) — a text box: "3 paratha and paneer kebab" → parsed → preview → confirm.
- Every add shows a **preview of the math** before committing.

### 8.2 Pantry (the food database)
- Searchable/filterable list of all items. Each row: name, per-serving kcal/protein, trust badge, verified/generic/AI marker.
- Tap an item → detail: per-100 values, servings, edit everything, change trust level (e.g. mark generic → verified after calibrating), delete.
- **"+ Add item"** → goes to Add Item flow (§8.3).
- Sort: most-used first (track a simple use-count) so his regulars are on top.

### 8.3 Add Item (manual + AI)
- **Manual form** (Phase 1): name, brand, basis (g/ml), per-100 macros OR "enter as per-serving and I'll convert", serving sizes, home-cooked toggle, trust defaults to verified (manual entry is his own data). Deterministic conversion to per-100.
- **AI label scan** (Phase 2): upload/take a photo of the nutrition label → Claude reads it → returns proposed per-100 macros + serving size → **chat negotiation** (see §10) → user approves → saved as `trust: verified, source: label-scan`.
- **AI screenshot import** (Phase 2): same flow but for a HealthifyMe/other screenshot when a label isn't available.

### 8.4 Meals
- List of saved meals with computed totals.
- Build/edit a meal: add items + amounts, optional added oil, name it, save.
- "Log this meal" sends it to Today.

---

## 9. Phasing (build order — do not skip)

### PHASE 1 — No AI. Must be fully shippable and usable alone.
1. Add the `food` section to routing, sub-nav, drawer, and a set of empty page shells styled like the app.
2. Supabase reserved rows + local-first persistence for `__food_items__`, `__food_meals__`, `__food_log__` (clone the existing tracker's data-layer pattern exactly).
3. Seed ~50 Indian vegetarian staples (§11).
4. Pantry: list, search, add-manual, edit, delete, trust badges, use-count sort.
5. Meals: build, edit, save, delete.
6. Today: date strip, quick-pick add, repeat-yesterday, running totals vs targets, macro bar, entries list, per-entry edit/delete, oil capture.
7. The tracker bridge (§7) — food totals write into `calories`/`proteinAmt`.
8. **Ship & live in it.** Confirm the math and daily flow feel right before any AI.

### PHASE 2 — AI layers, added on top of a working base.
9. **First: prove ONE working Anthropic API call** (a single label-scan) end-to-end before building UI around it. Fail fast on the risky part.
10. AI label scan → chat negotiation → save (§10).
11. AI screenshot import (same pipeline).
12. AI natural-language logging on Today ("3 paratha and paneer kebab", "repeat yesterday").
13. AI general-estimate fallback for unknown foods, flagged + user-verified + auto-saved to Pantry (the cache loop).

---

## 10. The AI layer — how to call Claude from inside the dashboard (Phase 2)

The dashboard can call the Anthropic API directly from the artifact/app. **Use model `claude-sonnet-4-6`, `max_tokens: 1000`. Never put an API key in the code** — the environment handles auth. Endpoint: `POST https://api.anthropic.com/v1/messages`.

**⚠️ CONFIRM / TEST EARLY:** The exact API-call mechanics from *his deployed Netlify environment* may differ from the artifact sandbox. This is the #1 technical risk. Before building any AI UI, get one hard-coded test call returning a parsed result. If direct browser calls to the API are blocked by CORS/auth in his Netlify deployment, **flag this to the user** — he may need a tiny serverless proxy (Netlify Functions) to hold the key, which is a separate small setup. Do not assume; test and report.

### 10.1 Label / screenshot reading
- Send the image as base64 with a text instruction: "Read this nutrition label. Return ONLY JSON: `{name, basis:'g'|'ml', per100:{kcal,protein,carbs,fat}, servingSize, servingUnit, confidence, assumptions[]}`. If a value isn't visible, use null and note it in assumptions."
- **Prompt it to return strict JSON, no prose, no markdown fences.** Parse safely; strip accidental fences; wrap in try/catch. If parse fails, show the raw read and let the user correct manually.
- Show the parsed result in the negotiation UI (below). Code — not the model — then converts to canonical per-100 and does all downstream math.

### 10.2 The negotiation chat (his explicit requirement)
Item creation is a conversation, not one-shot:
- AI proposes → shows numbers + its **assumptions** (e.g. "assuming per-100ml basis; label showed per-serving 250ml so I divided") → user can reply in text to adjust ("it's per serving not per 100", "portion was smaller") → AI revises → user hits **Approve** → saved. **Later fully editable by hand** in Pantry.
- Always surface *assumptions*, so he checks the reasoning, not just the number.

### 10.3 Natural-language logging
- Input: free text ("3 paratha and paneer kebab"). Plus his Pantry item list (names + ids) passed in context.
- Ask the model to return JSON mapping phrases → `{itemId or "UNKNOWN", displayName, amount, unit}`.
- For matched items: code computes macros, shows preview, user confirms.
- For `UNKNOWN` items: trigger the fallback ladder — AI general estimate (flagged), user verifies, auto-saved to Pantry. Or prompt user for an image/screenshot.
- **Code does the math; AI only maps words → items + quantities.**

### 10.4 Cost & caching
- Every AI-created item is saved to Pantry → never re-processed. This is the main cost control.
- Expect only a handful of AI calls per week after the first weeks. Cost is realistically cents/month — but do NOT call AI when a Pantry match exists. Always check Pantry first.

---

## 11. Seed database (~50 Indian vegetarian staples)

Pre-load ~50 common items so he's not starting empty. **All flagged `trust: "seed"`, `source: "seed"`** so he knows to calibrate. Per-100g values, vegetarian only.

**⚠️ USER MUST VERIFY:** These seed numbers are generic and WILL be off for his kitchen (oil, portion, atta type vary hugely). After seeding, the app should prompt him to calibrate his ~15 most-eaten items to real values. **Do not present seed numbers as accurate.**

Suggested seed categories (you fill sensible per-100g values, vegetarian):
- **Grains/breads:** plain roti/chapati, paratha (plain), butter naan, white rice cooked, jeera rice, poha, upma, idli, dosa (plain), plain paratha, bread slice (white/brown).
- **Dals/legumes:** toor dal cooked, moong dal, chana masala, rajma, sambar, dal makhani.
- **Paneer/dairy dishes:** paneer (raw), paneer bhurji, palak paneer, paneer lababdar, paneer tikka, curd/dahi, buttermilk, milk (regular).
- **Sabzis:** aloo gobi, bhindi, mixed veg, baingan bharta, jeera aloo, palak.
- **His known products (mark these `verified` if he confirms numbers, else seed):** Whole Truth WPI whey, Sids Farm High Protein Milk, Epigamia Greek Yogurt, Brazil nuts, regular curd.
- **Snacks/misc:** banana, apple, almonds, peanuts, roasted chana, oats (dry), peanut butter, ghee, cooking oil (as an ingredient item).

Keep it vegetarian, keep it realistic, and flag everything as seed. He'll overwrite with reality.

---

## 12. Open questions / decisions — ⚠️ CONFIRM WITH USER before/while building

These are things I (the spec author) could not decide for you. Claude Code: **ask Adarsh these explicitly.**

1. **Storage layout:** Reserved JSON rows in the existing `tracker_days` table (fastest, mirrors current pattern) **vs.** dedicated Supabase tables `food_items`, `food_meals`, `food_log` (cleaner, more scalable, needs SQL setup). *Spec recommends dedicated rows for Phase 1 speed; revisit if the data grows.* **Confirm his preference.**
2. **Oil capture cadence:** per-meal vs. once-per-day (§6). *Spec defaults to per-meal, made fast.*
3. **Tracker overwrite rule:** food log overwrites `calories`/`proteinAmt` only on dates with food entries; manual days untouched (§7). *Confirm.*
4. **Household units:** he wanted to enter amounts as household units (1 roti, 1 katori, 1 can) with grams available. *Confirm the default unit per food type and whether he wants a global "always show grams too" toggle.*
5. **Meal slots:** does he want breakfast/lunch/dinner/snack grouping, or just a flat list per day? *Nice-to-have; confirm.*
6. **API from Netlify (§10):** must test whether direct browser→Anthropic calls work from his deployed site or need a Netlify Function proxy. **This is the key technical risk — test first, report back.**
7. **Seed calibration:** which ~15 foods does he eat most, so those get a "calibrate me first" prompt? *Ask him to list them.*

---

## 13. Things the USER must provide / do (⚠️ USER ACTION)

1. **Share the current dashboard HTML file** with Claude Code (he will paste/point to `WAR_MODE_Dashboard_v4.html`).
2. **Git checkpoint first:** commit the current working dashboard to GitHub before changes, so any breakage is revertable. (He deploys via GitHub → Netlify already.)
3. **If a Supabase-table option is chosen (§12.1):** run the SQL Claude Code provides in the Supabase console. (If reserved-rows option: no SQL needed.)
4. **Verify seed macros** for his ~15 regular foods (§11) once seeded.
5. **Provide real per-100 numbers** for his key packaged products (whey, Sids Farm milk, Epigamia) if he wants them `verified` from day one — or scan them via Phase 2.
6. **Confirm the §12 open questions.**

---

## 14. Definition of done

**Phase 1 done when:** he can add his own items manually, build meals, log a full day by tapping items/meals, "repeat yesterday" works, the day's kcal+protein show against his 1900/180 targets with correct deterministic math, oil is captured, and the totals correctly appear in his existing Tracker's calories/protein with compliance habits auto-ticking. All synced to Supabase, offline-safe, styled native to the app.

**Phase 2 done when:** he can photograph a label → negotiate → save a verified item; import a screenshot the same way; type "3 paratha and paneer kebab" → confirm → logged; unknown foods get a flagged AI estimate that saves to Pantry for reuse; and AI is never called when a Pantry match exists.

---

*End of specification. Build Phase 1 first. Confirm §12 before building the parts they affect. Keep the math deterministic and the trust badges honest — the diet depends on it.*
