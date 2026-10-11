import type { Business, DiscoverySettings, PlaceSearchOptions, SearchPlace } from "../types";
import {
  contextKey,
  derivePlaceContext,
  normalizePhotonFeatures,
  rankPlaceSuggestions,
} from "../../../shared/place-ranking.mjs";
import {
  categoryFor,
  distance,
  matches,
  kindLabel,
  isClosed,
  isNoncommercial,
  scoreBusiness,
} from "./discovery-core";
import { createOverpassClient, DEFAULT_OVERPASS_ENDPOINTS } from "../../../shared/overpass.mjs";
const queryOverpass = createOverpassClient({
  endpoints: process.env.EXPO_PUBLIC_OVERPASS_URL?.trim()
    ? [process.env.EXPO_PUBLIC_OVERPASS_URL.trim()]
    : DEFAULT_OVERPASS_ENDPOINTS,
  method: "POST",
  timeoutMs: 25000,
  headers: process.env.EXPO_OS === "web" ? {} : {
    "User-Agent": "Leadrove-Mobile/1.0 (nearby business discovery)",
  },
});
const businessCache = new Map<string, { expiresAt: number; elements: unknown[] }>();
let cooldownUntil = 0;
let requesting = false;
export async function nearbyBusinesses(
  place: SearchPlace,
  settings: DiscoverySettings,
  signal: AbortSignal,
): Promise<Business[]> {
  if (signal.aborted) throw cancelledPlaceSearch();
  if (!Number.isFinite(place.latitude) || Math.abs(place.latitude) > 90 ||
      !Number.isFinite(place.longitude) || Math.abs(place.longitude) > 180 ||
      !Number.isFinite(settings.radiusMeters))
    throw new Error("Choose a valid location and search radius.");
  const radius = Math.max(200, Math.min(1500, settings.radiusMeters));
  const cacheKey = `${place.latitude},${place.longitude},${radius}`;
  const cached = businessCache.get(cacheKey);
  let data = cached && cached.expiresAt > Date.now() ? cached : null;
  if (!data && (requesting || Date.now() < cooldownUntil))
    throw new Error("Search is cooling down. Please try again in a minute.");
  let ownsRequest = false;
  try {
    if (!data) {
      requesting = ownsRequest = true;
      cooldownUntil = Date.now() + 30000;
      const around = `(around:${radius},${place.latitude},${place.longitude})`;
      const query = `[out:json][timeout:20][maxsize:33554432];(nwr${around}[name][shop];nwr${around}[name][craft];nwr${around}[name][office];nwr${around}[name][amenity~"^(restaurant|cafe|bar|pub|fast_food|doctors|dentist|pharmacy|clinic|veterinary)$"];nwr${around}[name][tourism~"^(hotel|guest_house|hostel)$"];);out center tags 250;`;
      const response = await queryOverpass(query, signal);
      if (signal.aborted) throw cancelledPlaceSearch();
      data = { expiresAt: Date.now() + 5 * 60 * 1000, elements: response.elements.slice(0, 250) };
      businessCache.set(cacheKey, data);
      if (businessCache.size > 12) businessCache.delete(businessCache.keys().next().value!);
    }
    return data.elements
      .flatMap((e: any): Business[] => {
        if (
          !e ||
          !["node", "way", "relation"].includes(e.type) ||
          !Number.isSafeInteger(e.id) || e.id <= 0 ||
          !e.tags ||
          typeof e.tags !== "object"
        )
          return [];
        const t: Record<string, string> = Object.fromEntries(
          Object.entries(e.tags).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ).map(([key, value]) => [key, value.trim()]),
        );
        if (isClosed(t) || isNoncommercial(t)) return [];
        const latitude = e.lat ?? e.center?.lat;
        const longitude = e.lon ?? e.center?.lon;
        if (
          !t.name ||
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude) ||
          Math.abs(latitude) > 90 || Math.abs(longitude) > 180
        )
          return [];
        const distanceMeters = Math.round(
          distance(place, { latitude, longitude }),
        );
        if (distanceMeters > radius) return [];
        const business: Business = {
          id: `${e.type}/${e.id}`,
          name: t.name,
          kind: kindLabel(t),
          category: categoryFor(t),
          latitude,
          longitude,
          address: [t["addr:street"], t["addr:housenumber"], t["addr:city"]]
            .filter(Boolean)
            .join(" "),
          phone: t.phone || t["contact:phone"] || "",
          email: t.email || t["contact:email"] || "",
          sourceUrl: `https://www.openstreetmap.org/${e.type}/${e.id}`,
          distanceMeters,
          ...scoreBusiness(t),
        };
        return matches(business, settings) ? [business] : [];
      })
      .sort(
        (a: Business, b: Business) =>
          b.score - a.score || a.distanceMeters - b.distanceMeters,
      );
  } finally {
    if (ownsRequest) requesting = false;
  }
}
let placeController: AbortController | null = null;
let nextPlaceRequestAt = 0;
const placeCache = new Map<string, { expiresAt: number; places: SearchPlace[] }>();
function cancelledPlaceSearch() {
  const error = new Error("Place search cancelled.");
  error.name = "AbortError";
  return error;
}
export async function searchLocations(
  query: string,
  options: PlaceSearchOptions = {},
): Promise<SearchPlace[]> {
  placeController?.abort();
  placeController = null;
  const text = query.trim().replace(/\s+/g, " ").slice(0, 120);
  if (options.signal?.aborted) throw cancelledPlaceSearch();
  if (text.length < 2) return [];
  const nearby = options.context?.nearby ?? options.context?.recentPlaces?.[0];
  const context = derivePlaceContext({
    ...options.context,
    regionCode: options.context?.regionCode ?? undefined,
    timeZone: options.context?.timeZone ?? undefined,
    nearby: nearby ? {
      lat: nearby.latitude,
      lng: nearby.longitude,
    } : undefined,
  });
  const cacheKey = `${text.toLowerCase()}|${contextKey(context)}`;
  const cached = placeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.places;
  const controller = new AbortController();
  placeController = controller;
  const cancel = () => controller.abort();
  options.signal?.addEventListener("abort", cancel);
  if (options.signal?.aborted) cancel();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const params = new URLSearchParams({ q: text, limit: "20" });
    if (context.language) params.set("lang", context.language);
    if (context.nearby) {
      params.set("lat", String(context.nearby.lat));
      params.set("lon", String(context.nearby.lng));
    }
    // One provider start per 700 ms; a new query aborts both queued and running work.
    const delay = Math.min(700, nextPlaceRequestAt - Date.now());
    if (delay > 0) await new Promise<void>((resolve, reject) => {
      const stop = () => {
        clearTimeout(wait);
        controller.signal.removeEventListener("abort", stop);
        reject(cancelledPlaceSearch());
      };
      const wait = setTimeout(() => {
        controller.signal.removeEventListener("abort", stop);
        resolve();
      }, delay);
      controller.signal.addEventListener("abort", stop);
      if (controller.signal.aborted) stop();
    });
    if (controller.signal.aborted) throw cancelledPlaceSearch();
    nextPlaceRequestAt = Date.now() + 700;
    const response = await fetch(
      `https://photon.komoot.io/api/?${params.toString()}`,
      {
        signal: controller.signal,
        headers: process.env.EXPO_OS === "web" ? undefined : {
          "User-Agent": "Leadrove-Mobile/1.0 (place search)",
        },
      },
    );
    if (controller.signal.aborted) throw cancelledPlaceSearch();
    if (!response.ok)
      throw new Error("Place search is unavailable. Try again shortly.");
    const data = await response.json();
    if (controller.signal.aborted) throw cancelledPlaceSearch();
    if (!data || !Array.isArray(data.features))
      throw new Error("Place search returned an invalid response. Try again shortly.");
    const places = rankPlaceSuggestions(normalizePhotonFeatures(data.features), text, context)
      .slice(0, 6)
      .map(({ lat, lng, ...place }): SearchPlace => ({ ...place, latitude: lat, longitude: lng }));
    placeCache.set(cacheKey, { expiresAt: Date.now() + 5 * 60 * 1000, places });
    if (placeCache.size > 40) placeCache.delete(placeCache.keys().next().value!);
    return places;
  } catch (error) {
    if (controller.signal.aborted) {
      if (options.signal?.aborted || placeController !== controller) throw cancelledPlaceSearch();
      throw new Error("Place search timed out. Check your connection and try again.");
    }
    if (error instanceof TypeError)
      throw new Error("Could not reach place search. Check your connection and try again.");
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
    if (placeController === controller) placeController = null;
  }
}
