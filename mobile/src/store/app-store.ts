import { Alert, AppState as NativeAppState, Platform } from "react-native";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import Constants from "expo-constants";
import type {
  AppState,
  Business,
  LeadroveActions,
  LocationSample,
  NearbyLead,
  PlaceSearchOptions,
  SearchPlace,
} from "../types";
import { readLocal, writeLocal } from "../services/persistence";
import { nearbyBusinesses, searchLocations as findLocations } from "../services/business-search";
import { getPlaceSearchContext } from "../services/place-context";
import { notificationsSupported } from '../services/notification-support';
import {
  dayKey,
  mergeEncounters,
  nextMidnight,
  pruneLeads,
  shouldScan,
  validSample,
  uniqueSaved,
} from "../services/discovery-core";

export const LOCATION_TASK = "leadrove-nearby-v1";
const emptySession: AppState["session"] = {
  enabled: false,
  startedAt: null,
  endsAt: null,
  lastScanAt: null,
  lastLocation: null,
  mode: "off",
  error: null,
};
let state: AppState = {
  hydrated: false,
  leads: [],
  settings: {
    radiusMeters: 500,
    minScore: 60,
    category: "all",
    notificationsEnabled: false,
    includeChains: false,
    dailyNotificationLimit: 5,
  },
  session: emptySession,
  discoverResults: [],
  recentPlaces: [],
  searching: false,
  error: null,
  locationPermission: "unknown",
  notificationPermission: "unknown",
};
const listeners = new Set<() => void>();
let counts = { day: dayKey(), notifications: 0, queries: 0 };
let watcher: Location.LocationSubscription | null = null;
let request: AbortController | null = null;
let manualRequest: AbortController | null = null;
let generation = 0;
let starting = false;
let stopping: Promise<void> | null = null;
let scannedLocation: LocationSample | null = null;
let lastAttempt = 0;
let expiryTimer: ReturnType<typeof setTimeout> | null = null;
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
function persist() {
  try {
    writeLocal(
      JSON.stringify({
        leads: state.leads,
        settings: state.settings,
        session: state.session,
        recentPlaces: state.recentPlaces,
        counts,
        scannedLocation,
        lastAttempt,
      }),
    );
  } catch {
    state = {
      ...state,
      error:
        "Changes could not be saved on this device. Check available storage.",
    };
  }
}
function set(patch: Partial<AppState>) {
  state = { ...state, ...patch };
  persist();
  listeners.forEach((fn) => fn());
}
function setSession(patch: Partial<AppState["session"]>) {
  set({ session: { ...state.session, ...patch } });
}
function hydrate() {
  if (state.hydrated) return;
  try {
    const raw = readLocal();
    if (raw) {
      const saved = JSON.parse(raw);
      state = {
        ...state,
        leads: pruneLeads(Array.isArray(saved.leads) ? saved.leads : []),
        settings: { ...state.settings, ...saved.settings },
        session: { ...emptySession, ...saved.session },
        recentPlaces: validRecentPlaces(saved.recentPlaces),
      };
      counts = saved.counts ?? counts;
      scannedLocation = saved.scannedLocation ?? null;
      lastAttempt = saved.lastAttempt ?? 0;
    }
  } catch {
    state = {
      ...state,
      error:
        "Saved data could not be read. New changes will be stored locally.",
    };
  }
  state = { ...state, hydrated: true };
  listeners.forEach((fn) => fn());
}
export const getSnapshot = () => state;
export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function validRecentPlaces(value: unknown): SearchPlace[] {
  if (!Array.isArray(value)) return [];
  return value.filter((place): place is SearchPlace => !!place && typeof place === "object"
    && typeof place.label === "string" && !!place.label.trim() && place.label.length <= 500
    && Number.isFinite(place.latitude) && Math.abs(place.latitude) <= 90
    && Number.isFinite(place.longitude) && Math.abs(place.longitude) <= 180
    && ["id", "name", "city", "district", "county", "state", "country", "countryCode", "kind"]
      .every((key) => place[key] === undefined || typeof place[key] === "string")
    && (place.aliases === undefined || (Array.isArray(place.aliases) && place.aliases.every((alias: unknown) => typeof alias === "string"))))
    .slice(0, 6);
}
async function searchLocations(query: string, options: PlaceSearchOptions = {}) {
  hydrate();
  if (query.trim().length < 2 || options.signal?.aborted) return [];
  const context = options.context ?? await getPlaceSearchContext(state.recentPlaces, state.session.lastLocation);
  if (options.signal?.aborted) return [];
  return findLocations(query, { ...options, context });
}
function dailyCounts() {
  if (counts.day !== dayKey())
    counts = { day: dayKey(), notifications: 0, queries: 0 };
}
function reserveQuery() {
  dailyCounts();
  if (counts.queries >= 80)
    throw new Error(
      "Daily map-search limit reached. Your saved leads are still available.",
    );
  counts.queries++;
  persist();
}
function sampleOf(location: Location.LocationObject): LocationSample {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy: location.coords.accuracy ?? 9999,
    timestamp: location.timestamp,
  };
}
async function foregroundPermission() {
  const result = await Location.requestForegroundPermissionsAsync();
  set({
    locationPermission: result.granted
      ? state.locationPermission === "background"
        ? "background"
        : "foreground"
      : "denied",
  });
  if (!result.granted)
    throw new Error(
      "Location access is off. Enable it in device settings, or search for a place.",
    );
}
async function getCurrentFix(): Promise<Location.LocationObject> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Location.getCurrentPositionAsync({
        // Explicit searches need a precise first fix; ongoing discovery stays balanced.
        accuracy: Location.Accuracy.High,
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error("Location took too long. Move outdoors and try again."),
            ),
          20000,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
async function currentSample() {
  await foregroundPermission();
  const sample = sampleOf(await getCurrentFix());
  if (!validSample(sample, null))
    throw new Error(
      "Waiting for an accurate location. Move outdoors and try again.",
    );
  return sample;
}
async function stopNative() {
  watcher?.remove();
  watcher = null;
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = null;
  if (
    Platform.OS !== "web" &&
    (await TaskManager.isAvailableAsync()) &&
    (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK))
  )
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
}
async function pauseDiscovery() {
  generation++;
  request?.abort();
  request = null;
  manualRequest?.abort();
  manualRequest = null;
  set({
    searching: false,
    session: {
      ...state.session,
      enabled: false,
      mode: "off",
      lastLocation: null,
    },
  });
  scannedLocation = null;
  persist();
  try {
    const pendingStop = stopNative();
    stopping = pendingStop;
    try {
      await pendingStop;
    } finally {
      if (stopping === pendingStop) stopping = null;
    }
  } catch (error) {
    setSession({
      error: `Could not confirm tracking stopped: ${message(error)}. Disable location in device settings if necessary.`,
    });
  }
}
async function expire() {
  if (
    state.session.enabled &&
    (!state.session.endsAt || Date.now() >= state.session.endsAt)
  ) {
    await pauseDiscovery();
    return true;
  }
  return !state.session.enabled;
}
function scheduleExpiry() {
  if (expiryTimer) clearTimeout(expiryTimer);
  if (state.session.enabled && state.session.endsAt)
    expiryTimer = setTimeout(
      () => {
        void expire();
      },
      Math.max(0, state.session.endsAt - Date.now()),
    );
}
async function notify(fresh: NearbyLead[]) {
  const token = generation;
  dailyCounts();
  if (
    !fresh.length ||
    !state.settings.notificationsEnabled ||
    counts.notifications >= state.settings.dailyNotificationLimit ||
    !notificationsSupported()
  )
    return;
  try {
    const Notifications = await import("expo-notifications");
    const permission = await Notifications.getPermissionsAsync();
    if (
      token !== generation ||
      !state.session.enabled ||
      !state.settings.notificationsEnabled ||
      Date.now() >= (state.session.endsAt ?? 0)
    )
      return;
    if (!permission.granted) {
      set({ notificationPermission: "denied" });
      return;
    }
    counts.notifications++;
    persist();
    await Notifications.scheduleNotificationAsync({
      content: {
        title:
          fresh.length === 1
            ? "A new nearby opportunity"
            : `${fresh.length} nearby opportunities`,
        body:
          fresh.length === 1
            ? `${fresh[0].name} · ${fresh[0].reasons[0]}`
            : `${fresh[0].name} and ${fresh.length - 1} more. Review today’s Nearby list.`,
        data: { leadId: fresh[0].id },
        sound: false,
      },
      trigger: null,
    });
  } catch (error) {
    if (token !== generation || !state.session.enabled) return;
    setSession({
      error: `Leads saved, but notification failed: ${message(error)}`,
    });
  }
}
export async function handleLocations(locations: Location.LocationObject[]) {
  hydrate();
  if (await expire()) return;
  // Deferred batches represent samples, not a route. Search only the newest fresh fix.
  const latest = [...locations].sort((a, b) => b.timestamp - a.timestamp)[0];
  if (!latest) return;
  const sample = sampleOf(latest);
  if (!validSample(sample, state.session.lastLocation)) {
    if (sample.accuracy > 100 && Date.now() - sample.timestamp <= 120000) {
      setSession({ error: "Waiting for a more precise location. Enable precise location in device settings or try again outdoors." });
    }
    return;
  }
  const eligible = shouldScan(sample, scannedLocation, lastAttempt);
  setSession({ lastLocation: sample });
  if (!eligible || request) return;
  const token = generation;
  const controller = new AbortController();
  request = controller;
  lastAttempt = Date.now();
  persist();
  try {
    reserveQuery();
    const businesses = await nearbyBusinesses(
      { ...sample, label: "Current location" },
      state.settings,
      controller.signal,
    );
    if (controller.signal.aborted || token !== generation || (await expire()))
      return;
    const merged = mergeEncounters(state.leads, businesses, sample.timestamp);
    scannedLocation = sample;
    set({
      leads: merged.leads,
      session: { ...state.session, lastScanAt: Date.now(), error: null },
    });
    await notify(merged.fresh);
  } catch (error) {
    if (!controller.signal.aborted) setSession({ error: message(error) });
  } finally {
    if (request === controller) request = null;
  }
}
async function watchForeground() {
  watcher?.remove();
  watcher = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: 200,
      timeInterval: 120000,
    },
    (location) => {
      void handleLocations([location]);
    },
    (error) => setSession({ error }),
  );
}
function explainBackground(): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert(
      "Discover while you’re out",
      "Leadrove can check nearby businesses in the background until midnight. Your search area, including location coordinates, is shared with the configured map provider. Only encounters and the latest location are stored on this device. " +
        (Platform.OS === "ios" ? "Choose “Always” for location access to enable this feature." : "Choose “Allow all the time” in Android settings for this feature."),
      [
        {
          text: "Only while open",
          style: "cancel",
          onPress: () => resolve(false),
        },
        { text: "Continue", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
}
async function startDiscovery() {
  hydrate();
  if (starting || state.session.enabled) return;
  starting = true;
  const token = ++generation;
  try {
    if (stopping) await stopping;
    await foregroundPermission();
    if (token !== generation) return;
    let background = false;
    let note: string | null = null;
    if (
      Platform.OS === "web" ||
      Constants.appOwnership === "expo" ||
      !(await TaskManager.isAvailableAsync())
    )
      note =
        "Discovery works while this app is open. Background discovery requires an installed development or production build.";
    else if (await explainBackground()) {
      try {
        const permission = await Location.requestBackgroundPermissionsAsync();
        background = permission.granted;
        if (!background)
          note =
            "Background access was not granted. Discovery works only while the app is open.";
      } catch {
        note =
          "Background access is unavailable. Discovery works only while the app is open.";
      }
    }
    if (token !== generation) return;
    if (background) {
      try {
        await Location.startLocationUpdatesAsync(LOCATION_TASK, {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 200,
          timeInterval: 120000,
          deferredUpdatesInterval: 120000,
          deferredUpdatesDistance: 200,
          pausesUpdatesAutomatically: true,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: "Leadrove discovery is on",
            notificationBody:
              "Finding nearby opportunities until midnight. Open Leadrove to pause.",
            killServiceOnDestroy: true,
          },
        });
      } catch {
        background = false;
        note =
          "Background service could not start. Discovery works only while the app is open.";
      }
    }
    if (token !== generation) {
      await stopNative();
      return;
    }
    set({
      locationPermission: background ? "background" : "foreground",
      session: {
        ...emptySession,
        enabled: true,
        startedAt: Date.now(),
        endsAt: nextMidnight(),
        mode: background ? "background" : "foreground",
        error: note,
      },
    });
    scheduleExpiry();
    if (!background) await watchForeground();
    if (token !== generation) {
      await stopNative();
      return;
    }
    try {
      const first = await getCurrentFix();
      if (token === generation) await handleLocations([first]);
    } catch (error) {
      // Keep the successfully installed watcher; the next fix can recover.
      if (token === generation) setSession({ error: message(error) });
    }
  } catch (error) {
    if (token === generation) {
      await pauseDiscovery();
      setSession({ error: message(error) });
    }
  } finally {
    starting = false;
  }
}
async function searchArea(place: SearchPlace) {
  hydrate();
  // GPS searches pass only coordinates and a generic label; only remember chosen named areas.
  if ((place.id || place.name) && validRecentPlaces([place]).length) {
    const recentPlaces = [place, ...state.recentPlaces.filter((recent) =>
      !(place.id && recent.id === place.id)
      && !(recent.latitude === place.latitude && recent.longitude === place.longitude)
    )].slice(0, 6);
    set({ recentPlaces });
  }
  manualRequest?.abort();
  const controller = new AbortController();
  manualRequest = controller;
  set({ searching: true, error: null, discoverResults: [] });
  try {
    reserveQuery();
    const results = await nearbyBusinesses(
      place,
      state.settings,
      controller.signal,
    );
    if (!controller.signal.aborted) set({ discoverResults: results });
  } catch (error) {
    if (!controller.signal.aborted) set({ error: message(error) });
  } finally {
    if (manualRequest === controller) {
      manualRequest = null;
      set({ searching: false });
    }
  }
}
async function searchNearby() {
  const token = generation;
  manualRequest?.abort();
  set({ searching: true, error: null, discoverResults: [] });
  try {
    const sample = await currentSample();
    if (token === generation) await searchArea({ ...sample, label: "Near me" });
  } catch (error) {
    if (token === generation) set({ error: message(error), searching: false });
  }
}
async function scanNow() {
  const token = generation;
  try {
    if (await expire()) {
      set({
        error:
          "Start today’s discovery first, or use Discover to search without recording encounters.",
      });
      return;
    }
    const sample = await currentSample();
    if (token !== generation || !state.session.enabled) return;
    if (lastAttempt && Date.now() - lastAttempt < 120000) {
      setSession({
        error: "Discovery checks at most every two minutes. Try again shortly.",
      });
      return;
    }
    scannedLocation = null;
    await handleLocations([
      {
        coords: {
          latitude: sample.latitude,
          longitude: sample.longitude,
          accuracy: sample.accuracy,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: sample.timestamp,
      },
    ]);
  } catch (error) {
    if (token === generation) setSession({ error: message(error) });
  }
}
async function updateSettings(patch: Partial<AppState["settings"]>) {
  hydrate();
  if (patch.notificationsEnabled) {
    if (!notificationsSupported()) {
      set({
        notificationPermission: "denied",
        error: "Local alerts require an installed development or production build. They are unavailable in Android Expo Go and web previews.",
      });
      patch = { ...patch, notificationsEnabled: false };
    } else {
      try {
        const Notifications = await import("expo-notifications");
        if (Platform.OS === "android")
          await Notifications.setNotificationChannelAsync("nearby-leads", {
            name: "Nearby opportunities",
            importance: Notifications.AndroidImportance.DEFAULT,
          });
        const permission = await Notifications.requestPermissionsAsync();
        set({
          notificationPermission: permission.granted ? "granted" : "denied",
        });
        if (!permission.granted)
          patch = { ...patch, notificationsEnabled: false };
      } catch (error) {
        set({ error: message(error) });
        patch = { ...patch, notificationsEnabled: false };
      }
    }
  }
  set({
    settings: {
      ...state.settings,
      ...patch,
      radiusMeters: Math.max(
        200,
        Math.min(1500, patch.radiusMeters ?? state.settings.radiusMeters),
      ),
      minScore: Math.max(
        0,
        Math.min(100, patch.minScore ?? state.settings.minScore),
      ),
      dailyNotificationLimit: Math.max(
        0,
        Math.min(
          20,
          patch.dailyNotificationLimit ?? state.settings.dailyNotificationLimit,
        ),
      ),
    },
  });
}
async function toggleSaved(business: Business | NearbyLead) {
  hydrate();
  const existing = state.leads.find((l) => l.id === business.id);
  if (existing)
    set({
      leads: state.leads.map((l) =>
        l.id === business.id ? { ...l, saved: !existing.saved } : l,
      ),
    });
  else
    set({
      leads: [
        ...state.leads,
        {
          ...business,
          firstSeenAt: 0,
          lastSeenAt: 0,
          closestDistanceMeters: business.distanceMeters,
          seenCount: 0,
          saved: true,
          dismissed: false,
          dayKey: "saved",
          notes: "",
        },
      ],
    });
}
export const actions: LeadroveActions = {
  startDiscovery,
  pauseDiscovery,
  scanNow,
  searchNearby,
  searchArea,
  searchLocations,
  updateSettings,
  toggleSaved,
  dismissLead: async (id) =>
    set({
      leads: state.leads.map((l) =>
        l.id === id ? { ...l, dismissed: true } : l,
      ),
    }),
  updateNotes: async (id, notes) =>
    set({
      leads: state.leads.map((l) =>
        l.id === id ? { ...l, notes: notes.slice(0, 10000) } : l,
      ),
    }),
  clearHistory: async () => {
    await pauseDiscovery();
    set({
      leads: uniqueSaved(state.leads).map((l) => ({
        ...l,
        firstSeenAt: 0,
        lastSeenAt: 0,
        seenCount: 0,
        dayKey: "saved",
      })),
      session: emptySession,
      recentPlaces: [],
    });
  },
  clearError: () =>
    set({ error: null, session: { ...state.session, error: null } }),
};
export async function reportBackgroundError(error: unknown) {
  hydrate();
  if (await expire()) return;
  setSession({
    error: `Location updates failed: ${message(error)}. Check device location settings.`,
  });
}
export function initializeApp() {
  hydrate();
  let disposed = false;
  if (notificationsSupported())
    void import("expo-notifications")
      .then((Notifications) => {
        if (disposed) return;
        return Notifications.getPermissionsAsync().then((permission) => {
          if (!disposed)
            set({
              notificationPermission: permission.granted
                ? "granted"
                : permission.canAskAgain
                  ? "unknown"
                  : "denied",
            });
        });
      })
      .catch(() => {});
  async function reconcile() {
    if (disposed || starting) return;
    const token = generation;
    const current = () => !disposed && !starting && token === generation;
    const inactive = await expire();
    if (!current()) return;
    try {
      const foreground = await Location.getForegroundPermissionsAsync();
      if (!current()) return;
      if (!foreground.granted) {
        if (inactive) {
          set({
            locationPermission: foreground.canAskAgain ? "unknown" : "denied",
          });
          return;
        }
        await pauseDiscovery();
        set({ locationPermission: "denied" });
        setSession({
          error:
            "Location permission changed. Enable access to restart discovery.",
        });
        return;
      }
      if (inactive) {
        const background =
          Platform.OS === "web"
            ? null
            : await Location.getBackgroundPermissionsAsync();
        if (!current()) return;
        set({
          locationPermission: background?.granted ? "background" : "foreground",
        });
        return;
      }
      if (state.session.mode === "background" && Platform.OS !== "web") {
        const background = await Location.getBackgroundPermissionsAsync();
        if (!current()) return;
        const registered =
          await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
        if (!current()) return;
        if (!background.granted || !registered) {
          await pauseDiscovery();
          setSession({
            error:
              "Discovery stopped while the app was closed. Start again to continue today.",
          });
          return;
        }
        set({ locationPermission: "background" });
      } else if (!watcher) {
        await pauseDiscovery();
        setSession({
          error:
            "Foreground discovery ended when the app closed. Start again to continue.",
        });
        return;
      }
      scheduleExpiry();
    } catch (error) {
      if (!current()) return;
      await pauseDiscovery();
      setSession({ error: message(error) });
    }
  }
  void reconcile();
  const sub = NativeAppState.addEventListener("change", (next) => {
    if (next === "active") {
      set({ leads: pruneLeads(state.leads) });
      void reconcile();
    } else if (next === "background" && state.session.mode === "foreground") {
      void pauseDiscovery();
    }
  });
  return () => {
    disposed = true;
    sub.remove();
    watcher?.remove();
    watcher = null;
    manualRequest?.abort();
    if (state.session.mode === "foreground") void pauseDiscovery();
    if (expiryTimer) clearTimeout(expiryTimer);
  };
}
