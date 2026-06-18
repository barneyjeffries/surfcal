-- 0004: per-user display units, so the server-generated iCal feed can match the
-- Imperial/Metric toggle from the dashboard. Storage stays metric (metres,
-- km/h); this only controls how heights and wind speeds are *displayed*.
-- Defaults to imperial to match the dashboard default.

alter table public.profiles
  add column units text not null default 'imperial'
    check (units in ('metric', 'imperial'));
