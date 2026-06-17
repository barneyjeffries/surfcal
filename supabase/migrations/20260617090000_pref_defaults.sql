-- 0003: sensible defaults for new spot preferences.
-- A period floor of 8s, max wind ~30mph (48 km/h), and a default wind-direction
-- half-circle (0-180) instead of "any". Existing user_spots rows are unaffected;
-- this only changes what newly-added spots start with.

alter table public.user_spots
  alter column swell_period_min_s set default 8,
  alter column wind_speed_max_kmh set default 48,
  alter column wind_dir_min_deg   set default 0,
  alter column wind_dir_max_deg   set default 180,
  alter column wind_dir_wraps     set default false;
