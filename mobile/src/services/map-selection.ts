import type { SearchPlace } from '../types';

export type Coordinate = { latitude: number; longitude: number };
export type MapMessage =
  | { type: 'select'; coordinate: Coordinate }
  | { type: 'ready' | 'tile-error' | 'tiles-loaded' | 'attribution' | 'cancel' };

export function validCoordinate(value: unknown): value is Coordinate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const coordinate = value as Coordinate;
  return Number.isFinite(coordinate.latitude) && Math.abs(coordinate.latitude) <= 90
    && Number.isFinite(coordinate.longitude) && Math.abs(coordinate.longitude) <= 180;
}

export function mapPlace(coordinate: Coordinate): SearchPlace {
  if (!validCoordinate(coordinate)) throw new RangeError('Choose a valid point on the map.');
  const { latitude, longitude } = coordinate;
  return {
    latitude,
    longitude,
    id: `map:${latitude.toFixed(6)},${longitude.toFixed(6)}`,
    name: 'Map location',
    label: `Map location · ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
  };
}

export function readMapMessage(raw: unknown): MapMessage | null {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    if (raw.length > 4096) return null;
    try { value = JSON.parse(raw); } catch { return null; }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const message = value as Record<string, unknown>;
  if (message.type === 'select') {
    if (Object.keys(message).some((key) => key !== 'type' && key !== 'coordinate')
      || !validCoordinate(message.coordinate)
      || Object.keys(message.coordinate).some((key) => key !== 'latitude' && key !== 'longitude')) return null;
    return { type: 'select', coordinate: { latitude: message.coordinate.latitude, longitude: message.coordinate.longitude } };
  }
  if (Object.keys(message).length !== 1) return null;
  switch (message.type) {
    case 'ready': case 'tile-error': case 'tiles-loaded': case 'attribution': case 'cancel':
      return { type: message.type };
    default:
      return null;
  }
}
