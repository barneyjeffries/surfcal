'use client'

import { useRef } from 'react'

export type DialValue = {
  minDeg: number
  maxDeg: number
  /** Derived: true when the clockwise arc from min→max crosses north (min > max). */
  wraps: boolean
  any: boolean
}

const SIZE = 220
const C = SIZE / 2
const R = 84
const SNAP = 5

const POINTS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
]

/** 16-point compass abbreviation for a bearing in degrees. */
export function compassPoint(deg: number): string {
  return POINTS[Math.round(deg / 22.5) % 16]
}

/** Point on the rim for a bearing: north at top, clockwise (E right, S bottom). */
function pos(deg: number, r = R) {
  const rad = (deg * Math.PI) / 180
  return { x: C + r * Math.sin(rad), y: C - r * Math.cos(rad) }
}

const CARDINALS = [
  { d: 0, l: 'N' },
  { d: 90, l: 'E' },
  { d: 180, l: 'S' },
  { d: 270, l: 'W' },
]

/**
 * Reusable compass arc picker. Two rim handles set the favourable arc the spot
 * catches (degrees the swell/wind comes FROM); the shaded sector is the
 * CLOCKWISE sweep from `minDeg` to `maxDeg`. `wraps` is derived (min > max), so
 * the caller never enters it — it matches the *_wraps scoring semantics.
 */
export function CompassDial({
  value,
  onChange,
}: {
  value: DialValue
  onChange: (v: DialValue) => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const valueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  valueRef.current = value
  onChangeRef.current = onChange

  function bearingFromEvent(clientX: number, clientY: number): number {
    const rect = svgRef.current!.getBoundingClientRect()
    // Map client → viewBox coordinates (the SVG scales to its rendered width).
    const px = ((clientX - rect.left) / rect.width) * SIZE
    const py = ((clientY - rect.top) / rect.height) * SIZE
    const dx = px - C
    const dy = py - C
    const bearing = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360
    return (Math.round(bearing / SNAP) * SNAP) % 360
  }

  const startDrag = (which: 'min' | 'max') => (e: React.PointerEvent) => {
    e.preventDefault()
    const move = (ev: PointerEvent) => {
      const b = bearingFromEvent(ev.clientX, ev.clientY)
      const v = valueRef.current
      onChangeRef.current(
        which === 'min'
          ? { ...v, minDeg: b, wraps: b > v.maxDeg }
          : { ...v, maxDeg: b, wraps: v.minDeg > b },
      )
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const start = pos(value.minDeg)
  const end = pos(value.maxDeg)
  const sweep = (value.maxDeg - value.minDeg + 360) % 360
  const largeArc = sweep > 180 ? 1 : 0
  // Filled sector from centre out to the clockwise arc (sweep-flag 1 = clockwise).
  const sector =
    sweep === 0
      ? ''
      : `M ${C} ${C} L ${start.x.toFixed(2)} ${start.y.toFixed(2)} ` +
        `A ${R} ${R} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)} Z`

  return (
    <div>
      <label className="flex items-center gap-2 text-sm text-black dark:text-zinc-50">
        <input
          type="checkbox"
          checked={value.any}
          onChange={(e) => onChange({ ...value, any: e.target.checked })}
        />
        Any direction
      </label>

      <div
        className={`mt-2 flex justify-center ${value.any ? 'pointer-events-none opacity-40' : ''}`}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="w-full max-w-[240px] touch-none"
          aria-hidden={value.any}
        >
          <circle
            cx={C}
            cy={C}
            r={R}
            fill="none"
            strokeWidth={2}
            className="stroke-black/15 dark:stroke-white/20"
          />

          {Array.from({ length: 12 }).map((_, i) => {
            const d = i * 30
            const outer = pos(d, R)
            const inner = pos(d, R - (d % 90 === 0 ? 12 : 7))
            return (
              <line
                key={d}
                x1={outer.x}
                y1={outer.y}
                x2={inner.x}
                y2={inner.y}
                strokeWidth={d % 90 === 0 ? 2 : 1}
                className="stroke-black/30 dark:stroke-white/30"
              />
            )
          })}

          {sector && (
            <path
              d={sector}
              fill="rgba(14,165,233,0.18)"
              stroke="rgb(14,165,233)"
              strokeWidth={2}
            />
          )}

          {CARDINALS.map((c) => {
            const p = pos(c.d, R - 22)
            return (
              <text
                key={c.l}
                x={p.x}
                y={p.y}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-zinc-500 text-[13px] font-semibold"
              >
                {c.l}
              </text>
            )
          })}

          {(['min', 'max'] as const).map((k) => {
            const p = k === 'min' ? start : end
            return (
              <g key={k}>
                {/* Larger invisible hit area for easier grabbing. */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={16}
                  fill="transparent"
                  onPointerDown={startDrag(k)}
                  className="cursor-grab active:cursor-grabbing"
                />
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={9}
                  strokeWidth={3}
                  className="pointer-events-none fill-white stroke-sky-600 dark:fill-zinc-900"
                />
              </g>
            )
          })}
        </svg>
      </div>

      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {value.any
          ? 'Any direction'
          : `from ${value.minDeg}° to ${value.maxDeg}° (${compassPoint(value.minDeg)}–${compassPoint(value.maxDeg)})`}
      </p>
    </div>
  )
}
