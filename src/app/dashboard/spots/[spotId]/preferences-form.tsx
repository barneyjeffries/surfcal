'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import type { ForecastPoint, TideEvent } from '@/lib/providers/types'
import type { SpotPrefs } from '@/lib/scoring/scoring'
import { savePreferences } from './actions'
import { CompassDial, type DialValue } from './compass-dial'
import { DualRange, SingleRange } from './range-slider'
import type { Prefs, SaveState } from './types'
import { WindowPreview } from './window-preview'

const labelClass = 'block text-sm font-medium text-black dark:text-zinc-50'
const hintClass = 'mt-1 text-xs text-zinc-500 dark:text-zinc-500'
const inputClass =
  'mt-1 w-full rounded-lg border border-black/[.12] bg-white px-3 py-2 text-black outline-none focus:border-black dark:border-white/[.2] dark:bg-black dark:text-zinc-50 dark:focus:border-zinc-50'
const valueClass = 'text-sm font-medium tabular-nums text-sky-700 dark:text-sky-400'

/** UI-facing form state. Sliders/dials are controlled; this is the source of truth. */
type FormState = {
  label: string
  swellHeightMin: number
  swellHeightMax: number
  swellPeriodMin: number
  windSpeedMax: number
  swellDir: DialValue
  windDir: DialValue
  tideDirection: 'any' | 'rising' | 'falling'
  tideHeightMin: number
  tideHeightMax: number
  tideOffsetEnabled: boolean
  tideOffsetMin: number // minutes relative to high (−360..360)
  tideOffsetMax: number
}

function dialFrom(min: number | null, max: number | null): DialValue {
  if (min == null || max == null) {
    return { minDeg: 0, maxDeg: 90, wraps: false, any: true }
  }
  return { minDeg: min, maxDeg: max, wraps: min > max, any: false }
}

function initialState(prefs: Prefs): FormState {
  return {
    label: prefs.label ?? '',
    swellHeightMin: prefs.swell_height_min_m,
    swellHeightMax: prefs.swell_height_max_m,
    swellPeriodMin: prefs.swell_period_min_s,
    windSpeedMax: prefs.wind_speed_max_kmh,
    swellDir: dialFrom(prefs.swell_dir_min_deg, prefs.swell_dir_max_deg),
    windDir: dialFrom(prefs.wind_dir_min_deg, prefs.wind_dir_max_deg),
    tideDirection: prefs.tide_direction,
    tideHeightMin: prefs.tide_height_min_norm,
    tideHeightMax: prefs.tide_height_max_norm,
    tideOffsetEnabled:
      prefs.tide_high_offset_min_minutes != null ||
      prefs.tide_high_offset_max_minutes != null,
    tideOffsetMin: prefs.tide_high_offset_min_minutes ?? -120,
    tideOffsetMax: prefs.tide_high_offset_max_minutes ?? 60,
  }
}

/** Derive the SpotPrefs the scoring engine expects from the UI state. */
function toSpotPrefs(s: FormState): SpotPrefs {
  return {
    swell_height_min_m: s.swellHeightMin,
    swell_height_max_m: s.swellHeightMax,
    swell_period_min_s: s.swellPeriodMin,
    swell_dir_min_deg: s.swellDir.any ? null : s.swellDir.minDeg,
    swell_dir_max_deg: s.swellDir.any ? null : s.swellDir.maxDeg,
    swell_dir_wraps: s.swellDir.any ? false : s.swellDir.minDeg > s.swellDir.maxDeg,
    wind_dir_min_deg: s.windDir.any ? null : s.windDir.minDeg,
    wind_dir_max_deg: s.windDir.any ? null : s.windDir.maxDeg,
    wind_dir_wraps: s.windDir.any ? false : s.windDir.minDeg > s.windDir.maxDeg,
    wind_speed_max_kmh: s.windSpeedMax,
    tide_direction: s.tideDirection,
    tide_height_min_norm: s.tideHeightMin,
    tide_height_max_norm: s.tideHeightMax,
    tide_high_offset_min_minutes: s.tideOffsetEnabled ? s.tideOffsetMin : null,
    tide_high_offset_max_minutes: s.tideOffsetEnabled ? s.tideOffsetMax : null,
  }
}

