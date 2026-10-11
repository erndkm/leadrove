import test from 'node:test';
import assert from 'node:assert/strict';
import { createOverpassClient } from '../src/overpass.mjs';
import { buildBusinessQuery } from '../../shared/business-query.mjs';

const endpoints = ['https://primary.example/api/interpreter', 'https://backup.example/api/interpreter'];
const complete = (elements = []) => Response.json({ elements });
const business = { type: 'node', id: 1, lat: 52.5295, lon: 13.401, tags: { name: 'Test bakery', shop: 'bakery' } };

test('provider configuration cannot send searches over plaintext or expose URL credentials', async () => {
  for (const endpoint of ['http://example.com/api', 'https://secret@example.com/api', 'https://example.com/api#fragment', 'invalid']) {
    let calls = 0;
    const query = createOverpassClient({ endpoints: [endpoint, endpoints[1]], fetchImpl: async () => { calls++; return complete(); } });
    await assert.rejects(query('private area'), /HTTPS/);
    assert.equal(calls, 0);
  }
});

test('504 falls back sequentially, preserving the query and preferring the working provider next time', async () => {
  const calls = [];
  const query = createOverpassClient({ endpoints, fetchImpl: async url => {
    calls.push({ endpoint: url.origin, query: url.searchParams.get('data') });
    return url.hostname === 'primary.example' ? new Response('Gateway timeout', { status: 504 }) : complete([business]);
  } });
  assert.deepEqual((await query('first area')).elements, [business]);
  await query('second area');
  assert.deepEqual(calls, [
    { endpoint: 'https://primary.example', query: 'first area' },
    { endpoint: 'https://backup.example', query: 'first area' },
    { endpoint: 'https://backup.example', query: 'second area' },
  ]);
});

test('a rate-limited custom provider honors Retry-After without leaking to default providers', async () => {
  let clock = 1000, calls = 0;
  const query = createOverpassClient({ endpoints: [endpoints[0]], now: () => clock, fetchImpl: async url => {
    assert.equal(url.origin, 'https://primary.example');
    calls++;
    return calls === 1 ? new Response('', { status: 429, headers: { 'Retry-After': '120' } }) : complete();
  } });
  await assert.rejects(query('area'), /busy/);
  clock += 60000;
  await assert.rejects(query('area'), /60 seconds/);
  assert.equal(calls, 1);
  clock += 60000;
  assert.deepEqual((await query('area')).elements, []);
  assert.equal(calls, 2);
});

test('HTTP-date Retry-After and 406 responses impose a cooldown', async () => {
  let clock = Date.parse('2026-10-09T12:00:00Z'), calls = 0;
  const query = createOverpassClient({ endpoints: [endpoints[0]], now: () => clock, fetchImpl: async () => {
    calls++;
    return new Response('', { status: 406, headers: { 'Retry-After': 'Fri, 09 Oct 2026 12:01:00 GMT' } });
  } });
  await assert.rejects(query('area'), /busy/);
  clock += 10000;
  await assert.rejects(query('area'), /50 seconds/);
  assert.equal(calls, 1);
});

test('a scan waits for a short remaining cooldown and retries automatically', async () => {
  let clock = 0, calls = 0;
  const waits = [];
  const query = createOverpassClient({
    endpoints: [endpoints[0]],
    now: () => clock,
    sleep: async delay => { waits.push(delay); clock += delay; },
    fetchImpl: async () => ++calls === 1 ? new Response('', { status: 503 }) : complete([business]),
  });
  await assert.rejects(query('area'), /temporarily unavailable/);
  clock = 25000;
  assert.deepEqual((await query('area')).elements, [business]);
  assert.deepEqual(waits, [5000]);
  assert.equal(calls, 2);
});

test('network failures and invalid JSON use the backup provider', async () => {
  for (const fail of [() => { throw new TypeError('Failed to fetch'); }, () => new Response('<html>Temporary error</html>')]) {
    let calls = 0;
    const query = createOverpassClient({ endpoints, fetchImpl: async () => ++calls === 1 ? fail() : complete([business]) });
    assert.deepEqual((await query('area')).elements, [business]);
    assert.equal(calls, 2);
  }
});

