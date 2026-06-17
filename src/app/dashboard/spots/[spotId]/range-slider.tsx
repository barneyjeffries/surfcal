'use client'

import { useRef } from 'react'

/**
 * Custom single- and dual-handle range sliders. Native <input type="range">
 * can't do a styled dual-thumb track, and these need to look considered, so
 * both are pointer-driven. Values are controlled; the parent owns state and
 * mirrors it into hidden inputs for the save action.
 */

function snap(v: number, min: number, max: number, step: number): number {
  const stepped = Math.round((v - min) / step) * step + min
  return Math.min(max, Math.max(min, Number(stepped.toFixed(6))))
}

function valueFromPointer(
  el: HTMLElement,
  clientX: number,
  min: number,
  max: number,
  step: number,
): number {
  const rect = el.getBoundingClientRect()
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  return snap(min + ratio * (max - min), min, max, step)
}

const pct = (v: number, min: number, max: number) => ((v - min) / (max - min)) * 100

const TRACK =
  'absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-black/[.1] dark:bg-white/[.14]'
const FILL =
  'absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-sky-500'
const HANDLE =
  'absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sky-500 bg-white shadow-sm outline-none cursor-grab active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-sky-400 dark:bg-zinc-900'

function arrowDelta(key: string, step: number): number {
  if (key === 'ArrowLeft' || key === 'ArrowDown') return -step
  if (key === 'ArrowRight' || key === 'ArrowUp') return step
  return 0
}

export function SingleRange({
  min,
  max,
  step,
  value,
  onChange,
}: {
  min: number
  max: number
  step: number
  value: number
  onChange: (v: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const begin = (e: React.PointerEvent) => {
    e.preventDefault()
    const apply = (clientX: number) => {
      if (trackRef.current) {
        onChangeRef.current(valueFromPointer(trackRef.current, clientX, min, max, step))
      }
    }
    apply(e.clientX)
    const move = (ev: PointerEvent) => apply(ev.clientX)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const onKey = (e: React.KeyboardEvent) => {
    const d = arrowDelta(e.key, step)
    if (!d) return
    e.preventDefault()
    onChange(snap(value + d, min, max, step))
  }

  const p = pct(value, min, max)
  return (
    <div
      ref={trackRef}
      onPointerDown={begin}
      className="relative h-6 cursor-pointer touch-none select-none"
    >
      <div className={TRACK} />
      <div className={FILL} style={{ left: 0, width: `${p}%` }} />
      <button
        type="button"
        role="slider"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        tabIndex={0}
        onKeyDown={onKey}
        onPointerDown={(e) => e.stopPropagation()}
        className={HANDLE}
        style={{ left: `${p}%` }}
      />
    </div>
  )
}

export function DualRange({
  min,
  max,
  step,
  valueMin,
  valueMax,
  onChange,
}: {
  min: number
  max: number
  step: number
  valueMin: number
  valueMax: number
  onChange: (lo: number, hi: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  // Live refs so clamping during a drag uses current values, not drag-start ones.
  const loRef = useRef(valueMin)
  const hiRef = useRef(valueMax)
  const onChangeRef = useRef(onChange)
  loRef.current = valueMin
  hiRef.current = valueMax
  onChangeRef.current = onChange

  const drag = (which: 'lo' | 'hi') => (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const move = (ev: PointerEvent) => {
      if (!trackRef.current) return
      const v = valueFromPointer(trackRef.current, ev.clientX, min, max, step)
      if (which === 'lo') onChangeRef.current(Math.min(v, hiRef.current), hiRef.current)
      else onChangeRef.current(loRef.current, Math.max(v, loRef.current))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const onKey = (which: 'lo' | 'hi') => (e: React.KeyboardEvent) => {
    const d = arrowDelta(e.key, step)
    if (!d) return
    e.preventDefault()
    if (which === 'lo') onChange(snap(Math.min(valueMin + d, valueMax), min, max, step), valueMax)
    else onChange(valueMin, snap(Math.max(valueMax + d, valueMin), min, max, step))
  }

  const lo = pct(valueMin, min, max)
  const hi = pct(valueMax, min, max)
  return (
    <div ref={trackRef} className="relative h-6 touch-none select-none">
      <div className={TRACK} />
      <div className={FILL} style={{ left: `${lo}%`, width: `${hi - lo}%` }} />
      <button
        type="button"
        role="slider"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={valueMin}
        tabIndex={0}
        onPointerDown={drag('lo')}
        onKeyDown={onKey('lo')}
        className={HANDLE}
        style={{ left: `${lo}%` }}
      />
      <button
        type="button"
        role="slider"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={valueMax}
        tabIndex={0}
        onPointerDown={drag('hi')}
        onKeyDown={onKey('hi')}
        className={HANDLE}
        style={{ left: `${hi}%` }}
      />
    </div>
  )
}
