/** Display units. Storage is always metric (metres, km/h); these only affect UI. */
export type Unit = 'metric' | 'imperial'

export const UNITS_STORAGE_KEY = 'surfcal-units'

export const M_TO_FT = 3.28084
export const KMH_TO_MPH = 0.621371

export const heightUnitLabel = (u: Unit) => (u === 'imperial' ? 'ft' : 'm')
export const windUnitLabel = (u: Unit) => (u === 'imperial' ? 'mph' : 'km/h')

/** One height value, with unit suffix. */
export function formatHeight(m: number, unit: Unit): string {
  return unit === 'imperial'
    ? `${(m * M_TO_FT).toFixed(1)} ft`
    : `${m.toFixed(1)} m`
}

/** A height range "a–b unit" (suffix once). */
export function formatHeightRange(min: number, max: number, unit: Unit): string {
  return unit === 'imperial'
    ? `${(min * M_TO_FT).toFixed(1)}–${(max * M_TO_FT).toFixed(1)} ft`
    : `${min.toFixed(1)}–${max.toFixed(1)} m`
}

/** One wind speed value, with unit suffix. */
export function formatWind(kmh: number, unit: Unit): string {
  return unit === 'imperial'
    ? `${Math.round(kmh * KMH_TO_MPH)} mph`
    : `${Math.round(kmh)} km/h`
}

/** A wind range "a–b unit" (suffix once). */
export function formatWindRange(minKmh: number, maxKmh: number, unit: Unit): string {
  return unit === 'imperial'
    ? `${Math.round(minKmh * KMH_TO_MPH)}–${Math.round(maxKmh * KMH_TO_MPH)} mph`
    : `${Math.round(minKmh)}–${Math.round(maxKmh)} km/h`
}