test('partial and malformed results never become a successful empty search', async () => {
  for (const response of [{ elements: [business], remark: 'runtime error: Query timed out' }, { unexpected: [] }, null]) {
    let calls = 0;
    const query = createOverpassClient({ endpoints, fetchImpl: async () => { calls++; return Response.json(response); } });
    await assert.rejects(query('area'), /could not finish|invalid response/);
    assert.equal(calls, 2);
    await assert.rejects(query('area'), /30 seconds/);
    assert.equal(calls, 2);
  }
});

test('a complete backup response replaces a partial primary response', async () => {
  let calls = 0;
  const query = createOverpassClient({ endpoints, fetchImpl: async () => ++calls === 1
    ? Response.json({ elements: [], remark: 'runtime error: out of memory' }) : complete([business]) });
  assert.deepEqual((await query('area')).elements, [business]);
});

test('query rejection is not retried on another server', async () => {
  let calls = 0;
  const query = createOverpassClient({ endpoints, fetchImpl: async () => { calls++; return new Response('Bad query', { status: 400 }); } });
  await assert.rejects(query('area'), /HTTP 400/);
  assert.equal(calls, 1);
});

test('a timed-out attempt aborts its request before falling back', async () => {
  let calls = 0, primaryAborted = false;
  const query = createOverpassClient({ endpoints, timeoutMs: 10, fetchImpl: async (_url, { signal }) => {
    if (++calls > 1) { assert.equal(primaryAborted, true); return complete([business]); }
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => {
      primaryAborted = true;
      reject(new DOMException('Timeout', 'AbortError'));
    }, { once: true }));
  } });
  assert.deepEqual((await query('area')).elements, [business]);
  assert.equal(calls, 2);
});

test('user cancellation stops active requests without fallback or cooldown', async () => {
  let calls = 0;
  const controller = new AbortController();
  const query = createOverpassClient({ endpoints, fetchImpl: async (_url, { signal }) => {
    if (++calls > 1) return complete();
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true });
      controller.abort();
    });
  } });
  await assert.rejects(query('area', controller.signal), { name: 'AbortError' });
  assert.equal(calls, 1);
  await assert.rejects(query('area', controller.signal), { name: 'AbortError' });
  assert.equal(calls, 1);
  await query('area');
  assert.equal(calls, 2);
});

test('repeat business scans use cached complete results and retain the requested radius', async () => {
  const calls = [];
  const fetchedAt = Date.now();
  const request = async (path, body) => { calls.push({ path, body }); return { elements: [business], fetchedAt }; };
  const { searchBusinesses } = await import('../src/api.mjs?overpass-cache-test');
  const center = { lat: 52.5295, lng: 13.401, label: 'Berlin Mitte' };
  const first = await searchBusinesses(center, 1.5, request);
  const second = await searchBusinesses(center, 1.5, request);
  assert.equal(second, first);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { path: '/map/search', body: { center: { lat: center.lat, lng: center.lng }, radius: 1.5 } });
  assert.equal(first.businesses[0].name, 'Test bakery');
  assert.equal(first.radius, 1.5);
  assert.equal(first.fetchedAt, fetchedAt);
  const query = buildBusinessQuery(center, 1.5);
  assert.match(query, /\[maxsize:67108864\]/);
  const bbox = query.match(/\[bbox:([^\]]+)\]/)?.[1].split(',').map(Number);
  assert.ok(bbox && bbox[0] < center.lat && bbox[1] < center.lng && bbox[2] > center.lat && bbox[3] > center.lng);
  await searchBusinesses(center, 4, request);
  assert.match(buildBusinessQuery(center, 4), /\[maxsize:134217728\]/);
});

test('queries near the date line retain a circular search', () => {
  assert.match(buildBusinessQuery({ lat: 0, lng: 179.99 }, 10), /around:10000,0,179\.99/);
});
