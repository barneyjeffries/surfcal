/**
 * Normalised forecast + tide shapes consumed by the rest of SurfCal.
 *
 * Providers map their own API responses INTO these types; nothing downstream
 * (scoring, the iCal route) should ever import a provider's raw response shape.
 *
 * Conventions:
 *  - All directions are degrees (0-360) the swell/wind is coming FROM.
 *  - All times are ISO 8601 strings in UTC.
 *  - A null field means the provider had no value for that hour/event.
 */

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/** One hour of wave + wind forecast. */
export interface ForecastPoint {
  time: string;
  swellHeightM: number | null;
  swellPeriodS: number | null;
  swellDirectionDeg: number | null;
  windSpeedKmh: number | null;
  windDirectionDeg: number | null;
}

/** A tidal turning point. */
export interface TideEvent {
  time: string;
  type: "high" | "low";
  heightM: number | null;
}

export interface ForecastProvider {
  /** Hourly wave + wind forecast for the next `days` days. */
  getForecast(point: GeoPoint, days: number): Promise<ForecastPoint[]>;
}

export interface TideProvider {
  /** High/low tide events for the next `days` days. */
  getTide(point: GeoPoint, days: number): Promise<TideEvent[]>;
}
