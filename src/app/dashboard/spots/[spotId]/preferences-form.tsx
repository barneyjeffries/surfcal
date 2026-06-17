'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import type { ForecastPoint, TideEvent } from '@/lib/providers/types'
import type { SpotPrefs } from '@/lib/scoring/scoring'
import { savePreferences } from './actions'
import type { Prefs, SaveState } from './types'
import { WindowPreview } from './window-preview'

/**
 * Build a SpotPrefs from the live form state, matching the save action's
 * null-handling exactly: "any direction" → null/null/false, blank tide offsets
 * → null. Empty/NaN numeric degrees collapse to null (unbounded) so the preview
 * doesn't blank out mid-edit. Real validation still happens on save.
 */
function readLivePrefs(form: HTMLFormElement): SpotPrefs {
  const fd = new FormData(form)
  const num = (k: string) => Number(String(fd.get(k) ?? '').trim())
  const optInt = (k: string): number | null => {
    const s = String(fd.get(k) ?? '').trim()
    if (s === '') return null
    const n = Number(s)
    return Number.isNaN(n) ? null : Math.trunc(n)
  }
  const arc = (prefix: string) => {
    if (fd.get(`${prefix}_any`) === 'on') {
      return { min: null, max: null, wraps: false }
    }
    const min = Number(String(fd.get(`${prefix}_min_deg`) ?? '').trim())
    const max = Number(String(fd.get(`${prefix}_max_deg`) ?? '').trim())
    return {
      min: Number.isNaN(min) ? null : min,
      max: Number.isNaN(max) ? null : max,
      wraps: fd.get(`${prefix}_wraps`) === 'on',
    }
  }

  const swell = arc('swell_dir')
  const wind = arc('wind_dir')
  const td = String(fd.get('tide_direction') ?? 'any')

  return {
    swell_height_min_m: num('swell_height_min_m'),
    swell_height_max_m: num('swell_height_max_m'),
    swell_period_min_s: num('swell_period_min_s'),
    swell_dir_min_deg: swell.min,
    swell_dir_max_deg: swell.max,
    swell_dir_wraps: swell.wraps,
    wind_dir_min_deg: wind.min,
    wind_dir_max_deg: wind.max,
    wind_dir_wraps: wind.wraps,
    wind_speed_max_kmh: num('wind_speed_max_kmh'),
    tide_direction: td === 'rising' || td === 'falling' ? td : 'any',
    tide_height_min_norm: num('tide_height_min_norm'),
    tide_height_max_norm: num('tide_height_max_norm'),
    tide_high_offset_min_minutes: optInt('tide_high_offset_min_minutes'),
    tide_high_offset_max_minutes: optInt('tide_high_offset_max_minutes'),
  }
}

/** The form's initial SpotPrefs, taken from the saved row. */
function initialPrefs(prefs: Prefs): SpotPrefs {
  // Prefs is SpotPrefs plus `label`; drop the label.
  const { label: _label, ...rest } = prefs
  return rest
}

const inputClass =
  'mt-1 w-full rounded-lg border border-black/[.12] bg-white px-3 py-2 text-black outline-none focus:border-black dark:border-white/[.2] dark:bg-black dark:text-zinc-50 dark:focus:border-zinc-50 disabled:opacity-40'
const labelClass = 'block text-sm font-medium text-black dark:text-zinc-50'
const hintClass = 'mt-1 text-xs text-zinc-500 dark:text-zinc-500'

