/// <reference types="node" />
import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { searchLocations } from '../src/services/business-search';

const feature = (name: string, country: string, countrycode: string, lat: number, lon: number, id: number) => ({
  geometry: { type: 'Point', coordinates: [lon, lat] },
  properties: { name, city: name, country, countrycode, osm_key: 'place', osm_value: 'city', osm_id: id, osm_type: 'N' },
});
const response = (features: unknown[]) => new Response(JSON.stringify({ features }));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
async function flush() { for (let i = 0; i < 20; i++) await Promise.resolve(); }
let testClock = Date.now();
function advanceProviderClock(t: TestContext) {
  testClock += 60000;
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: testClock });
}

test('language and nearby hints remain soft, metadata is preserved, and context changes invalidate cache', async () => {
  const original = globalThis.fetch;
  const urls: URL[] = [];
  globalThis.fetch = async (url) => {
    urls.push(new URL(String(url)));
    return response([
      feature('Berlin', 'United States', 'us', 44.46, -71.18, 2),
      feature('Berlin', 'Germany', 'de', 52.52, 13.4, 1),
    ]);
  };
  try {
    const context = { languages: ['de-DE'], regionCode: 'DE', timeZone: 'Europe/Berlin', nearby: { latitude: 52.5, longitude: 13.4 } };
    const results = await searchLocations('Berlin', { context });
    assert.equal(results[0].countryCode, 'DE');
    assert.equal(results[0].name, 'Berlin');
    assert.match(results[0].label, /Germany/);
    assert.equal(results.length, 2, 'foreign matches stay available');
    assert.equal(urls[0].searchParams.get('lang'), 'de');
    assert.equal(urls[0].searchParams.get('limit'), '20');
    assert.equal(urls[0].searchParams.get('lat'), '52.5');
    assert.equal(urls[0].searchParams.get('lon'), '13.4');
    assert.equal(urls[0].searchParams.has('countrycode'), false);
    assert.equal(urls[0].searchParams.has('bbox'), false);
    assert.equal(urls[0].searchParams.has('layer'), false);
    assert.equal(urls[0].searchParams.has('location_bias_scale'), false);
    assert.deepEqual(await searchLocations('Berlin', { context }), results);
    assert.equal(urls.length, 1);
    await searchLocations('Berlin', { context: { languages: ['fr-FR'], regionCode: 'FR' } });
    assert.equal(urls.length, 2);
    assert.equal(urls[1].searchParams.get('lang'), 'fr');
    await searchLocations('Berlin', { context: { languages: ['tr-TR'], regionCode: 'TR' } });
    assert.equal(urls[2].searchParams.has('lang'), false, 'unsupported Photon languages use local names');
  } finally { globalThis.fetch = original; }
});

test('the last selected named area provides a soft center when current location is unavailable', async (t) => {
  const original = globalThis.fetch;
  advanceProviderClock(t);
  let url: URL | undefined;
  globalThis.fetch = async (value) => { url = new URL(String(value)); return response([]); };
  try {
    await searchLocations('Schwabing', { context: {
      nearby: null,
      recentPlaces: [{ name: 'Munich', label: 'Munich, Germany', latitude: 48.137, longitude: 11.575 }],
    } });
    assert.equal(url?.searchParams.get('lat'), '48.137');
    assert.equal(url?.searchParams.get('lon'), '11.575');
    assert.equal(url?.searchParams.has('bbox'), false);
  } finally { globalThis.fetch = original; t.mock.timers.reset(); }
});

test('new text rejects an out-of-order response even when the provider ignores cancellation', async (t) => {
  advanceProviderClock(t);
  const original = globalThis.fetch;
  const old = deferred<Response>();
  let oldSignal: AbortSignal | null | undefined;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('q=Oldtown')) { oldSignal = options?.signal; return old.promise; }
    return response([feature('Newtown', 'Germany', 'de', 52, 13, 3)]);
  };
  try {
    const stale = searchLocations('Oldtown');
    const rejected = assert.rejects(stale, { name: 'AbortError' });
    const current = searchLocations('Newtown');
    t.mock.timers.tick(701);
    const fresh = await current;
    assert.equal(oldSignal?.aborted, true);
    old.resolve(response([feature('Oldtown', 'Germany', 'de', 53, 13, 4)]));
    await rejected;
    assert.equal(fresh[0].name, 'Newtown');
  } finally { globalThis.fetch = original; t.mock.timers.reset(); }
});

test('clearing the field cancels pending work and short queries do not call the provider', async (t) => {
  advanceProviderClock(t);
  const original = globalThis.fetch;
  const pending = deferred<Response>();
  let calls = 0;
  globalThis.fetch = async () => { calls++; return pending.promise; };
  try {
    const request = searchLocations('Clearville');
    const rejected = assert.rejects(request, { name: 'AbortError' });
    assert.deepEqual(await searchLocations(' '), []);
    assert.deepEqual(await searchLocations('B'), []);
    pending.resolve(response([]));
    await rejected;
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; t.mock.timers.reset(); }
});

test('caller cancellation prevents result caching and provider failures allow a retry', async (t) => {
  advanceProviderClock(t);
  const original = globalThis.fetch;
  const pending = deferred<Response>();
  const controller = new AbortController();
  let calls = 0;
  globalThis.fetch = async () => { calls++; return pending.promise; };
  try {
    const request = searchLocations('Cancelville', { signal: controller.signal });
    const rejected = assert.rejects(request, { name: 'AbortError' });
    controller.abort();
    pending.resolve(response([feature('Cancelville', 'Germany', 'de', 52, 13, 4)]));
    await rejected;
    globalThis.fetch = async () => { calls++; return new Response('', { status: 503 }); };
    const failure = assert.rejects(searchLocations('Cancelville'), /unavailable/);
    t.mock.timers.tick(701);
    await failure;
    globalThis.fetch = async () => { calls++; return response([]); };
    const retry = searchLocations('Cancelville');
    t.mock.timers.tick(701);
    assert.deepEqual(await retry, []);
    assert.equal(calls, 3);
  } finally { globalThis.fetch = original; t.mock.timers.reset(); }
});

test('a stalled provider reports a recoverable timeout', async (t) => {
  const original = globalThis.fetch;
  advanceProviderClock(t);
  globalThis.fetch = async (_url, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
  });
  try {
    const request = searchLocations('Slowtown');
    const rejected = assert.rejects(request, /timed out/);
    t.mock.timers.tick(10001);
    await rejected;
  } finally { globalThis.fetch = original; t.mock.timers.reset(); }
});

test('provider starts are spaced 700 ms apart and superseded queued text never reaches the network', async (t) => {
  const original = globalThis.fetch;
  advanceProviderClock(t);
  const starts: number[] = [];
  const queries: string[] = [];
  globalThis.fetch = async (url) => {
    starts.push(Date.now());
    queries.push(new URL(String(url)).searchParams.get('q')!);
    return response([]);
  };
  try {
    await searchLocations('Rate one');
    const queued = searchLocations('Rate two');
    const cancelled = assert.rejects(queued, { name: 'AbortError' });
    t.mock.timers.tick(350);
    await flush();
    assert.equal(starts.length, 1);
    const latest = searchLocations('Rate three');
    await cancelled;
    t.mock.timers.tick(349);
    await flush();
    assert.equal(starts.length, 1);
    t.mock.timers.tick(1);
    await latest;
    assert.deepEqual(queries, ['Rate one', 'Rate three']);
    assert.equal(starts[1] - starts[0], 700);
  } finally { globalThis.fetch = original; t.mock.timers.reset(); }
});
