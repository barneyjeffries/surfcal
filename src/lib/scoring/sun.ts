// Sunrise / sunset / civil-twilight times via the standard "sunrise equation".
//
// Pure, dependency-free, no network calls. Given a spot's latitude, longitude and
// a date, it returns the relevant solar events as UTC Date objects. We use this to
// keep surf windows within daylight: first light (civil dawn) through to sunset.
//
// Conventions:
//   - latitude:  degrees, north positive
//   - longitude: degrees, EAST positive (so UK spots are negative, e.g. -4.999)
//   - all returned Dates are UTC instants
//
// Event altitudes:
//   - sunrise / sunset:        sun centre at -0.833 deg (refraction + semidiameter)
//                              => zenith 90.833 deg
//   - civil dawn / dusk:       sun centre at -6 deg (first light / last light)
//                              => zenith 96 deg
//
// References: https://en.wikipedia.org/wiki/Sunrise_equation

const DEG = Math.PI / 180;

const ZENITH_OFFICIAL = 90.833; // sunrise / sunset
const ZENITH_CIVIL = 96; // first light / last light

export interface SunTimes {
  firstLight: Date | null; // civil dawn  (sun -6 deg, rising)
  sunrise: Date | null; // sun -0.833 deg, rising
  sunset: Date | null; // sun -0.833 deg, setting
  lastLight: Date | null; // civil dusk  (sun -6 deg, setting)
  // Polar edge cases (never true for UK latitudes, but handled so callers
  // can decide sensibly rather than crashing):
  alwaysLight: boolean; // sun never drops to the civil-dawn angle that day
  alwaysDark: boolean; // sun never reaches the civil-dawn angle that day
}

function fromJulian(j: number): Date {
  return new Date((j - 2440587.5) * 86400000);
}

/**
 * Solar events for the UTC calendar day containing `date`, at the given location.
 */
export function sunTimes(lat: number, lng: number, date: Date): SunTimes {
  // Julian date for the given calendar day at 00:00 UTC.
  const midnightUTC = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  );
  const jDate = midnightUTC / 86400000 + 2440587.5;

  // Days since J2000.0, rounded to the current day.
  const n = Math.round(jDate - 2451545.0 + 0.0008);

  // Mean solar noon (east-positive longitude => + lng/360).
  const Jstar = n + lng / 360;

  // Solar mean anomaly (degrees).
  const M = (357.5291 + 0.98560028 * Jstar) % 360;
  const Mrad = M * DEG;

  // Equation of the centre (degrees).
  const C =
    1.9148 * Math.sin(Mrad) +
    0.02 * Math.sin(2 * Mrad) +
    0.0003 * Math.sin(3 * Mrad);

  // Ecliptic longitude (degrees).
  const lambda = (M + C + 180 + 102.9372) % 360;
  const lambdaRad = lambda * DEG;

  // Solar transit (Julian date of solar noon).
  const Jtransit =
    2451545.0 +
    Jstar +
    0.0053 * Math.sin(Mrad) -
    0.0069 * Math.sin(2 * lambdaRad);

  // Sun's declination.
  const sinDelta = Math.sin(lambdaRad) * Math.sin(23.44 * DEG);
  const cosDelta = Math.cos(Math.asin(sinDelta));

  const latRad = lat * DEG;
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);

  // Returns the Julian date of an event at the given zenith.
  // `rising` true = morning side of noon, false = evening side.
  // Returns null in polar cases (cosOmega out of [-1, 1]).
  function eventJulian(zenithDeg: number, rising: boolean): number | null {
    const cosOmega =
      (Math.cos(zenithDeg * DEG) - sinLat * sinDelta) / (cosLat * cosDelta);
    if (cosOmega > 1 || cosOmega < -1) return null;
    const omega = Math.acos(cosOmega) / DEG; // hour angle in degrees
    return rising ? Jtransit - omega / 360 : Jtransit + omega / 360;
  }

  const firstLightJ = eventJulian(ZENITH_CIVIL, true);
  const sunriseJ = eventJulian(ZENITH_OFFICIAL, true);
  const sunsetJ = eventJulian(ZENITH_OFFICIAL, false);
  const lastLightJ = eventJulian(ZENITH_CIVIL, false);

  // Distinguish polar day from polar night using the noon altitude vs the
  // civil-dawn threshold. cosOmega for civil dawn:
  const cosOmegaCivil =
    (Math.cos(ZENITH_CIVIL * DEG) - sinLat * sinDelta) / (cosLat * cosDelta);
  const alwaysLight = cosOmegaCivil < -1; // sun stays above -6 deg all day
  const alwaysDark = cosOmegaCivil > 1; // sun stays below -6 deg all day

  return {
    firstLight: firstLightJ === null ? null : fromJulian(firstLightJ),
    sunrise: sunriseJ === null ? null : fromJulian(sunriseJ),
    sunset: sunsetJ === null ? null : fromJulian(sunsetJ),
    lastLight: lastLightJ === null ? null : fromJulian(lastLightJ),
    alwaysLight,
    alwaysDark,
  };
}

/**
 * Is `instant` within surfable daylight at this location?
 *
 * Daylight is defined as first light (civil dawn) through to sunset — the window
 * a surfer would actually paddle out in. To use last light (civil dusk) as the
 * evening bound instead, swap `sunset` for `lastLight` below.
 *
 * Sun times are computed for the UTC calendar day of `instant`. That is correct
 * for spots at near-Greenwich longitudes (UK / western Europe), where daylight
 * never straddles the 00:00 UTC boundary. Spots far from the meridian would want
 * the local calendar date instead.
 *
 * Polar fallbacks favour showing windows over hiding them: if the sun never sets
 * (alwaysLight) everything counts as daylight; only a true polar night excludes
 * all hours.
 */
export function isDaylight(lat: number, lng: number, instant: Date): boolean {
  const { firstLight, sunset, alwaysLight, alwaysDark } = sunTimes(
    lat,
    lng,
    instant
  );
  if (alwaysLight) return true;
  if (alwaysDark) return false;
  if (!firstLight || !sunset) return true; // can't determine -> don't hide
  return instant >= firstLight && instant <= sunset;
}
