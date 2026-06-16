-- SurfCal initial schema
-- Tables: profiles, spots, spot_prefs, forecast_cache, tide_cache
-- All tables are RLS-protected. The iCal route and the refresh cron use the
-- Supabase service role, which bypasses RLS by design (see ARCHITECTURE.md).

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user, holding the calendar feed token.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  calendar_token uuid not null default gen_random_uuid() unique,
  created_at     timestamptz not null default now()
);

-- Auto-create a profile when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- spots: a user's saved surf spot.
-- forecast_latitude/longitude are an optional point nudged offshore for the
-- marine model (coastal grid cells can resolve to land and return nulls).
-- ---------------------------------------------------------------------------
create table public.spots (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  name               text not null,
  latitude           double precision not null,
  longitude          double precision not null,
  forecast_latitude  double precision,
  forecast_longitude double precision,
  timezone           text not null default 'UTC',
  created_at         timestamptz not null default now()
);
create index spots_user_id_idx on public.spots (user_id);

-- ---------------------------------------------------------------------------
-- spot_prefs: the user's thresholds for a spot (1:1 with spots).
-- Direction arcs are degrees the swell/wind comes FROM; *_wraps = true when the
-- arc crosses 0/360 (e.g. SW->E). Tide is stored relative to the cycle.
-- ---------------------------------------------------------------------------
create table public.spot_prefs (
  spot_id uuid primary key references public.spots (id) on delete cascade,

  -- Swell (offshore significant/swell height & period from the forecast feed)
  swell_height_min_m double precision not null default 0,
  swell_height_max_m double precision not null default 99,
  swell_period_min_s double precision not null default 0,

  -- Swell-direction arc the spot catches (null = any)
  swell_dir_min_deg smallint,
  swell_dir_max_deg smallint,
  swell_dir_wraps   boolean not null default false,

  -- Favourable (offshore) wind arc (null = any)
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
  -- Minutes relative to nearest high water (negative = before). null = unbounded.
  tide_high_offset_min_minutes int,
  tide_high_offset_max_minutes int,

  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- forecast_cache: hourly waves/wind per spot. Written by the cron (service role).
-- ---------------------------------------------------------------------------
create table public.forecast_cache (
  spot_id             uuid not null references public.spots (id) on delete cascade,
  ts                  timestamptz not null,
  swell_height_m      double precision,
  swell_period_s      double precision,
  swell_direction_deg double precision,
  wind_speed_kmh      double precision,
  wind_direction_deg  double precision,
  fetched_at          timestamptz not null default now(),
  primary key (spot_id, ts)
);

-- ---------------------------------------------------------------------------
-- tide_cache: high/low events per spot. Written by the cron (service role).
-- ---------------------------------------------------------------------------
create table public.tide_cache (
  spot_id    uuid not null references public.spots (id) on delete cascade,
  ts         timestamptz not null,
  event_type text not null check (event_type in ('high', 'low')),
  height_m   double precision,
  fetched_at timestamptz not null default now(),
  primary key (spot_id, ts)
);

-- ===========================================================================
-- Row Level Security
-- ===========================================================================
alter table public.profiles       enable row level security;
alter table public.spots          enable row level security;
alter table public.spot_prefs     enable row level security;
alter table public.forecast_cache enable row level security;
alter table public.tide_cache     enable row level security;

-- profiles: a user sees/updates only their own row.
create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- spots: full CRUD on own spots.
create policy "spots_select_own" on public.spots
  for select using (user_id = auth.uid());
create policy "spots_insert_own" on public.spots
  for insert with check (user_id = auth.uid());
create policy "spots_update_own" on public.spots
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "spots_delete_own" on public.spots
  for delete using (user_id = auth.uid());

-- spot_prefs: CRUD when the parent spot belongs to the user.
create policy "spot_prefs_select_own" on public.spot_prefs
  for select using (exists (
    select 1 from public.spots s where s.id = spot_id and s.user_id = auth.uid()));
create policy "spot_prefs_insert_own" on public.spot_prefs
  for insert with check (exists (
    select 1 from public.spots s where s.id = spot_id and s.user_id = auth.uid()));
create policy "spot_prefs_update_own" on public.spot_prefs
  for update using (exists (
    select 1 from public.spots s where s.id = spot_id and s.user_id = auth.uid()))
  with check (exists (
    select 1 from public.spots s where s.id = spot_id and s.user_id = auth.uid()));
create policy "spot_prefs_delete_own" on public.spot_prefs
  for delete using (exists (
    select 1 from public.spots s where s.id = spot_id and s.user_id = auth.uid()));

-- forecast_cache / tide_cache: users may READ rows for their own spots.
-- Writes happen only via the service role (cron), which bypasses RLS, so there
-- are deliberately no insert/update/delete policies here.
create policy "forecast_cache_select_own" on public.forecast_cache
  for select using (exists (
    select 1 from public.spots s where s.id = spot_id and s.user_id = auth.uid()));
create policy "tide_cache_select_own" on public.tide_cache
  for select using (exists (
    select 1 from public.spots s where s.id = spot_id and s.user_id = auth.uid()));
