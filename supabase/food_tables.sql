-- WAR MODE · Food Tracker — Supabase schema (Stage 2)
-- Run this ONCE in the Supabase SQL editor (Dashboard → SQL → New query → paste → Run).
-- Mirrors the existing tracker_days shape: a few indexed columns + a jsonb blob that
-- holds the full object, so the item/meal schema can evolve without migrations.
--
-- Until these tables exist, the app runs entirely from localStorage (offline-safe);
-- after you run this, it will sync to the cloud automatically.

-- 1) Pantry items ----------------------------------------------------------
create table if not exists public.food_items (
  id         text primary key,           -- "itm_<timestamp>"
  name       text,                        -- for search/sort
  use_count  integer not null default 0,  -- for "most-used first" sort
  data       jsonb   not null,            -- full item object (per100, servings, trust, ...)
  updated_at timestamptz not null default now()
);
create index if not exists food_items_name_idx      on public.food_items (name);
create index if not exists food_items_use_count_idx  on public.food_items (use_count desc);

-- 2) Meals (reusable bundles of items) -------------------------------------
create table if not exists public.food_meals (
  id         text primary key,           -- "meal_<timestamp>"
  name       text,
  data       jsonb   not null,            -- {components:[{itemId,amount}], addedOil, ...}
  updated_at timestamptz not null default now()
);

-- 3) Daily food log (one row per date) -------------------------------------
create table if not exists public.food_log (
  date       text primary key,           -- "YYYY-MM-DD"
  data       jsonb   not null,            -- {entries:[...], addedOilTotal?}
  updated_at timestamptz not null default now()
);

-- Access policy: single-user app authenticated by the public anon key,
-- matching how tracker_days is used today. Enable RLS + allow-all for anon.
-- (If your tracker_days table simply has RLS DISABLED instead, you can skip
--  the policy blocks below and run `alter table ... disable row level security;`.)
alter table public.food_items enable row level security;
alter table public.food_meals enable row level security;
alter table public.food_log   enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename='food_items' and policyname='anon_all') then
    create policy anon_all on public.food_items for all to anon using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='food_meals' and policyname='anon_all') then
    create policy anon_all on public.food_meals for all to anon using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='food_log' and policyname='anon_all') then
    create policy anon_all on public.food_log for all to anon using (true) with check (true);
  end if;
end $$;
