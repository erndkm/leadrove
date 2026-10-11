import { contextKey, derivePlaceContext, normalizePhotonFeatures, rankPlaceSuggestions } from '../../shared/place-ranking.mjs';

const RECENT_KEY = 'cf:recent-places';
const abortError = () => new DOMException('Location search cancelled.', 'AbortError');

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const finish = () => { signal?.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(finish, ms);
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(abortError()); };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}

export function browserPlaceContext({ nearby, recentPlaces = [] } = {}) {
  let timeZone;
  try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* Locale hints are optional. */ }
  return derivePlaceContext({ languages: globalThis.navigator?.languages || [globalThis.navigator?.language], timeZone, nearby, recentPlaces });
}

export function readRecentPlaces() {
  try { return derivePlaceContext({ recentPlaces: JSON.parse(globalThis.localStorage?.getItem(RECENT_KEY) || '[]') }).recentPlaces; }
  catch { return []; }
}

export function rememberPlace(place) {
  const previous = readRecentPlaces().filter(item => Math.abs(item.lat - place.lat) > 0.0001 || Math.abs(item.lng - place.lng) > 0.0001);
  const recent = derivePlaceContext({ recentPlaces: [place, ...previous] }).recentPlaces.slice(0, 8);
  try { globalThis.localStorage?.setItem(RECENT_KEY, JSON.stringify(recent)); } catch { /* Suggestions still work without storage. */ }
  return recent;
}

export function createLocationSearchClient({ endpoint = 'https://photon.komoot.io/api/', fetchImpl = (...args) => fetch(...args), minIntervalMs = 700, timeoutMs = 15000, cacheTtlMs = 600000, now = Date.now } = {}) {
  const cache = new Map();
  let nextRequestAt = 0;
  return async function searchLocations(query, { signal, context = browserPlaceContext() } = {}) {
    signal?.throwIfAborted();
    const q = String(query || '').trim().slice(0, 200);
    if (q.length < 2) throw new Error('Enter at least two characters for a town or address.');
    // History changes the ranking, not the request or its candidate cache.
    const key = `${q.toLocaleLowerCase()}:${contextKey({ ...context, recentPlaces: [] })}`;
    const cached = cache.get(key);
    if (cached && now() - cached.fetchedAt < cacheTtlMs) return rankPlaceSuggestions(cached.places, q, context, 6);

    while (now() < nextRequestAt) await delay(nextRequestAt - now(), signal);
    signal?.throwIfAborted();
    nextRequestAt = now() + minIntervalMs;
    const url = new URL(endpoint);
    url.searchParams.set('q', q);
    url.searchParams.set('limit', '20');
    if (context.language) url.searchParams.set('lang', context.language);
    if (context.nearby) {
      url.searchParams.set('lat', String(context.nearby.lat));
      url.searchParams.set('lon', String(context.nearby.lng));
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, timeoutMs);
    try {
      const response = await fetchImpl(url, { signal: controller.signal });
      signal?.throwIfAborted();
      if (!response.ok) throw new Error(response.status === 429
        ? 'Location suggestions are busy. Wait a moment, then try again.'
        : 'Could not load location suggestions. Try again.');
      const json = await response.json();
      signal?.throwIfAborted();
      if (!Array.isArray(json?.features)) throw new Error('The location service returned an incomplete response. Try again.');
      const places = normalizePhotonFeatures(json.features);
      cache.set(key, { places, fetchedAt: now() });
      if (cache.size > 64) cache.delete(cache.keys().next().value);
      return rankPlaceSuggestions(places, q, context, 6);
    } catch (error) {
      if (signal?.aborted) throw abortError();
      if (error.name === 'AbortError') throw new Error('Location suggestions took too long. Try again.');
      if (error instanceof SyntaxError) throw new Error('The location service returned an unreadable response. Try again.');
      if (error instanceof TypeError) throw new Error('Could not reach the location service. Check your connection and try again.');
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  };
}