function Card({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
      <h2 className="text-lg font-medium text-black dark:text-zinc-50">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

/** A swell/wind direction arc with an "any direction" escape hatch. */
function DirectionArc({
  prefix,
  legend,
  min,
  max,
  wraps,
}: {
  prefix: 'swell_dir' | 'wind_dir'
  legend: string
  min: number | null
  max: number | null
  wraps: boolean
}) {
  const [any, setAny] = useState(min == null && max == null)

  return (
    <fieldset>
      <legend className={labelClass}>{legend}</legend>
      <p className={hintClass}>
        Degrees the {prefix === 'swell_dir' ? 'swell' : 'wind'} comes <em>from</em>{' '}
        (0–360°).
      </p>

      <label className="mt-2 flex items-center gap-2 text-sm text-black dark:text-zinc-50">
        <input
          type="checkbox"
          name={`${prefix}_any`}
          checked={any}
          onChange={(e) => setAny(e.target.checked)}
        />
        Any direction
      </label>

      <div className="mt-2 grid grid-cols-2 gap-4">
        <div>
          <label htmlFor={`${prefix}_min_deg`} className={labelClass}>
            From (°)
          </label>
          <input
            id={`${prefix}_min_deg`}
            name={`${prefix}_min_deg`}
            type="number"
            min={0}
            max={360}
            step="any"
            disabled={any}
            defaultValue={min ?? ''}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor={`${prefix}_max_deg`} className={labelClass}>
            To (°)
          </label>
          <input
            id={`${prefix}_max_deg`}
            name={`${prefix}_max_deg`}
            type="number"
            min={0}
            max={360}
            step="any"
            disabled={any}
            defaultValue={max ?? ''}
            className={inputClass}
          />
        </div>
      </div>

      <label className="mt-2 flex items-center gap-2 text-sm text-black dark:text-zinc-50">
        <input
          type="checkbox"
          name={`${prefix}_wraps`}
          defaultChecked={wraps}
          disabled={any}
        />
        Arc crosses north (0°)
      </label>
    </fieldset>
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

  // Live prefs for the preview — rebuilt from the form on every edit.
  const [livePrefs, setLivePrefs] = useState<SpotPrefs>(() => initialPrefs(prefs))

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
          {prefs.label ?? spotName}
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

      <form
        action={formAction}
        onChange={(e) => setLivePrefs(readLivePrefs(e.currentTarget))}
        className="space-y-8"
      >
        <Card title="Swell">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="swell_height_min_m" className={labelClass}>
                Min height (m)
              </label>
              <input
                id="swell_height_min_m"
                name="swell_height_min_m"
                type="number"
                min={0}
                step="any"
                required
                defaultValue={prefs.swell_height_min_m}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="swell_height_max_m" className={labelClass}>
                Max height (m)
              </label>
              <input
                id="swell_height_max_m"
                name="swell_height_max_m"
                type="number"
                min={0}
                step="any"
                required
                defaultValue={prefs.swell_height_max_m}
                className={inputClass}
              />
            </div>
          </div>
          <p className={hintClass}>
            Offshore swell height from the forecast feed, not breaking-face height.
          </p>

          <div>
            <label htmlFor="swell_period_min_s" className={labelClass}>
              Min period (s)
            </label>
            <input
              id="swell_period_min_s"
              name="swell_period_min_s"
              type="number"
              min={0}
              step="any"
              required
              defaultValue={prefs.swell_period_min_s}
              className={inputClass}
            />
          </div>

          <DirectionArc
            prefix="swell_dir"
            legend="Swell direction arc"
            min={prefs.swell_dir_min_deg}
            max={prefs.swell_dir_max_deg}
            wraps={prefs.swell_dir_wraps}
          />
        </Card>

        <Card title="Wind">
          <DirectionArc
            prefix="wind_dir"
            legend="Wind direction arc"
            min={prefs.wind_dir_min_deg}
            max={prefs.wind_dir_max_deg}
            wraps={prefs.wind_dir_wraps}
          />
          <div>
            <label htmlFor="wind_speed_max_kmh" className={labelClass}>
              Max wind speed (km/h)
            </label>
            <input
              id="wind_speed_max_kmh"
              name="wind_speed_max_kmh"
              type="number"
              min={0}
              step="any"
              required
              defaultValue={prefs.wind_speed_max_kmh}
              className={inputClass}
            />
          </div>
        </Card>

        <Card title="Tide">
          <div>
            <label htmlFor="tide_direction" className={labelClass}>
              Tide direction
            </label>
            <select
              id="tide_direction"
              name="tide_direction"
              defaultValue={prefs.tide_direction}
              className={inputClass}
            >
              <option value="any">Any</option>
              <option value="rising">Rising</option>
              <option value="falling">Falling</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="tide_height_min_norm" className={labelClass}>
                Height min
              </label>
              <input
                id="tide_height_min_norm"
                name="tide_height_min_norm"
                type="number"
                min={0}
                max={1}
                step="any"
                required
                defaultValue={prefs.tide_height_min_norm}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="tide_height_max_norm" className={labelClass}>
                Height max
              </label>
              <input
                id="tide_height_max_norm"
                name="tide_height_max_norm"
                type="number"
                min={0}
                max={1}
                step="any"
                required
                defaultValue={prefs.tide_height_max_norm}
                className={inputClass}
              />
            </div>
          </div>
          <p className={hintClass}>
            Normalised: 0 = low water → 1 = high water.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="tide_high_offset_min_minutes" className={labelClass}>
                Earliest vs high (min)
              </label>
              <input
                id="tide_high_offset_min_minutes"
                name="tide_high_offset_min_minutes"
                type="number"
                step={1}
                defaultValue={prefs.tide_high_offset_min_minutes ?? ''}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="tide_high_offset_max_minutes" className={labelClass}>
                Latest vs high (min)
              </label>
              <input
                id="tide_high_offset_max_minutes"
                name="tide_high_offset_max_minutes"
                type="number"
                step={1}
                defaultValue={prefs.tide_high_offset_max_minutes ?? ''}
                className={inputClass}
              />
            </div>
          </div>
          <p className={hintClass}>
            Minutes relative to the nearest high water (negative = before high). Blank =
            no bound. E.g. &ldquo;an hour before high&rdquo; → latest = −60.
          </p>
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
              defaultValue={prefs.label ?? ''}
              placeholder={spotName}
              className={inputClass}
            />
            <p className={hintClass}>Shown instead of the shared spot name on your dashboard.</p>
          </div>
        </Card>

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
