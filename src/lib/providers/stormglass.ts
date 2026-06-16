import type {
  ForecastPoint,
  TideEvent,
  ForecastProvider,
  TideProvider,
  GeoPoint,
} from "./types";

/**
 * Stormglass implementation of both providers.
 *
 * SERVER-ONLY: reads STORMGLASS_API_KEY and must never run in a client component.
 *
 * Stormglass returns one /weather/point call for swell + wind, and a separate
 * /tide/extremes/point call for tide. Each weather parameter comes back as an
 * object keyed by data source (e.g. { sg: 1.2, noaa: 1.1 }); we request
 * source=sg, Stormglass's aggregated value.
 */

const BASE = "https://api.stormglass.io/v2";
const MS_PER_DAY = 86_400_000;

type SgValue = Record<string, number>;

interface SgWeatherHour {
  time: string;
  swellHeight?: SgValue;
  swellPeriod?: SgValue;
  swellDirection?: SgValue;
  waveHeight?: SgValue;
  windSpeed?: SgValue;
  windDirection?: SgValue;
}
interface SgWeatherResponse {
  hours?: SgWeatherHour[];
}
interface SgTideExtreme {
  time: string;
  type: string;
  height?: number;
}
interface SgTideResponse {
  data?: SgTideExtreme[];
}

function apiKey(): string {
  const key = process.env.STORMGLASS_API_KEY;
  if (!key) throw new Error("STORMGLASS_API_KEY is not set");
  return key;
}

async function sgFetch<T>(
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: apiKey() } });
  if (!res.ok) {
    throw new Error(`Stormglass ${path} ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

/** Prefer the aggregated 'sg' value; fall back to the first source present. */
function pick(value: SgValue | undefined): number | null {
  if (!value) return null;
  if (typeof value.sg === "number") return value.sg;
  const first = Object.values(value)[0];
  return typeof first === "number" ? first : null;
}

function range(days: number): { start: string; end: string } {
  const now = Date.now();
  return {
    start: new Date(now).toISOString(),
    end: new Date(now + days * MS_PER_DAY).toISOString(),
  };
}

export class StormglassProvider implements ForecastProvider, TideProvider {
  async getForecast(point: GeoPoint, days: number): Promise<ForecastPoint[]> {
    const { start, end } = range(days);
    const data = await sgFetch<SgWeatherResponse>("/weather/point", {
      lat: String(point.latitude),
      lng: String(point.longitude),
      params:
        "swellHeight,swellPeriod,swellDirection,waveHeight,windSpeed,windDirection",
      source: "sg",
      start,
      end,
    });
    return (data.hours ?? []).map((h): ForecastPoint => {
      const windMs = pick(h.windSpeed); // Stormglass wind speed is m/s
      return {
        time: h.time,
        // Prefer the swell partition; fall back to total significant wave height.
        swellHeightM: pick(h.swellHeight) ?? pick(h.waveHeight),
        swellPeriodS: pick(h.swellPeriod),
        swellDirectionDeg: pick(h.swellDirection),
        windSpeedKmh: windMs === null ? null : Math.round(windMs * 36) / 10,
        windDirectionDeg: pick(h.windDirection),
      };
    });
  }

  async getTide(point: GeoPoint, days: number): Promise<TideEvent[]> {
    const { start, end } = range(days);
    const data = await sgFetch<SgTideResponse>("/tide/extremes/point", {
      lat: String(point.latitude),
      lng: String(point.longitude),
      start,
      end,
    });
    return (data.data ?? []).map((e): TideEvent => ({
      time: e.time,
      type: e.type === "high" ? "high" : "low",
      heightM: typeof e.height === "number" ? e.height : null,
    }));
  }
}
