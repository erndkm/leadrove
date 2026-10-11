import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocationSearchClient } from '../src/location-search.mjs';
import { derivePlaceContext } from '../../shared/place-ranking.mjs';

const feature = (name, country, countrycode, coordinates, state = '') => ({
  type: 'Feature', geometry: { type: 'Point', coordinates },
  properties: { name, country, countrycode, state, osm_key: 'place', osm_value: 'city' },
});
const places = [feature('Berlin', 'Germany', 'DE', [13.4, 52.52]), feature('Berlin', 'United States', 'US', [-71.2, 44.4], 'New Hampshire')];
const response = () => Response.json({ features: places });

test('requests a broad localized candidate pool with optional known-area bias', async () => {
  const calls = [];
  const search = createLocationSearchClient({ minIntervalMs: 0, fetchImpl: async url => { calls.push(url); return response(); } });
  const context = derivePlaceContext({ languages: ['de-DE'], timeZone: 'Europe/Berlin', nearby: { lat: 52, lng: 13 } });
  const found = await search(' Berlin ', { context });
  assert.equal(found[0].countryCode, 'DE');
  assert.equal(calls[0].searchParams.get('q'), 'Berlin');
  assert.equal(calls[0].searchParams.get('lang'), 'de');
  assert.equal(calls[0].searchParams.get('limit'), '20');
  assert.equal(calls[0].searchParams.get('lat'), '52');
  assert.equal(calls[0].searchParams.get('lon'), '13');
  assert.equal(calls[0].searchParams.has('countrycode'), false);
  await search('Tokyo', { context: derivePlaceContext({ languages: ['en'], timeZone: 'UTC' }) });
  assert.equal(calls[1].searchParams.has('lat'), false);
  assert.equal(calls[1].searchParams.has('lon'), false);
});

test('cached candidates rerank for history; locale and coordinates partition requests', async () => {
  let calls = 0;
  const search = createLocationSearchClient({ minIntervalMs: 0, fetchImpl: async () => { calls++; return response(); } });
  const context = derivePlaceContext({ languages: ['de-DE'], timeZone: 'Europe/Berlin' });
  const found = await search('Berlin', { context });
  await search('BERLIN', { context: { ...context, recentPlaces: [found[1]] } });
  assert.equal(calls, 1);
  await search('Berlin', { context: derivePlaceContext({ languages: ['fr-FR'] }) });
  await search('Berlin', { context: derivePlaceContext({ languages: ['de-DE'], nearby: { lat: 48, lng: 11 } }) });
  assert.equal(calls, 3);
});

test('cancelled requests cannot populate the cache even if a transport ignores cancellation', async () => {
  let release, calls = 0;
  const search = createLocationSearchClient({ minIntervalMs: 0, fetchImpl: () => { calls++; return new Promise(resolve => { release = resolve; }); } });
  const controller = new AbortController();
  const first = search('Berlin', { signal: controller.signal });
  controller.abort(); release(response());
  await assert.rejects(first, { name: 'AbortError' });
  const second = search('Berlin'); release(response()); await second;
  assert.equal(calls, 2);
});

test('a superseded queued query aborts without making a provider request', async () => {
  let calls = 0;
  const search = createLocationSearchClient({ minIntervalMs: 1000, fetchImpl: async () => { calls++; return response(); } });
  await search('Berlin');
  const controller = new AbortController();
  const pending = search('Bern', { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(calls, 1);
});

test('empty responses are valid but malformed responses and network failures are actionable', async () => {
  const empty = createLocationSearchClient({ fetchImpl: async () => Response.json({ features: [] }) });
  assert.deepEqual(await empty('Unknown town'), []);
  for (const [fetchImpl, pattern] of [
    [async () => Response.json({ results: [] }), /incomplete response/],
    [async () => new Response('<html>Unavailable</html>'), /unreadable response/],
    [async () => { throw new TypeError('offline'); }, /connection/],
    [async () => new Response('', { status: 429 }), /busy/],
    [async () => new Response('', { status: 503 }), /Try again/],
  ]) await assert.rejects(createLocationSearchClient({ fetchImpl })('Berlin'), pattern);
});

test('timeout is distinguishable from intentional cancellation and validation avoids requests', async () => {
  const search = createLocationSearchClient({ timeoutMs: 10, minIntervalMs: 0, fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })) });
  await assert.rejects(search('Berlin'), /took too long/);
  await assert.rejects(search('x'), /at least two/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(search('Berlin', { signal: controller.signal }), { name: 'AbortError' });
});

test('an explicit distant region stays available despite local German context', async () => {
  const search = createLocationSearchClient({ fetchImpl: async () => response() });
  const found = await search('Berlin, New Hampshire', { context: derivePlaceContext({ languages: ['de-DE'], timeZone: 'Europe/Berlin', nearby: { lat: 52, lng: 13 } }) });
  assert.equal(found[0].state, 'New Hampshire');
});
