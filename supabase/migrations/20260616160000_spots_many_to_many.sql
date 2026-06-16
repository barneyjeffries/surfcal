-- 0002: make spots shared (many-to-many with users).
--
-- Spots become a shared catalogue of physical breaks. The link between a user
-- and a spot — together with that user's preferences and optional personal
-- label — lives in user_spots. Forecast/tide data is stored once per spot and
-- joined per user to build each user's calendar.

-- ---------------------------------------------------------------------------
-- 1. Link table: (user, spot) + that user's preferences + optional label.
-- ---------------------------------------------------------------------------
create table public.user_spots (
  user_id uuid not null references auth.users (id) on delete cascade,
  spot_id uuid not null references public.spots (id) on delete cascade,
  label   text,

  -- Swell (offshore significant/swell height & period from the forecast feed)
  swell_height_min_m double precision not null default 0,
  swell_height_max_m double precision not null default 99,
  swell_period_min_s double precision not null default 0,

  -- Swell-direction arc the spot catches (degrees swell comes FROM; null = any)
  swell_dir_min_deg smallint,
  swell_dir_max_deg smallint,
  swell_dir_wraps   boolean not null default false,

  -- Favourable (offshore) wind arc (degrees wind comes FROM; null = any)
  wind_dir_min_deg   smallint,
  wind_dir_max_deg   smallint,
  wind_dir_wraps     boolean not null default false,
  wind_speed_max_kmh double precision not null default 99,

  -- Tide preference, relative to the cycle (see ARCHITECTURE.md)
  tide_direction text not null default 'any'
    check (tide_direction in ('any', 'rising', 'falling')),
  tide_height_min_norm real not null default 0
    check (tide_height_min_norm between 0 and 1),
  tide_height_max_norm real not null default 1
    check (tide_height_max_norm between 0 and 1),
  tide_high_offset_min_minutes int,
  tide_high_offset_max_minutes int,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (user_id, spot_id)
);
create index user_spots_spot_id_idx on public.user_spots (spot_id);

-- ---------------------------------------------------------------------------
-- 2. Migrate existing ownership into links. Prefs take their defaults; no
--    spot_prefs rows exist yet, so there is nothing else to carry over.
-- ---------------------------------------------------------------------------
insert into public.user_spots (user_id, spot_id)
select user_id, id from public.spots;

-- ---------------------------------------------------------------------------
-- 3. RLS on the link table: each user manages only their own links.
-- ---------------------------------------------------------------------------
alter table public.user_spots enable row level security;
create policy "user_spots_select_own" on public.user_spots
  for select using (user_id = auth.uid());
create policy "user_spots_insert_own" on public.user_spots
  for insert with check (user_id = auth.uid());
create policy "user_spots_update_own" on public.user_spots
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "user_spots_delete_own" on public.user_spots
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. Cache is now read via the link: a user sees cache for spots they follow.
--    (These old policies referenced spots.user_id, so they must be replaced
--    before that column can be dropped.)
-- ---------------------------------------------------------------------------
drop policy "forecast_cache_select_own" on public.forecast_cache;
drop policy "tide_cache_select_own" on public.tide_cache;

create policy "forecast_cache_select_linked" on public.forecast_cache
  for select using (exists (
    select 1 from public.user_spots us
    where us.spot_id = forecast_cache.spot_id and us.user_id = auth.uid()));
create policy "tide_cache_select_linked" on public.tide_cache
  for select using (exists (
    select 1 from public.user_spots us
    where us.spot_id = tide_cache.spot_id and us.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 5. Drop the old per-spot prefs table FIRST. Its RLS policies reference
--    spots.user_id, so they must be removed before that column can be dropped
--    (dropping the table drops its dependent policies too).
-- ---------------------------------------------------------------------------
drop table public.spot_prefs;

-- ---------------------------------------------------------------------------
-- 6. Spots become a shared catalogue: drop ownership policies and the column.
-- ---------------------------------------------------------------------------
drop policy "spots_select_own" on public.spots;
drop policy "spots_insert_own" on public.spots;
drop policy "spots_update_own" on public.spots;
drop policy "spots_delete_own" on public.spots;

alter table public.spots drop column user_id;  -- also drops spots_user_id_idx

-- Any authenticated user can read the catalogue and add a new spot to it.
-- Editing/removing shared spots is intentionally not granted to end users.
create policy "spots_select_authenticated" on public.spots
  for select using (auth.uid() is not null);
create policy "spots_insert_authenticated" on public.spots
  for insert with check (auth.uid() is not null);
