/// <reference types="node" />
import test from "node:test";
import assert from "node:assert/strict";
import { nearbyBusinesses, searchLocations } from "../src/services/business-search";

test("bounded map query parses real OSM-shaped data, filters distant results and enforces cooldown", async () => {
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async (_url, options) => {
    requests++;
    const query = decodeURIComponent(String(options?.body));
    assert.match(query, /around:1500,52.5,13.4/);
    assert.match(query, /out center tags 250/);
    assert.match(query, /timeout:20/);
    return new Response(
      JSON.stringify({
        elements: [
          {
            type: "node",
            id: 1,
            lat: 52.5,
            lon: 13.4,
            tags: { name: "Example Salon", shop: "hairdresser", phone: "123" },
          },
          {
            type: "way",
            id: 2,
            center: { lat: 52.5001, lon: 13.4001 },
            tags: {
              name: "Example Bakery",
              shop: "bakery",
              website: "https://example.com",
            },
          },
          {
            type: "node",
            id: 3,
            lat: 53,
            lon: 14,
            tags: { name: "Too distant", shop: "clothes" },
          },
          ...["government", "political_party", "diplomatic", "ngo"].map((office, index) => ({
            type: "node", id: index + 4, lat: 52.5, lon: 13.4,
            tags: { name: "Public office", office, phone: "123" },
          })),
          { type: "node", id: -1, lat: 52.5, lon: 13.4, tags: { name: "Invalid ID", shop: "yes" } },
          { type: "node", id: 10, lat: 52.5, lon: 13.4, tags: { name: "   ", shop: "yes" } },
          { type: "node", id: 11, lat: 412.5, lon: 13.4, tags: { name: "Invalid latitude", shop: "yes" } },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  try {
    const settings = {
      radiusMeters: 9999,
      minScore: 60,
      category: "all" as const,
      notificationsEnabled: false,
      includeChains: false,
      dailyNotificationLimit: 5,
    };
    const results = await nearbyBusinesses(
      { latitude: 52.5, longitude: 13.4, label: "Test" },
      settings,
      new AbortController().signal,
    );
    assert.equal(results.length, 1);
    assert.equal(results[0].id, "node/1");
    assert.equal(results[0].category, "beauty");
    assert.equal(results[0].websiteStatus, "missing");
    const cached = await nearbyBusinesses(
      { latitude: 52.5, longitude: 13.4, label: "Test" },
      { ...settings, minScore: 0, includeChains: true },
      new AbortController().signal,
    );
    assert.equal(cached.length, 2, "cached data is filtered with the current settings");
    assert.equal(requests, 1, "repeating an area does not hit the provider or cooldown");
    await assert.rejects(
      nearbyBusinesses(
        { latitude: 52.51, longitude: 13.4, label: "Test" },
        settings,
        new AbortController().signal,
      ),
      /cooling down/,
    );
    assert.equal(requests, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test("invalid coordinates and radius never reach the map provider", async () => {
  const settings = { radiusMeters: 500, minScore: 0, category: "all" as const,
    notificationsEnabled: false, includeChains: true, dailyNotificationLimit: 5 };
  for (const latitude of [NaN, Infinity, 91, '52);out;(' as unknown as number]) {
    await assert.rejects(nearbyBusinesses({ latitude, longitude: 13, label: "Invalid" }, settings,
      new AbortController().signal), /valid location/);
  }
  await assert.rejects(nearbyBusinesses({ latitude: 52, longitude: 13, label: "Invalid" },
    { ...settings, radiusMeters: NaN }, new AbortController().signal), /valid location/);
});

test("mobile POST search recovers from a busy provider and caches only complete results", async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  Date.now = () => originalNow() + 900000;
  const calls: string[] = [];
  globalThis.fetch = async (url, options) => {
    calls.push(String(url));
    assert.equal(options?.method, 'POST');
    assert.equal(options?.credentials, 'omit');
    assert.match(decodeURIComponent(String(options?.body)), /maxsize:33554432/);
    return calls.length === 1 ? new Response('Busy', { status: 504 }) : Response.json({ elements: [
      { type: 'node', id: 100, lat: 52.6, lon: 13.4, tags: { name: 'Fallback shop', shop: 'hairdresser' } },
    ] });
  };
  try {
    const settings = { radiusMeters: 500, minScore: 0, category: 'all' as const,
      notificationsEnabled: false, includeChains: true, dailyNotificationLimit: 5 };
    const place = { latitude: 52.6, longitude: 13.4, label: 'Fallback area' };
    const result = await nearbyBusinesses(place, settings, new AbortController().signal);
    assert.equal(result[0].name, 'Fallback shop');
    await nearbyBusinesses(place, settings, new AbortController().signal);
    assert.equal(calls.length, 2);
    assert.notEqual(calls[0], calls[1]);
  } finally { globalThis.fetch = originalFetch; Date.now = originalNow; }
});

test("geocoding skips malformed features and keeps valid labeled point locations", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ features: [
    null, {}, { geometry: { type: "Point", coordinates: [13, 91] } },
    { geometry: { type: "Point", coordinates: ["13", 52] } },
    { geometry: { type: "Polygon", coordinates: [13, 52] } },
    { geometry: { type: "Point", coordinates: [13, 52] }, properties: { name: {}, country: 2 } },
    { geometry: { type: "Point", coordinates: [13.4, 52.5] }, properties: { name: " Berlin ", city: "Berlin", country: "Germany" } },
  ] }));
  try {
    assert.deepEqual((await searchLocations("Berlin")).map(({ longitude, latitude, label }) => ({ longitude, latitude, label })), [
      { longitude: 13.4, latitude: 52.5, label: "Berlin, Germany" },
    ]);
    globalThis.fetch = async () => new Response(JSON.stringify({ features: {} }));
    await assert.rejects(searchLocations("Invalid response"), /invalid response/);
    globalThis.fetch = async () => new Response(JSON.stringify({ features: [] }));
    assert.deepEqual(await searchLocations("Unknown place"), []);
  } finally {
    globalThis.fetch = original;
  }
});
test("malformed map responses are errors rather than successful empty searches", async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  Date.now = () => originalNow() + 1800000;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ unexpected: "payload" }), { status: 200 });
  try {
    await assert.rejects(
      nearbyBusinesses(
        { latitude: 52.5, longitude: 13.4, label: "Test" },
        {
          radiusMeters: 500,
          minScore: 0,
          category: "all",
          notificationsEnabled: false,
          includeChains: true,
          dailyNotificationLimit: 5,
        },
        new AbortController().signal,
      ),
      /invalid response/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
});
