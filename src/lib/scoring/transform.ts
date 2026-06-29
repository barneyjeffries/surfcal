/**
 * Offshore -> spot swell-height transform.
 *
 * Pure, dependency-free. Maps the offshore swell we cache (height, period,
 * direction) to an estimated height AT a spot, using per-spot exposure params.
 * This is the seam between the raw forecast — the source of truth, never mutated
 * in the DB — and scoring.
 *
 * First rung (period-independent): an overall sheltering coefficient times a
 * direction-window falloff. The window is the arc of swell directions that reach
 * the spot; its centre is treated as the spot's "square-on" optimal direction,
 * and the response falls as a cosine to zero at the window edges. Swell from
 * outside the window contributes nothing. A later rung can fold in
 * period-dependent shoaling/refraction behind this same interface.
 */

export interface SpotExposure {
  /** Arc of swell directions (deg the swell comes FROM) that reach the spot.
   *  null min/max = unconstrained (no directional shadowing). */
  windowMinDeg: number | null
  windowMaxDeg: number | null
  /** True when the arc crosses 0/360 (e.g. WNW -> NNE across north). */
  windowWraps: boolean
  /** Overall sheltering scalar, 0..1. */
  exposureCoeff: number
}

export interface OffshoreSwell {
  heightM: number | null
  /** Reserved for the period-dependent rung; unused in the first version. */
  periodS: number | null
  directionDeg: number | null
}

const HALF_PI = Math.PI / 2

/** Minimal circular distance between two bearings, 0..180. */
function angularDistance(a: number, b: number): number {
  const d = Math.abs((((a - b) % 360) + 360) % 360)
  return d > 180 ? 360 - d : d
}

/** Angular span of a (possibly wrapping) arc, in degrees. */
function arcSpan(minDeg: number, maxDeg: number, wraps: boolean): number {
  return wraps ? maxDeg + 360 - minDeg : maxDeg - minDeg
}

/** Centre bearing of a (possibly wrapping) arc. */
function arcCentre(minDeg: number, maxDeg: number, wraps: boolean): number {
  return (((minDeg + arcSpan(minDeg, maxDeg, wraps) / 2) % 360) + 360) % 360
}

/**
 * Directional response, 0..1: 1 when the swell is square-on (the arc centre),
 * tapering as a cosine to 0 at the window edges and beyond. No window set => 1
 * (no attenuation). A null swell direction can't be attenuated => 1.
 */
export function directionalFactor(
  swellDirDeg: number | null,
  exp: SpotExposure,
): number {
  if (exp.windowMinDeg == null || exp.windowMaxDeg == null) return 1
  if (swellDirDeg == null) return 1
  const half = arcSpan(exp.windowMinDeg, exp.windowMaxDeg, exp.windowWraps) / 2
  if (half <= 0) return 0
  const centre = arcCentre(exp.windowMinDeg, exp.windowMaxDeg, exp.windowWraps)
  const d = angularDistance(swellDirDeg, centre)
  const f = Math.cos((d / half) * HALF_PI)
  return f > 0 ? f : 0
}

/**
 * Estimated swell height at the spot. Returns null when offshore height is null,
 * so the scorer treats that hour as failing exactly as before.
 */
export function effectiveSwellHeight(
  swell: OffshoreSwell,
  exp: SpotExposure,
): number | null {
  if (swell.heightM == null) return null
  const coeff = Number.isFinite(exp.exposureCoeff) ? exp.exposureCoeff : 1
  return swell.heightM * coeff * directionalFactor(swell.directionDeg, exp)
}
