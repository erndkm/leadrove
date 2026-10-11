export interface PlaceCoordinates { lat: number; lng: number }
export interface PlaceSuggestion extends PlaceCoordinates {
  id: string;
  label: string;
  name: string;
  region: string;
  city: string;
  district: string;
  county: string;
  state: string;
  country: string;
  countryCode: string;
  kind: string;
  aliases: string[];
  street: string;
  housenumber: string;
  postcode: string;
}
export interface PlaceContext {
  language?: string;
  countryCodes: string[];
  nearby?: PlaceCoordinates;
  recentPlaces: PlaceSuggestion[];
}
export interface PlaceContextInput {
  languages?: string | string[];
  timeZone?: string;
  regionCode?: string;
  countryCodes?: string[];
  nearby?: PlaceCoordinates | { latitude: number; longitude: number } | null;
  recentPlaces?: unknown[];
}
export function normalizePlaceText(value: unknown): string;
export function normalizePhotonFeatures(features: unknown): PlaceSuggestion[];
export function derivePlaceContext(input?: PlaceContextInput): PlaceContext;
export function contextKey(context?: Partial<PlaceContext>): string;
export function rankPlaceSuggestions(places: PlaceSuggestion[], query: string, context?: Partial<PlaceContext>, limit?: number): PlaceSuggestion[];
