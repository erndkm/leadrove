export type BusinessCategory = 'beauty' | 'trades' | 'food' | 'health' | 'retail' | 'professional' | 'hospitality';
export type Business = {
  id: string; name: string; kind: string; category: BusinessCategory;
  latitude: number; longitude: number; address: string;
  website: string; websiteStatus: 'missing' | 'social' | 'website';
  phone: string; email: string; chain: boolean; sourceUrl: string;
  score: number; reasons: string[]; distanceMeters: number;
};
export type NearbyLead = Business & {
  firstSeenAt: number; lastSeenAt: number; closestDistanceMeters: number;
  seenCount: number; saved: boolean; dismissed: boolean; dayKey: string;
  notes: string;
};
export type DiscoverySettings = {
  radiusMeters: number; minScore: number; category: BusinessCategory | 'all';
  notificationsEnabled: boolean; includeChains: boolean; dailyNotificationLimit: number;
};
export type LocationSample = { latitude: number; longitude: number; accuracy: number; timestamp: number };
export type DiscoverySession = {
  enabled: boolean; startedAt: number | null; endsAt: number | null;
  lastScanAt: number | null; lastLocation: LocationSample | null;
  mode: 'off' | 'foreground' | 'background'; error: string | null;
};
export type SearchPlace = {
  latitude: number; longitude: number; label: string;
  id?: string; name?: string; city?: string; district?: string; county?: string;
  state?: string; country?: string; countryCode?: string; kind?: string; aliases?: string[];
};
export type PlaceSearchContext = {
  languages?: string[]; regionCode?: string | null; timeZone?: string | null;
  nearby?: { latitude: number; longitude: number } | null;
  recentPlaces?: SearchPlace[];
};
export type PlaceSearchOptions = { context?: PlaceSearchContext; signal?: AbortSignal };
export type AppState = {
  hydrated: boolean; leads: NearbyLead[]; settings: DiscoverySettings; session: DiscoverySession;
  discoverResults: Business[]; recentPlaces: SearchPlace[]; searching: boolean; error: string | null;
  locationPermission: 'unknown' | 'denied' | 'foreground' | 'background';
  notificationPermission: 'unknown' | 'denied' | 'granted';
};
export type LeadroveActions = {
  startDiscovery: () => Promise<void>; pauseDiscovery: () => Promise<void>;
  scanNow: () => Promise<void>; searchNearby: () => Promise<void>;
  searchArea: (place: SearchPlace) => Promise<void>;
  searchLocations: (query: string, options?: PlaceSearchOptions) => Promise<SearchPlace[]>;
  updateSettings: (patch: Partial<DiscoverySettings>) => Promise<void>;
  toggleSaved: (business: Business | NearbyLead) => Promise<void>;
  dismissLead: (id: string) => Promise<void>;
  updateNotes: (id: string, notes: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  clearError: () => void;
};
