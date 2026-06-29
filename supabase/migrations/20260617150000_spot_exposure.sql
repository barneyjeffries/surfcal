-- 0005: per-spot exposure model for the offshore -> spot swell-height transform.
--
-- Exposure is a physical property of the break (which swell directions reach it
-- and how sheltered it is overall), so it lives on the shared `spots` catalogue,
-- not on per-user `user_spots`. The scorer reads these via the transform layer
-- (src/lib/scoring/transform.ts) to estimate height AT the spot rather than the
-- raw offshore height. Spots with no window set behave exactly as before.

alter table public.spots
  add column swell_window_min_deg smallint,
  add column swell_window_max_deg smallint,
  add column swell_window_wraps   boolean not null default false,
  add column exposure_coeff       real not null default 1
    check (exposure_coeff >= 0 and exposure_coeff <= 1);

-- Allow signed-in users to edit the shared catalogue's spot model. NOTE: spots
-- are shared, so this lets any user change a spot's exposure for everyone. That
-- is acceptable for the current single-user use; a multi-user build would want
-- ownership or per-user overrides instead.
create policy "spots_update_authenticated" on public.spots
  for update using (auth.uid() is not null) with check (auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- Starting values (ROUGH — tune in the UI against real sessions).
-- Harlyn: faces ~NNW, tucked behind Trevose Head, sheltered from W/SW. Catches
--   roughly WNW->NNE (window crosses north), and is a smaller, sheltered bay.
-- Watergate: faces ~W, wide open to the Atlantic. Catches roughly SSW->NNW.
-- ---------------------------------------------------------------------------
update public.spots
   set swell_window_min_deg = 285,
       swell_window_max_deg = 30,
       swell_window_wraps   = true,
       exposure_coeff       = 0.55
 where id = '2e69bab0-89d7-4500-b6ac-ac5bbb19d1e8';  -- Harlyn Bay

update public.spots
   set swell_window_min_deg = 210,
       swell_window_max_deg = 340,
       swell_window_wraps   = false,
       exposure_coeff       = 0.95
 where id = 'dd26ce0f-7f1b-4f12-ac86-ab1f6b843760';  -- Watergate Bay
