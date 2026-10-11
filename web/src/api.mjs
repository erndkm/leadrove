import { normalizeBusinesses } from './model.mjs';
import { createLocationSearchClient } from './location-search.mjs';
export const DEFAULT_CENTER = { lat: 52.5295, lng: 13.401, label: 'Berlin Mitte, Germany' };
const PHOTON = import.meta.env?.VITE_GEOCODER_URL || 'https://photon.komoot.io/api/';
const cache = new Map();
export function readStored(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
export function writeStored(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }
export const searchLocations = createLocationSearchClient({ endpoint: PHOTON });
export async function searchBusinesses(center, radius, request) {
  if (![center.lat, center.lng, radius].every(Number.isFinite) || Math.abs(center.lat) > 90 || Math.abs(center.lng) > 180 || radius < 0.5 || radius > 10) throw new Error('Choose a valid location and a radius between 0.5 and 10 km.');
  const key = `${center.lat.toFixed(5)},${center.lng.toFixed(5)},${radius}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < 300000) return cached;
  if (typeof request !== 'function') throw new Error('Refresh the app to connect to its local map service.');
  const data = await request('/map/search', { center: { lat: center.lat, lng: center.lng }, radius });
  const fetchedAt = Number.isFinite(data.fetchedAt) ? data.fetchedAt : Date.now();
  const result = { businesses: normalizeBusinesses(data.elements, center, radius).map(b => ({ ...b, fetchedAt, searchLocation: center.label })), center, radius, fetchedAt };
  cache.set(key, result); return result;
}
