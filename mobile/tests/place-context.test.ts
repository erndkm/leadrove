/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import type { LocationSample } from '../src/types';

const compiled = ts.transpileModule(
  readFileSync(new URL('../src/services/place-context.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } },
).outputText;

function harness(options: { granted?: boolean; lastKnown?: () => Promise<any>; localeError?: boolean } = {}) {
  let lastKnownReads = 0;
  let requestedPermissions = 0;
  let activeGpsReads = 0;
  const modules: Record<string, unknown> = {
    'expo-localization': {
      getLocales: () => {
        if (options.localeError) throw new Error('Locale unavailable');
        return [{ languageTag: 'en-US', regionCode: 'DE' }, { languageTag: 'de-DE', regionCode: 'DE' }];
      },
      getCalendars: () => [{ timeZone: 'Europe/Berlin' }],
    },
    'expo-location': {
      getForegroundPermissionsAsync: async () => ({ granted: options.granted ?? true }),
      getLastKnownPositionAsync: async (constraints: { maxAge: number; requiredAccuracy: number }) => {
        lastKnownReads++;
        assert.equal(constraints.maxAge, 1800000);
        assert.equal(constraints.requiredAccuracy, 10000);
        return options.lastKnown ? options.lastKnown() : { coords: { latitude: 52.5, longitude: 13.4, accuracy: 100 }, timestamp: Date.now() };
      },
      requestForegroundPermissionsAsync: async () => { requestedPermissions++; throw new Error('Must not request permission'); },
      getCurrentPositionAsync: async () => { activeGpsReads++; throw new Error('Must not start GPS'); },
    },
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)((name: string) => {
    if (!(name in modules)) throw new Error('Unexpected module ' + name);
    return modules[name];
  }, module, module.exports);
  return {
    getContext: (module.exports as typeof import('../src/services/place-context')).getPlaceSearchContext,
    get lastKnownReads() { return lastKnownReads; },
    get requestedPermissions() { return requestedPermissions; },
    get activeGpsReads() { return activeGpsReads; },
  };
}

test('native locale, explicit device region, timezone, and existing cached position form context', async () => {
  const h = harness();
  const recent = [{ name: 'Munich', label: 'Munich, Germany', latitude: 48.13, longitude: 11.58 }];
  const context = await h.getContext(recent, null);
  assert.deepEqual(context.languages, ['en-US', 'de-DE']);
  assert.equal(context.regionCode, 'DE');
  assert.equal(context.timeZone, 'Europe/Berlin');
  assert.equal(context.nearby?.latitude, 52.5);
  assert.deepEqual(context.recentPlaces, recent);
  await h.getContext(recent, null);
  assert.equal(h.lastKnownReads, 1, 'native cache lookup is rate limited');
  assert.equal(h.requestedPermissions, 0);
  assert.equal(h.activeGpsReads, 0);
});

test('denied location permission keeps locale suggestions and ignores even a retained session fix', async () => {
  const h = harness({ granted: false });
  const sample: LocationSample = { latitude: 52.5, longitude: 13.4, accuracy: 10, timestamp: Date.now() };
  const context = await h.getContext([], sample);
  assert.equal(context.nearby, null);
  assert.equal(context.regionCode, 'DE');
  assert.equal(h.lastKnownReads, 0);
  assert.equal(h.requestedPermissions, 0);
  assert.equal(h.activeGpsReads, 0);
});

test('a recent permitted discovery fix is reused while stale or inaccurate fixes are discarded', async () => {
  const h = harness({ lastKnown: async () => null });
  const sample: LocationSample = { latitude: 52.5, longitude: 13.4, accuracy: 10, timestamp: Date.now() };
  assert.deepEqual((await h.getContext([], sample)).nearby, sample);
  assert.equal(h.lastKnownReads, 0);
  assert.equal((await h.getContext([], { ...sample, timestamp: Date.now() - 1800001 })).nearby, null);
  assert.equal((await h.getContext([], { ...sample, accuracy: 12000 })).nearby, null);
  assert.equal(h.activeGpsReads, 0);
});

test('slow cached-location lookup falls back to locale context after 400 ms', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness({ lastKnown: () => new Promise(() => {}) });
  try {
    const context = h.getContext([], null);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    t.mock.timers.tick(401);
    const result = await context;
    assert.equal(result.nearby, null);
    assert.equal(result.timeZone, 'Europe/Berlin');
    assert.equal(h.requestedPermissions, 0);
  } finally { t.mock.timers.reset(); }
});
