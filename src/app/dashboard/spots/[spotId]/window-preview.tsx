'use client'

import { useMemo } from 'react'
import type { ForecastPoint, TideEvent } from '@/lib/providers/types'
// PURE scoring module only — index.ts pulls in the admin client and is server-only.
import { scoreSpot, type SpotPrefs, type Window } from '@/lib/scoring/scoring'
import { formatHeightRange, formatWindRange, type Unit } from './units'

const r0 = (n: number) => String(Math.round(n))

function summarise(w: Window, unit: Unit): string {
  return (
    `${formatHeightRange(w.swellHeightMin, w.swellHeightMax, unit)} · ` +
    `${r0(w.periodMin)}–${r0(w.periodMax)}s · ` +
    `wind ${formatWindRange(w.windSpeedMin, w.windSpeedMax, unit)}`
  )
}

/**
 * Live, save-free preview of the windows the current (possibly unsaved) prefs
 * would produce. Pure scoring runs client-side; ~169 points re-score instantly,
 * so the parent just re-renders this on every edit.
 */
export function WindowPreview({
  forecast,
  tide,
  prefs,
  timezone,
  unit,
  lat,
  lng,
}: {
  forecast: ForecastPoint[]
  tide: TideEvent[]
  prefs: SpotPrefs
  timezone: string
  unit: Unit
  lat: number
  lng: number
}) {
  const windows = useMemo(
    () => scoreSpot(forecast, tide, prefs, lat, lng),
    [forecast, tide, prefs, lat, lng],
  )

  // Formatters in the spot's own timezone (falling back to UTC if unset).
  const tz = timezone || 'UTC'
  const dayFmt = useMemo(
    () =>
      new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }),
    [tz],
  )
  const timeFmt = useMemo(
    () =>
      new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
    [tz],
  )

  // Windows arrive sorted by start; collapse into contiguous day groups.
  const groups = useMemo(() => {
    const out: { day: string; items: Window[] }[] = []
    for (const w of windows) {
      const day = dayFmt.format(new Date(w.start))
      const last = out[out.length - 1]
      if (last && last.day === day) last.items.push(w)
      else out.push({ day, items: [w] })
    }
    return out
  }, [windows, dayFmt])

  return (
    <section className="rounded-2xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
      <h2 className="text-lg font-medium text-black dark:text-zinc-50">
        Upcoming windows
      </h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {windows.length} window{windows.length === 1 ? '' : 's'} in the next 7 days.
        Reflects your unsaved edits.
      </p>

      {windows.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-500">
          No matching windows — try loosening a threshold.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {groups.map((g) => (
            <div key={g.day}>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                {g.day}
              </p>
              <ul className="mt-1 divide-y divide-black/[.06] dark:divide-white/[.08]">
                {g.items.map((w) => (
                  <li
                    key={w.start}
                    className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
                  >
                    <span className="font-medium tabular-nums text-black dark:text-zinc-50">
                      {timeFmt.format(new Date(w.start))}–
                      {timeFmt.format(new Date(w.end))}
                    </span>
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">
                      {summarise(w, unit)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
