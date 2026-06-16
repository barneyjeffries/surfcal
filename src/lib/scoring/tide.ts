import type { TideEvent } from '@/lib/providers/types'

/**
 * Tide state at an arbitrary instant, interpolated from cached high/low extremes.
 *
 * Pure — no DB, no env — so it is unit-testable in isolation.
 *
 * The tide curve between two consecutive extremes is modelled as a half-cosine
 * (smooth at the turning points), matching how tide height actually behaves
 * better than a straight line. See ARCHITECTURE.md "Tide rule".
 */
export interface TideState {
  /** 0 at the surrounding low extreme, 1 at the surrounding high extreme. */
  normHeight: number
  /** Whether the tide is on its way up or down at `t`. */
  direction: 'rising' | 'falling'
  /** Minutes to the nearest high water; negative = before high, positive = after. */
  minutesToHigh: number
}

/**
 * Interpolate the tide state at time `t` from cached extremes.
 *
 * Returns null when `t` falls outside the cached range (no bracketing pair of
 * events), so callers can treat "unknown tide" as a failed constraint.
 */
export function tideStateAt(events: TideEvent[], t: Date): TideState | null {
  const tMs = t.getTime()

  // prev = latest event at or before t; next = earliest event strictly after t.
  let prev: TideEvent | null = null
  let prevMs = -Infinity
  let next: TideEvent | null = null
  let nextMs = Infinity

  for (const e of events) {
    const eMs = new Date(e.time).getTime()
    if (eMs <= tMs) {
      if (eMs > prevMs) {
        prev = e
        prevMs = eMs
      }
    } else if (eMs < nextMs) {
      next = e
      nextMs = eMs
    }
  }

  if (!prev || !next) return null

  const prevH = prev.heightM ?? 0
  const nextH = next.heightM ?? 0

  // Fraction through the prev -> next interval, then the half-cosine height.
  const f = (tMs - prevMs) / (nextMs - prevMs) // 0..1
  const h = prevH + ((nextH - prevH) * (1 - Math.cos(Math.PI * f))) / 2

  // Normalise within this cycle's extremes: 0 at low, 1 at high.
  const lo = Math.min(prevH, nextH)
  const hi = Math.max(prevH, nextH)
  const denom = hi - lo
  const normHeight = denom === 0 ? 0.5 : (h - lo) / denom

  const direction: 'rising' | 'falling' = prev.type === 'low' ? 'rising' : 'falling'
  // Rising means the high is ahead (next); falling means it's behind (prev).
  const nearestHighMs = direction === 'rising' ? nextMs : prevMs
  const minutesToHigh = (tMs - nearestHighMs) / 60000

  return { normHeight, direction, minutesToHigh }
}
