/// <reference types="node" />
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as core from "../src/services/discovery-core";
import type { Business, PlaceSearchContext, SearchPlace } from "../src/types";

// Execute the actual store against native boundaries. No location, network,
// notification, or SQLite native code runs in these integration tests.
const compiled = ts.transpileModule(
  readFileSync(new URL("../src/store/app-store.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  },
).outputText;
const permission = { granted: true, canAskAgain: true };
const business: Business = {
  id: "node/42",
  name: "Test salon",
  kind: "Hair salon",
  category: "beauty",
  latitude: 52.5,
  longitude: 13.4,
  address: "",
  website: "",
  websiteStatus: "missing",
  phone: "",
  email: "",
  chain: false,
  sourceUrl: "https://www.openstreetmap.org/node/42",
  score: 75,
  reasons: ["No website listed"],
  distanceMeters: 25,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}
async function flush() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}
function harness(
  options: {
    persisted?: object;
    search?: (...args: any[]) => Promise<Business[]>;
    getPermission?: () => Promise<any>;
    notificationPermission?: () => Promise<any>;
    fix?: () => Promise<any>;
    expoGo?: boolean;
    placeSearch?: (...args: any[]) => Promise<SearchPlace[]>;
    placeContext?: () => Promise<PlaceSearchContext>;
  } = {},
) {
  let stopped = 0,
    removed = 0,
    notifications = 0;
  let saved = "";
  const fix = () => ({
    coords: { latitude: 52.5, longitude: 13.4, accuracy: 10, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
    timestamp: Date.now(),
  });
  const native = {
    Accuracy: { Balanced: 3, High: 4 },
    requestForegroundPermissionsAsync: async () => permission,
    getForegroundPermissionsAsync:
      options.getPermission ?? (async () => permission),
    getBackgroundPermissionsAsync: async () => permission,
    getCurrentPositionAsync: options.fix ?? (async () => fix()),
    watchPositionAsync: async () => ({ remove: () => removed++ }),
    hasStartedLocationUpdatesAsync: async () => true,
    stopLocationUpdatesAsync: async () => {
      stopped++;
    },
  };
  const modules: Record<string, unknown> = {
    "react-native": {
      Platform: { OS: "android" },
      Alert: { alert: (_title: string, _message: string, buttons: {onPress: () => void}[]) => buttons[0].onPress() },
      AppState: { addEventListener: () => ({ remove: () => {} }) },
    },
    "expo-location": native,
    "expo-task-manager": { isAvailableAsync: async () => true },
    "expo-constants": { appOwnership: options.expoGo ? "expo" : "standalone" },
    "../services/notification-support": { notificationsSupported: () => !options.expoGo },
    "expo-notifications": {
      getPermissionsAsync:
        options.notificationPermission ?? (async () => permission),
      requestPermissionsAsync: async () => permission,
      setNotificationChannelAsync: async () => {},
      AndroidImportance: { DEFAULT: 3 },
      scheduleNotificationAsync: async () => {
        notifications++;
        return "notification-1";
      },
    },
    "../services/persistence": {
      readLocal: () =>
        options.persisted ? JSON.stringify(options.persisted) : null,
      writeLocal: (value: string) => {
        saved = value;
      },
    },
    "../services/business-search": {
      nearbyBusinesses: options.search ?? (async () => [business]),
      searchLocations: options.placeSearch ?? (async () => []),
    },
    "../services/place-context": {
      getPlaceSearchContext: options.placeContext ?? (async (recentPlaces: SearchPlace[]) => ({ recentPlaces, languages: ['de-DE'] })),
    },
    "../services/discovery-core": core,
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)(
    (name: string) => {
      if (options.expoGo && name === 'expo-notifications') throw new Error('Expo Go notification module must never load');
      if (!(name in modules)) throw new Error(`Unexpected dependency ${name}`);
      return modules[name];
    },
    module,
    module.exports,
  );
  const store = module.exports as typeof import("../src/store/app-store");
  return {
    store,
    fix,
    get stopped() {
      return stopped;
    },
    get removed() {
      return removed;
    },
    get notifications() {
      return notifications;
    },
    get persisted() {
      return saved;
    },
  };
}
function active(endsAt = Date.now() + 3600000) {
  return {
    session: {
      enabled: true,
      mode: "background",
      startedAt: Date.now() - 1000,
      endsAt,
      lastScanAt: null,
      lastLocation: null,
      error: null,
    },
    settings: { notificationsEnabled: true },
  };
}

test("an approximate location explains recovery without searching or recording a lead", async () => {
  const h = harness({ persisted: active() });
  const fix = h.fix();
  fix.coords.accuracy = 1500;
  await h.store.handleLocations([fix]);
  assert.match(h.store.getSnapshot().session.error ?? "", /precise location/);
  assert.equal(h.store.getSnapshot().leads.length, 0);
  assert.equal(h.notifications, 0);
  await h.store.actions.pauseDiscovery();
});

test("Pause aborts the running map request and ignores a provider that resolves after cancellation", async () => {
  const response = deferred<Business[]>();
  let signal: AbortSignal | undefined;
  const h = harness({
    persisted: active(),
    search: async (_place, _settings, requestSignal) => {
      signal = requestSignal;
      return response.promise;
    },
  });
  const scan = h.store.handleLocations([h.fix()]);
  await flush();
  assert.ok(signal);
  await h.store.actions.pauseDiscovery();
  assert.equal(signal!.aborted, true);
  response.resolve([business]);
  await scan;
  assert.equal(h.store.getSnapshot().leads.length, 0);
  assert.equal(h.store.getSnapshot().session.enabled, false);
  assert.equal(h.stopped, 1);
  assert.equal(h.notifications, 0);
});
test("Pause during notification permission lookup prevents a late notification", async () => {
  const permissionRead = deferred<typeof permission>();
  const h = harness({
    persisted: active(),
    notificationPermission: () => permissionRead.promise,
  });
  const scan = h.store.handleLocations([h.fix()]);
  await flush();
  assert.equal(h.store.getSnapshot().leads.length, 1);
  await h.store.actions.pauseDiscovery();
  permissionRead.resolve(permission);
  await scan;
  assert.equal(h.notifications, 0);
});
test("an expired background callback stops native updates without collecting or notifying", async () => {
  const h = harness({ persisted: active(Date.now() - 1) });
  await h.store.reportBackgroundError(new Error("Delayed native callback"));
  assert.equal(h.store.getSnapshot().session.enabled, false);
  assert.equal(h.stopped, 1);
  assert.equal(h.notifications, 0);
  assert.equal(h.store.getSnapshot().leads.length, 0);
});
test("denied notification permission saves the lead and reports denial without sending", async () => {
  const h = harness({
    persisted: active(),
    notificationPermission: async () => ({
      granted: false,
      canAskAgain: false,
    }),
  });
  await h.store.handleLocations([h.fix()]);
  assert.equal(h.store.getSnapshot().notificationPermission, "denied");
  assert.equal(h.store.getSnapshot().leads.length, 1);
  assert.equal(h.notifications, 0);
  await h.store.actions.pauseDiscovery();
});
test("a previously saved business on another day is an encounter, not a new-lead notification", async () => {
  const old = core.mergeEncounters([], [business], Date.now() - 86400000)
    .leads[0];
  old.saved = true;
  const h = harness({ persisted: { ...active(), leads: [old] } });
  await h.store.handleLocations([h.fix()]);
  assert.equal(h.store.getSnapshot().leads.length, 2);
  assert.equal(h.notifications, 0);
  await h.store.actions.pauseDiscovery();
});
test("stale resume permission results cannot pause a newly enabled session", async () => {
  const oldPermission = deferred<any>();
  const h = harness({ getPermission: () => oldPermission.promise });
  const cleanup = h.store.initializeApp();
  await flush();
  await h.store.actions.startDiscovery();
  oldPermission.resolve({ granted: false, canAskAgain: false });
  await flush();
  assert.equal(h.store.getSnapshot().session.enabled, true);
  assert.equal(h.store.getSnapshot().locationPermission, "foreground");
  cleanup();
  await h.store.actions.pauseDiscovery();
});
test("a GPS request that never settles times out while the installed watcher remains usable", async (t) => {
  t.mock.timers.enable({
    apis: ["setTimeout", "Date"],
    now: new Date(2026, 9, 9, 12).getTime(),
  });
  const h = harness({ fix: () => new Promise(() => {}) });
  const start = h.store.actions.startDiscovery();
  await flush();
  t.mock.timers.tick(20001);
  await start;
  assert.equal(h.store.getSnapshot().session.enabled, true);
  assert.match(h.store.getSnapshot().session.error ?? "", /took too long/);
  await h.store.actions.pauseDiscovery();
  assert.ok(h.removed > 0);
  t.mock.timers.reset();
});
test('Android Expo Go never imports notifications during hydrate, enable or discovery', async () => {
  const h=harness({expoGo:true,persisted:active()});
  const cleanup=h.store.initializeApp();await flush();
  await h.store.actions.updateSettings({notificationsEnabled:true});
  assert.equal(h.store.getSnapshot().settings.notificationsEnabled,false);
  assert.match(h.store.getSnapshot().error??'',/development or production build/);
  await h.store.handleLocations([h.fix()]);assert.equal(h.notifications,0);
  cleanup();await h.store.actions.pauseDiscovery();
});

test('typing suggestions uses context without a business scan, query quota, or history write', async () => {
  let businessRequests = 0;
  let received: PlaceSearchContext | undefined;
  const berlin = { id: 'berlin', name: 'Berlin', label: 'Berlin, Germany', latitude: 52.5, longitude: 13.4 };
  const h = harness({
    persisted: { recentPlaces: [berlin] },
    search: async () => { businessRequests++; return []; },
    placeSearch: async (_query, options) => { received = options.context; return [berlin]; },
  });
  assert.deepEqual(await h.store.actions.searchLocations('Ber'), [berlin]);
  assert.equal(businessRequests, 0);
  assert.equal(h.store.getSnapshot().searching, false);
  assert.deepEqual(received?.recentPlaces, [berlin]);
  assert.deepEqual(h.store.getSnapshot().recentPlaces, [berlin]);
  assert.equal(h.persisted, '');
});

test('only explicitly selected named areas enter bounded history, and clear history removes them', async () => {
  const h = harness();
  for (let i = 0; i < 8; i++) {
    await h.store.actions.searchArea({ id: 'city-' + i, name: 'City ' + i, label: 'City ' + i, latitude: 40 + i, longitude: 13 });
  }
  const newest = h.store.getSnapshot().recentPlaces[0];
  await h.store.actions.searchArea(newest);
  await h.store.actions.searchArea({ label: 'Near me', latitude: 52.5, longitude: 13.4 });
  assert.equal(h.store.getSnapshot().recentPlaces.length, 6);
  assert.equal(h.store.getSnapshot().recentPlaces[0].id, 'city-7');
  assert.equal(JSON.parse(h.persisted).recentPlaces.length, 6);
  await h.store.actions.clearHistory();
  assert.deepEqual(h.store.getSnapshot().recentPlaces, []);
  assert.deepEqual(JSON.parse(h.persisted).recentPlaces, []);
});

test('invalid persisted places are ignored and aborted context work never starts a provider request', async () => {
  const context = deferred<PlaceSearchContext>();
  let calls = 0;
  const h = harness({
    persisted: { recentPlaces: [null, {}, { label: 'Bad', latitude: 91, longitude: 13 }, { label: 'Bad', latitude: 1, longitude: '3' }] },
    placeContext: () => context.promise,
    placeSearch: async () => { calls++; return []; },
  });
  const controller = new AbortController();
  const search = h.store.actions.searchLocations('Paris', { signal: controller.signal });
  controller.abort();
  context.resolve({ languages: ['fr-FR'] });
  assert.deepEqual(await search, []);
  assert.equal(calls, 0);
  assert.deepEqual(h.store.getSnapshot().recentPlaces, []);
});
