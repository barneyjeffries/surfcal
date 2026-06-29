'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { updateSpot } from '../actions'
import { CompassDial, type DialValue } from '../compass-dial'
import { SingleRange } from '../range-slider'
import type { SaveState, SpotModel } from '../types'

const labelClass = 'block text-sm font-medium text-black dark:text-zinc-50'
const hintClass = 'mt-1 text-xs text-zinc-500 dark:text-zinc-500'
const inputClass =
  'mt-1 w-full rounded-lg border border-black/[.12] bg-white px-3 py-2 text-black outline-none focus:border-black dark:border-white/[.2] dark:bg-black dark:text-zinc-50 dark:focus:border-zinc-50'
const valueClass = 'text-sm font-medium tabular-nums text-sky-700 dark:text-sky-400'

/** Swell dial: null/null → "any" (no directional shadowing). Mirrors the prefs form. */
function swellDialFrom(min: number | null, max: number | null): DialValue {
  if (min == null || max == null) {
    return { minDeg: 0, maxDeg: 90, wraps: false, any: true }
  }
  return { minDeg: min, maxDeg: max, wraps: min > max, any: false }
}

export function SpotEditForm({
  spotId,
  name: initialName,
  spotModel,
}: {
  spotId: string
  name: string
  spotModel: SpotModel
}) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    updateSpot.bind(null, spotId),
    { status: 'idle' },
  )

  const [name, setName] = useState(initialName)
  const [swellWindow, setSwellWindow] = useState<DialValue>(() =>
    swellDialFrom(spotModel.swell_window_min_deg, spotModel.swell_window_max_deg),
  )
  const [exposureCoeff, setExposureCoeff] = useState(spotModel.exposure_coeff)

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-10">
      <header>
        <Link
          href={`/dashboard/spots/${spotId}`}
          className="text-sm text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400"
        >
          ← Back to preferences
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Edit spot details
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          These describe the physical break and are shared — editing them affects
          this spot for everyone who follows it.
        </p>
      </header>

      <form action={formAction} className="space-y-8">
        <section className="rounded-2xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
          <h2 className="text-lg font-medium text-black dark:text-zinc-50">Spot model</h2>
          <div className="mt-4 space-y-6">
            <div>
              <label htmlFor="name" className={labelClass}>
                Spot name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
              />
              <p className={hintClass}>The shared catalogue name shown to all users.</p>
            </div>

            <div>
              <span className={labelClass}>Swell window</span>
              <p className={hintClass}>
                The arc of swell directions that actually reach this spot (degrees
                the swell comes from). Swell from outside it is shadowed.
              </p>
              <div className="mt-2">
                <CompassDial value={swellWindow} onChange={setSwellWindow} />
              </div>
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <span className={labelClass}>Exposure / size factor</span>
                <span className={valueClass}>{Math.round(exposureCoeff * 100)}%</span>
              </div>
              <div className="mt-2">
                <SingleRange
                  min={0}
                  max={1}
                  step={0.01}
                  value={exposureCoeff}
                  onChange={setExposureCoeff}
                />
              </div>
              <p className={hintClass}>
                How much of the offshore swell height reaches the break. Lower = more
                sheltered.
              </p>
            </div>
          </div>
        </section>

        {/* Hidden inputs mirror the controlled state for the arc() + reqNum
            parsers in updateSpot, matching the names the action expects. */}
        <input type="hidden" name="swell_window_any" value={swellWindow.any ? 'on' : ''} />
        <input type="hidden" name="swell_window_min_deg" value={swellWindow.minDeg} />
        <input type="hidden" name="swell_window_max_deg" value={swellWindow.maxDeg} />
        <input
          type="hidden"
          name="swell_window_wraps"
          value={!swellWindow.any && swellWindow.minDeg > swellWindow.maxDeg ? 'on' : ''}
        />
        <input type="hidden" name="exposure_coeff" value={exposureCoeff} />

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-foreground px-5 py-2.5 font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            {pending ? 'Saving…' : 'Save spot'}
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
