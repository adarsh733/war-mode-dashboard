# Food seed data

Canonical seed for the WAR MODE Food tracker.

## Files

- **`food-seed.v1.1.json`** — the single source of truth: `meta` + `items` (151) + `meals` (30).
  IFCT-2017 / USDA-anchored. Raw/standard items are high-confidence; composite/cooked dishes are
  `trust:"seed"` home-style estimates to calibrate over time.
- `backups/` — timestamped snapshots of the live cloud tables, written before every import run.
  **Gitignored** (may contain personal log data). Restore from one of these to roll back.
- `reports/` — per-run merge reports (counts, alias mappings applied, the final item/meal set used
  to regenerate `js/food/seed.js`).

## Importing into Supabase

```
node scripts/import_food_seed.mjs           # DRY RUN — writes a backup + report, no cloud writes
node scripts/import_food_seed.mjs --commit   # apply to food_items / food_meals
```

The importer (`scripts/import_food_seed.mjs`) is deterministic and **idempotent** — running it
twice makes no further changes. It de-duplicates by normalized name plus a curated old→new alias
map, preserves existing `id`/`useCount`/`createdAt`, never overwrites `trust:"verified"` rows, and
deletes known test rows. It does **no macro arithmetic** (per-100 is copied verbatim; the app
computes `per100 × amount / 100`). See [ADR-0019 / ADR-0020](../../docs/decisions.md).

## Regenerating `js/food/seed.js`

`js/food/seed.js` is generated to mirror the live cloud item set 1:1 (same ids), so a fresh device
never re-creates duplicates on sync. After a `--commit`, rebuild it from the latest
`reports/import-*.json` (`finalItems`). Do not hand-edit `seed.js`.