const hrs = (m: number) => {
  const sign = m < 0 ? '−' : m > 0 ? '+' : ''
  return `${sign}${(Math.abs(m) / 60).toFixed(1)} h`
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
      <h2 className="text-lg font-medium text-black dark:text-zinc-50">{title}</h2>
      <div className="mt-4 space-y-6">{children}</div>
    </section>
  )
}

function Field({
  label,
  value,
  children,
  hint,
}: {
  label: string
  value: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className={labelClass}>{label}</span>
        <span className={valueClass}>{value}</span>
      </div>
      <div className="mt-2">{children}</div>
      {hint && <p className={hintClass}>{hint}</p>}
    </div>
  )
}

export function PreferencesForm({
  spotId,
  spotName,
  prefs,
  forecast,
  tide,
  timezone,
}: {
  spotId: string
  spotName: string
  prefs: Prefs
  forecast: ForecastPoint[]
  tide: TideEvent[]
  timezone: string
}) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    savePreferences.bind(null, spotId),
    { status: 'idle' },
  )

  const [s, setS] = useState<FormState>(() => initialState(prefs))
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setS((prev) => ({ ...prev, [key]: value }))

  const livePrefs = toSpotPrefs(s)

  const tideDirs: ['any' | 'rising' | 'falling', string][] = [
    ['any', 'Any'],
    ['rising', 'Rising'],
    ['falling', 'Falling'],
  ]

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <header>
        <Link
          href="/dashboard"
          className="text-sm text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400"
        >
          ← Back to dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          {s.label || spotName}
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Set the conditions that count as good surf here. An hour qualifies only when
          every condition you set is met.
        </p>
      </header>

      <WindowPreview
        forecast={forecast}
        tide={tide}
        prefs={livePrefs}
        timezone={timezone}
      />

      <form action={formAction} className="space-y-8">
        <Card title="Swell">
          <Field
            label="Height (m)"
            value={`${s.swellHeightMin.toFixed(1)}–${s.swellHeightMax.toFixed(1)} m`}
            hint="Offshore swell height from the forecast feed, not breaking-face height."
          >
            <DualRange
              min={0}
              max={4}
              step={0.1}
              valueMin={s.swellHeightMin}
              valueMax={s.swellHeightMax}
              onChange={(lo, hi) =>
                setS((p) => ({ ...p, swellHeightMin: lo, swellHeightMax: hi }))
              }
            />
          </Field>

          <Field label="Minimum period (s)" value={`${s.swellPeriodMin.toFixed(1)} s`}>
            <SingleRange
              min={0}
              max={20}
              step={0.5}
              value={s.swellPeriodMin}
              onChange={(v) => set('swellPeriodMin', v)}
            />
          </Field>

          <div>
            <span className={labelClass}>Swell direction arc</span>
            <p className={hintClass}>Degrees the swell comes from. Drag the two handles.</p>
            <div className="mt-2">
              <CompassDial value={s.swellDir} onChange={(v) => set('swellDir', v)} />
            </div>
          </div>
        </Card>

        <Card title="Wind">
          <div>
            <span className={labelClass}>Wind direction arc</span>
            <p className={hintClass}>
              Favourable (offshore) wind. Degrees the wind comes from.
            </p>
            <div className="mt-2">
              <CompassDial value={s.windDir} onChange={(v) => set('windDir', v)} />
            </div>
          </div>

          <Field label="Maximum wind speed" value={`${Math.round(s.windSpeedMax)} km/h`}>
            <SingleRange
              min={0}
              max={60}
              step={1}
              value={s.windSpeedMax}
              onChange={(v) => set('windSpeedMax', v)}
            />
          </Field>
        </Card>

        <Card title="Tide">
          <div>
            <span className={labelClass}>Tide direction</span>
            <div className="mt-2 inline-flex rounded-lg border border-black/[.12] p-0.5 dark:border-white/[.2]">
              {tideDirs.map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => set('tideDirection', v)}
                  className={
                    'rounded-md px-4 py-1.5 text-sm font-medium transition-colors ' +
                    (s.tideDirection === v
                      ? 'bg-sky-500 text-white'
                      : 'text-zinc-600 hover:bg-black/[.04] dark:text-zinc-400 dark:hover:bg-white/[.06]')
                  }
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <Field
            label="Height band"
            value={`${Math.round(s.tideHeightMin * 100)}%–${Math.round(s.tideHeightMax * 100)}%`}
            hint="Low water → High water."
          >
            <DualRange
              min={0}
              max={1}
              step={0.01}
              valueMin={s.tideHeightMin}
              valueMax={s.tideHeightMax}
              onChange={(lo, hi) =>
                setS((p) => ({ ...p, tideHeightMin: lo, tideHeightMax: hi }))
              }
            />
          </Field>

          <div>
            <label className="flex items-center gap-2 text-sm text-black dark:text-zinc-50">
              <input
                type="checkbox"
                checked={s.tideOffsetEnabled}
                onChange={(e) => set('tideOffsetEnabled', e.target.checked)}
              />
              Limit to a window around high tide
            </label>
            {s.tideOffsetEnabled && (
              <div className="mt-3">
                <div className="flex items-baseline justify-between">
                  <span className={labelClass}>Window vs high water</span>
                  <span className={valueClass}>
                    {hrs(s.tideOffsetMin)} to {hrs(s.tideOffsetMax)}
                  </span>
                </div>
                <div className="mt-2">
                  <DualRange
                    min={-360}
                    max={360}
                    step={15}
                    valueMin={s.tideOffsetMin}
                    valueMax={s.tideOffsetMax}
                    onChange={(lo, hi) =>
                      setS((p) => ({ ...p, tideOffsetMin: lo, tideOffsetMax: hi }))
                    }
                  />
                </div>
                <p className={hintClass}>
                  Hours relative to the nearest high water (negative = before high).
                </p>
              </div>
            )}
          </div>
        </Card>

        <Card title="Label">
          <div>
            <label htmlFor="label" className={labelClass}>
              Personal name (optional)
            </label>
            <input
              id="label"
              name="label"
              type="text"
              value={s.label}
              onChange={(e) => set('label', e.target.value)}
              placeholder={spotName}
              className={inputClass}
            />
            <p className={hintClass}>
              Shown instead of the shared spot name on your dashboard.
            </p>
          </div>
        </Card>

        {/* Hidden inputs mirror the controlled state so the save action's
            FormData parsing is unchanged. */}
        <input type="hidden" name="swell_height_min_m" value={s.swellHeightMin} />
        <input type="hidden" name="swell_height_max_m" value={s.swellHeightMax} />
        <input type="hidden" name="swell_period_min_s" value={s.swellPeriodMin} />
        <input type="hidden" name="wind_speed_max_kmh" value={s.windSpeedMax} />

        <input type="hidden" name="swell_dir_any" value={s.swellDir.any ? 'on' : ''} />
        <input type="hidden" name="swell_dir_min_deg" value={s.swellDir.minDeg} />
        <input type="hidden" name="swell_dir_max_deg" value={s.swellDir.maxDeg} />
        <input
          type="hidden"
          name="swell_dir_wraps"
          value={!s.swellDir.any && s.swellDir.minDeg > s.swellDir.maxDeg ? 'on' : ''}
        />

        <input type="hidden" name="wind_dir_any" value={s.windDir.any ? 'on' : ''} />
        <input type="hidden" name="wind_dir_min_deg" value={s.windDir.minDeg} />
        <input type="hidden" name="wind_dir_max_deg" value={s.windDir.maxDeg} />
        <input
          type="hidden"
          name="wind_dir_wraps"
          value={!s.windDir.any && s.windDir.minDeg > s.windDir.maxDeg ? 'on' : ''}
        />

        <input type="hidden" name="tide_direction" value={s.tideDirection} />
        <input type="hidden" name="tide_height_min_norm" value={s.tideHeightMin} />
        <input type="hidden" name="tide_height_max_norm" value={s.tideHeightMax} />
        <input
          type="hidden"
          name="tide_high_offset_min_minutes"
          value={s.tideOffsetEnabled ? s.tideOffsetMin : ''}
        />
        <input
          type="hidden"
          name="tide_high_offset_max_minutes"
          value={s.tideOffsetEnabled ? s.tideOffsetMax : ''}
        />

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-foreground px-5 py-2.5 font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            {pending ? 'Saving…' : 'Save preferences'}
          </button>
          {state.status === 'saved' && (
            <span className="text-sm font-medium text-green-600 dark:text-green-400">
              Saved.
            </span>
          )}
        </div>

        {state.status === 'error' && (
          <p className="text-sm text-red-600 dark:text-red-400">{state.message}</p>
        )}
      </form>
    </main>
  )
}
