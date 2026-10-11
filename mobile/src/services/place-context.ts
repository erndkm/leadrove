import { getCalendars, getLocales } from 'expo-localization';
import * as Location from 'expo-location';
import type { LocationSample, PlaceSearchContext, SearchPlace } from '../types';

const MAX_LOCATION_AGE = 30 * 60 * 1000;
let lastKnown: LocationSample | null = null;
let checkedAt = 0;
let pending: Promise<LocationSample | null> | null = null;

function usable(sample: LocationSample | null) {
  return sample && Number.isFinite(sample.latitude) && Number.isFinite(sample.longitude)
    && Math.abs(sample.latitude) <= 90 && Math.abs(sample.longitude) <= 180
    && sample.accuracy <= 10000 && Date.now() - sample.timestamp <= MAX_LOCATION_AGE
    && sample.timestamp <= Date.now() + 60000;
}

async function permittedLastLocation(sessionLocation: LocationSample | null): Promise<LocationSample | null> {
  // Reading an existing permission/cache never opens a permission dialog or starts GPS.
  const permission = await Location.getForegroundPermissionsAsync();
  if (!permission.granted) {
    lastKnown = null;
    return null;
  }
  if (usable(sessionLocation)) return sessionLocation;
  if (pending) return pending;
  if (Date.now() - checkedAt < 60000) return usable(lastKnown) ? lastKnown : null;
  if (!pending) {
    checkedAt = Date.now();
    pending = Location.getLastKnownPositionAsync({
      maxAge: MAX_LOCATION_AGE,
      requiredAccuracy: 10000,
    }).then((location) => {
      lastKnown = location ? {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy ?? Infinity,
        timestamp: location.timestamp,
      } : null;
      return usable(lastKnown) ? lastKnown : null;
    }).catch(() => null).finally(() => { pending = null; });
  }
  return pending;
}

export async function getPlaceSearchContext(
  recentPlaces: SearchPlace[],
  sessionLocation: LocationSample | null,
): Promise<PlaceSearchContext> {
  let languages: string[] = [];
  let regionCode: string | null = null;
  let timeZone: string | null = null;
  try {
    const locales = getLocales();
    languages = locales.map((locale) => locale.languageTag);
    regionCode = locales[0]?.regionCode ?? null;
    timeZone = getCalendars()[0]?.timeZone ?? null;
  } catch {
    // Intl remains available in native runtimes if locale metadata is unavailable.
    try {
      const locale = Intl.DateTimeFormat().resolvedOptions();
      languages = [locale.locale];
      timeZone = locale.timeZone;
    } catch { /* The provider can return local place names without a language hint. */ }
  }

  let nearby: LocationSample | null = null;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    // Locale-only suggestions still work when the OS location cache is slow.
    nearby = await Promise.race([
      permittedLastLocation(sessionLocation),
      new Promise<null>((resolve) => { timeout = setTimeout(() => resolve(null), 400); }),
    ]);
  } catch { /* Existing location access is optional for city suggestions. */ }
  finally { if (timeout) clearTimeout(timeout); }

  return { languages, regionCode, timeZone, nearby, recentPlaces };
}
