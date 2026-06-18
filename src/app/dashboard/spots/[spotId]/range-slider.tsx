'use client'

/**
 * Single- and dual-handle range sliders built on native <input type="range">,
 * so dragging, touch and keyboard support all come from the browser rather than
 * hand-rolled pointer maths (which is what was broken before).
 *
 * The visible track + sky fill are our own divs drawn behind the inputs; the
 * native tracks are transparent and only the native thumbs are interactive. For
 * the dual slider, two inputs are overlaid and `pointer-events` is disabled on
 * the input bodies and re-enabled on the thumbs, so both thumbs stay grabbable.
 *
 * Same API as before: the parent owns state and mirrors values into hidden
 * inputs for the save action, so these need no `name`.
 */

const RANGE_CSS = `
.surfcal-range {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 1.5rem;
  margin: 0;
  background: transparent;
  outline: none;
}
.surfcal-range::-webkit-slider-runnable-track { height: 1.5rem; background: transparent; }
.surfcal-range::-moz-range-track { height: 1.5rem; background: transparent; }
.surfcal-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  height: 1rem;
  width: 1rem;
  margin-top: 0.25rem;
  border-radius: 9999px;
  background: #fff;
  border: 2px solid #0ea5e9;
  box-shadow: 0 1px 2px rgba(0,0,0,.12);
  cursor: grab;
}
.surfcal-range::-webkit-slider-thumb:active { cursor: grabbing; }
.surfcal-range::-moz-range-thumb {
  height: 1rem;
  width: 1rem;
  border-radius: 9999px;
  background: #fff;
  border: 2px solid #0ea5e9;
  box-shadow: 0 1px 2px rgba(0,0,0,.12);
  cursor: grab;
}
.surfcal-range:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 3px rgba(56,189,248,.5); }
.surfcal-range:focus-visible::-moz-range-thumb { box-shadow: 0 0 0 3px rgba(56,189,248,.5); }
/* Dual range: overlay two inputs; only the thumbs catch pointer events. */
.surfcal-range--overlay { position: absolute; inset: 0; pointer-events: none; }
.surfcal-range--overlay::-webkit-slider-thumb { pointer-events: auto; }
.surfcal-range--overlay::-moz-range-thumb { pointer-events: auto; }
@media (prefers-color-scheme: dark) {
  .surfcal-range::-webkit-slider-thumb { background: #18181b; }
  .surfcal-range::-moz-range-thumb { background: #18181b; }
}
`

const TRACK =
  'pointer-events-none absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-black/[.1] dark:bg-white/[.14]'
const FILL =
  'pointer-events-none absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-sky-500'

const pct = (v: number, min: number, max: number) =>
  ((v - min) / (max - min)) * 100

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
  const p = pct(value, min, max)
  return (
    <div className="relative h-6 select-none">
      <style>{RANGE_CSS}</style>
      <div className={TRACK} />
      <div className={FILL} style={{ left: 0, width: `${p}%` }} />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="surfcal-range relative"
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
  const lo = pct(valueMin, min, max)
  const hi = pct(valueMax, min, max)
  // When the band is pushed to the top end, lift the min thumb above the max
  // thumb so it stays grabbable where they crowd together.
  const minOnTop = valueMin > min + (max - min) * 0.75

  return (
    <div className="relative h-6 select-none">
      <style>{RANGE_CSS}</style>
      <div className={TRACK} />
      <div className={FILL} style={{ left: `${lo}%`, width: `${hi - lo}%` }} />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={valueMin}
        aria-label="Minimum"
        onChange={(e) => onChange(Math.min(Number(e.target.value), valueMax), valueMax)}
        className="surfcal-range surfcal-range--overlay"
        style={{ zIndex: minOnTop ? 5 : 3 }}
      />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={valueMax}
        aria-label="Maximum"
        onChange={(e) => onChange(valueMin, Math.max(Number(e.target.value), valueMin))}
        className="surfcal-range surfcal-range--overlay"
        style={{ zIndex: 4 }}
      />
    </div>
  )
}
