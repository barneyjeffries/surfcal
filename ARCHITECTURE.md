# SurfCal — Architecture

SurfCal is a personal surf-forecast tool. A user saves surf spots and the
conditions they like at each one, and SurfCal produces a subscribable **iCal
calendar feed** of the times those conditions are forecast to be met — so good
surf windows appear in the user's normal calendar app alongside everything else.

It is a **tool, not a guide**: the user sets the thresholds for each spot, and
SurfCal faithfully reports when the forecast falls inside them. SurfCal does not
assign its own quality rating.

## Stack
- Next.js (App Router, TypeScript) on Vercel
- Supabase: Postgres + Auth (+ pg_cron for scheduled refresh)
- Stormglass for forecast + tide data (swappable — see Providers)

## Data sources & quotas
Stormglass supplies both waves/wind (one `/weather/point` call returns swell +
wind together) and tide (`/tide/extremes/point`, a separate call). The free tier
is **10 requests/day, personal use only**; any public/commercial use requires a
paid plan.

Two refresh cadences keep us inside the free tier:
- Weather (waves/wind) changes constantly → refresh each spot **daily**.
- Tide is deterministic → fetch ~10 days of extremes in one call and refresh each
  spot **weekly**.

So per spot the steady cost is ~1 weather call/day plus a weekly tide call.

## Providers (swappable boundary)
`src/lib/providers/types.ts` defines normalised shapes (`ForecastPoint`,
`TideEvent`) and two interfaces (`ForecastProvider`, `TideProvider`). Everything
downstream consumes only these shapes — never a vendor's raw response.
`src/lib/providers/stormglass.ts` maps Stormglass into them. To switch waves/wind
to Open-Meteo later (e.g. if the Stormglass quota pinches), add an Open-Meteo
provider implementing the same interface; nothing else changes.

Directions are always degrees (0–360) the swell/wind is coming **FROM**. Times are
ISO 8601 UTC.

## Data model
(Supabase, `supabase/migrations/`.) All tables are RLS-protected.

- `profiles` — one row per auth user; holds `calendar_token`, the unguessable id
  in the user's feed URL. Auto-created on signup by a trigger.
- `spots` — a **shared** catalogue of physical breaks: name, coordinates, optional
  `forecast_*` coordinates nudged offshore (marine grid cells on land return
  nulls), timezone. Not owned by a user; any authenticated user can read the
  catalogue and add to it.
- `user_spots` — the link between a user and a spot, carrying **that user's
  thresholds** and an optional personal `label`. Primary key `(user_id, spot_id)`.
  Preferences live here, not on the shared spot, because two surfers at the same
  break want different conditions.
- `forecast_cache` — hourly waves/wind per spot, keyed `(spot_id, ts)`. Stored
  once per shared spot.
- `tide_cache` — high/low events per spot, keyed `(spot_id, ts)`.

Forecast/tide data is stored against the shared spot; each user's calendar is built
by joining their `user_spots` (links + prefs) against that shared cache.

Direction arcs are stored as `*_min_deg`, `*_max_deg`, plus a `*_wraps` boolean —
because a compass arc like SW→E crosses 0°/360°, and a naive `min ≤ x ≤ max` test
would be wrong. The scoring engine uses `wraps` to pick the right comparison.

### Tide rule (relative to the cycle)
Stored on `user_spots`. Surfers describe tide relative to the cycle ("rising, mid
to an hour before high"), not as absolute metres, so that's how it's stored. All
constraints are optional and AND-combined:
- `tide_direction`: `any` | `rising` | `falling`
- `tide_height_min_norm` / `tide_height_max_norm`: normalised height band,
  0 = low water, 1 = high water
- `tide_high_offset_min_minutes` / `tide_high_offset_max_minutes`: bounds in
  minutes relative to the nearest high water (negative = before, positive = after);
  null = unbounded

The scoring engine derives, for each forecast hour, the normalised height,
direction, and minutes-to-high by interpolating the tide curve (half-cosine)
between cached high/low events.

Example — Harlyn ("rising, from mid to an hour before high"):
`tide_direction = 'rising'`, `tide_height_min_norm = 0.5`,
`tide_high_offset_max_minutes = -60`.

## Scoring
Per spot, for each forecast hour the engine checks every threshold that is set, and
the hour qualifies only if **all** are satisfied (boolean AND). Contiguous
qualifying hours collapse into one window. Each window becomes one calendar event.
No weighting, no opaque score — transparency is the point.

## iCal delivery
A route (`/api/calendar/[token]`) returns `text/calendar`. It looks the user up by
`calendar_token` using the Supabase **service role** (so it bypasses RLS — calendar
apps can't authenticate), reads that user's `user_spots` (links + prefs) joined
against the shared `forecast_cache`/`tide_cache`, runs scoring, and emits a fresh
`VCALENDAR` on every poll. Each event's UID is stable per (spot, window-start) so
clients update rather than duplicate. Clients poll on their own slow schedule; we
never push.

## Caching & refresh
A scheduled job (Supabase pg_cron, or Vercel cron) refreshes weather daily and tide
weekly, writing to the cache tables via the service role. The iCal route only ever
**reads** the cache — it never calls Stormglass — so many calendar polls cost zero
API quota.

Because spots are shared, forecast/tide is fetched once per spot and serves every
user linked to it: API calls scale with the number of distinct spots, not
users × spots. The refresh job can skip spots that no user follows. Spot
**deduplication** — ensuring two users who mean the same break link to one row, via
a canonical spot list or coordinate matching — is deferred until the add-spot UI.

## Build order
1. Scaffold ✅
2. Schema + RLS → Supabase ✅
3. Stormglass provider + refresh endpoint ✅
4. Scoring engine (cache + prefs → windows)
5. iCal route (windows → VCALENDAR)
6. Cron (weather daily, tide weekly)
7. Auth + UI (browse/add spots, set prefs)

## Conventions
- Provider/secret-using code is **server-only** (route handlers, cron, scripts) —
  never in client components.
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `STORMGLASS_API_KEY`, `CRON_SECRET`.
- The service role key is server-only and must never reach the client.
