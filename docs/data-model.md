# Data Model — WAR MODE Food

> Exact shapes and the math rules. `foodMath.js` is the only place math happens.

## Item (`FOOD_ITEMS[id]`, table `food_items`)

```jsonc
{
  "id": "itm_<base36ts><rand>",   // or "seed_*" for seeds
  "name": "Sids Farm High Protein Milk",
  "brand": "Sid's Farm",           // optional
  "basis": "ml",                    // "g" (solids) | "ml" (liquids)
  "per100": { "kcal": 63, "protein": 10, "carbs": 5.4, "fat": 0, "fiber": 0 }, // fiber optional
  "servings": [ { "label": "1 can (250ml)", "amount": 250 } ], // amount in BASE units
  "defaultServingIndex": 0,         // -1 = default to grams/ml
  "trust": "verified",              // "verified" | "ai" | "seed"
  "isHomeCooked": false,            // true → oil chip prompts at log time
  "aliases": ["sids milk", "high protein milk"],
  "tags": ["dairy","protein"],
  "notes": "",
  "useCount": 0,                    // most-used sort
  "source": "label-scan",           // "manual"|"label-scan"|"ai-estimate"|"screenshot"|"seed"
  "createdAt": "...", "updatedAt": "..."
}
```

## Meal (`FOOD_MEALS[id]`, table `food_meals`)

```jsonc
{
  "id": "meal_<...>",
  "name": "Oats Whey Smoothie",
  "components": [ { "itemId": "itm_oats", "amount": 40 }, ... ], // references items by id; amounts in base units
  "addedOil": { "type": "ghee", "grams": 15 },  // optional
  "createdAt": "...", "updatedAt": "..."
}
```
Reserved row `__suggestions__` also lives in `food_meals` (filtered out of meal lists).

## Daily log (`FOOD_LOG[date]`, table `food_log`, date = `YYYY-MM-DD`)

```jsonc
{
  "entries": [
    { "kind": "item", "itemId": "itm_whey", "amount": 35, "meal": "breakfast",
      "disp": { "qty": 1, "unit": "1 scoop (30g)" },   // friendly display; math uses amount
      "oil": { "grams": 5, "type": "oil" } },          // optional per-entry oil
    { "kind": "meal", "mealId": "meal_x", "servings": 1, "meal": "lunch",
      "overrides": { "itemId": 100 },   // per-day component amount overrides (template untouched)
      "removed": [ "itemId" ] },        // components dropped for this day only
    { "kind": "adhoc", "name": "Waffle", "kcal": 310, "protein": 6, "carbs": 40, "fat": 14, "meal": "snack" }
  ],
  "addedOilTotal": { "grams": 10, "type": "oil" }, // optional day-level oil
  "pushed": true,          // sent to Tracker via finishDay
  "dirty": false,          // edited since last push → button says "Update Tracker"
  "pushedTotals": { "kcal": 1730, "protein": 176 },
  "updatedAt": "..."
}
```
- `amount` is always in **base units (g/ml)**, resolved from quantity×measure at log time.
- Slots: `breakfast | lunch | dinner | snack`. Empty `meal` groups under Snacks in the UI.

## Suggestions (`FOOD_SUGGESTIONS`, localStorage + reserved cloud row)

```jsonc
{ "breakfast": [ { "type": "item", "id": "seed_oats" } ], "lunch": [...], "dinner": [...], "snack": [...] }
```
These are the **taught** favorites. Learned suggestions are computed on the fly from `FOOD_LOG`.

## Math rules (all in `foodMath.js`)

- Base amount: `toBaseAmount(item, qty, servingIndex)` → `servingIndex<0 ? qty : qty × servings[i].amount`.
- Item macros: `per100[x] × baseAmount / 100`.
- Oil: `9 kcal/g`, `1 g fat/g`, 0 protein/carbs. (`OIL_UNIT_GRAMS` tsp=5, tbsp=14.)
- Meal total (one serving): sum components (honoring `overrides`/`removed`) + `addedOil`.
- Entry macros: item / meal×servings / adhoc inline, **plus** the entry's own `oil`.
- Day total: sum entries + `addedOilTotal`. Rounding is **display-only**: kcal integer, macros 1dp.

## Targets (`FOOD_TARGETS` in `foodUI.js`)

```js
{ kcal: 1750, buffer: 150, protein: 180, proteinRed: 140 }
```
