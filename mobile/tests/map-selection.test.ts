/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createMapDocument, type MapDocumentOptions } from '../src/services/map-document';
import { mapPlace, readMapMessage, validCoordinate, type MapMessage } from '../src/services/map-selection';

const point = { latitude: 52.520008123, longitude: 13.404954987 };
const options: MapDocumentOptions = { center: point, selected: null, radiusMeters: 750, dark: false };

test('map coordinates reject nonfinite, out-of-range, missing and coerced values', () => {
  for (const coordinate of [point, { latitude: 90, longitude: 180 }, { latitude: -90, longitude: -180 }, { latitude: 0, longitude: 0 }])
    assert.equal(validCoordinate(coordinate), true);
  for (const coordinate of [null, [], {}, '52,13', { latitude: '52', longitude: 13 }, { latitude: 91, longitude: 13 }, { latitude: 52, longitude: -181 }, { latitude: NaN, longitude: 13 }, { latitude: 52, longitude: Infinity }]) {
    assert.equal(validCoordinate(coordinate), false);
    assert.throws(() => mapPlace(coordinate as typeof point), RangeError);
  }
});

test('map places preserve search precision while giving recent locations stable IDs and readable labels', () => {
  const place = mapPlace(point);
  assert.equal(place.latitude, point.latitude);
  assert.equal(place.longitude, point.longitude);
  assert.equal(place.id, 'map:52.520008,13.404955');
  assert.equal(place.label, 'Map location · 52.5200, 13.4050');
  assert.equal(place.name, 'Map location');
  assert.deepEqual(mapPlace({ ...point }), place);
  assert.notEqual(mapPlace({ ...point, longitude: 13.5 }).id, place.id);
});

test('bridge accepts only bounded, validated selection and lifecycle messages', () => {
  const select = { type: 'select' as const, coordinate: point };
  assert.deepEqual(readMapMessage(JSON.stringify(select)), select);
  assert.deepEqual(readMapMessage(select), select);
  for (const type of ['ready', 'tile-error', 'tiles-loaded', 'attribution', 'cancel'])
    assert.deepEqual(readMapMessage(JSON.stringify({ type })), { type });
  for (const raw of [null, 3, [], '', '{', ' '.repeat(4097), { type: 'unknown' }, { type: 'ready', extra: 'x'.repeat(5000) }, { type: 'select', coordinate: null }, { type: 'select', coordinate: { latitude: 52, longitude: Infinity } }, { type: 'select', coordinate: { latitude: 52, longitude: 181 } }, { type: 'select', coordinate: { ...point, injected: '<script>' } }])
    assert.equal(readMapMessage(raw), null);
});

test('map document restricts external resources and strips unrelated caller content', () => {
  const hostile = { ...point, label: '</script><script>alert(1)</script>', toJSON: () => ({ latitude: 'injected' }) };
  const html = createMapDocument({ ...options, center: hostile, selected: hostile });
  assert.doesNotMatch(html, /alert\(1\)|"injected"|<script\s+src=/i);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /img-src https:\/\/tile\.openstreetmap\.org data:/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /width:48px;height:48px/);
  assert.match(html, /:focus-visible/);
  assert.match(html, /"radiusMeters":750/);
  assert.match(createMapDocument({ ...options, radiusMeters: 9000 }), /"radiusMeters":1500/);
  assert.throws(() => createMapDocument({ ...options, center: { latitude: Infinity, longitude: 13 } }), RangeError);
  assert.throws(() => createMapDocument({ ...options, radiusMeters: NaN }), RangeError);
  assert.throws(() => createMapDocument({ ...options, radiusMeters: 0 }), RangeError);
});

type Handler = (event?: any) => void;
function mapHarness(config: MapDocumentOptions = options, native = false) {
  const html = createMapDocument(config);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 2);
  const messages: MapMessage[] = [];
  const mapEvents: Record<string, Handler> = {};
  const tileEvents: Record<string, Handler> = {};
  const markerEvents: Record<string, Handler> = {};
  const hostEvents: Record<string, Handler> = {};
  const documentEvents: Record<string, Handler> = {};
  const positions: number[][] = [];
  const circles: { point: number[]; radius: number }[] = [];
  let markerPoint = { lat: point.latitude, lng: point.longitude };
  let viewport = { lat: point.latitude, lng: point.longitude };
  let fits = 0;
  const host = { addEventListener: (name: string, handler: Handler) => { hostEvents[name] = handler; }, getBoundingClientRect: () => ({ left: 0, right: 320, top: 0, bottom: 400 }) };
  const receive = (raw: string) => { const message = readMapMessage(raw); assert.ok(message, raw); messages.push(message); };
  const map = {
    attributionControl: { setPrefix() {} }, setView() {},
    fitBounds() { fits++; },
    on(name: string, handler: Handler) { mapEvents[name] = handler; },
    getCenter: () => viewport, invalidateSize() {},
  };
  const tiles = { addTo() {}, on(name: string, handler: Handler) { tileEvents[name] = handler; }, isLoading: () => false };
  const marker = {
    addTo() { return marker; },
    setLatLng(value: number[]) { positions.push(value); markerPoint = { lat: value[0], lng: value[1] }; },
    getLatLng: () => markerPoint,
    on(name: string, handler: Handler) { markerEvents[name] = handler; },
  };
  const circle = { addTo() { return circle; }, setLatLng() {}, getBounds: () => ({ getSouth: () => 52.5, getNorth: () => 52.54, getWest: () => 13.39, getEast: () => 13.42 }) };
  const leaflet = {
    map: () => map, tileLayer: () => tiles, divIcon() {},
    control: { zoom: () => ({ addTo() {} }) },
    marker(value: number[]) { positions.push(value); return marker; },
    circle(value: number[], settings: { radius: number }) { circles.push({ point: value, radius: settings.radius }); return circle; },
  };
  const window = { parent: { postMessage: receive }, addEventListener() {}, ...(native ? { ReactNativeWebView: { postMessage: receive } } : {}) };
  vm.runInNewContext(scripts[1][1], { L: leaflet, window, document: { getElementById: () => host, addEventListener: (name: string, handler: Handler) => { documentEvents[name] = handler; } } });
  return { messages, mapEvents, tileEvents, markerEvents, hostEvents, documentEvents, host, circles, positions,
    get fits() { return fits; },
    setViewport(value: typeof viewport) { viewport = value; },
    dragTo(value: typeof viewport) { markerPoint = value; markerEvents.dragend(); },
  };
}

test('map browsing never selects: only tap, drag, and Enter submit exact coordinates', () => {
  const h = mapHarness();
  assert.deepEqual(h.messages, [{ type: 'ready' }]);
  assert.equal(h.circles.length, 0);
  h.setViewport({ lat: 48.8566123, lng: 2.3522456 });
  h.mapEvents.moveend();
  assert.equal(h.messages.filter((message) => message.type === 'select').length, 0);
  h.mapEvents.click({ latlng: { lat: point.latitude, lng: point.longitude } });
  assert.deepEqual(h.messages.at(-1), { type: 'select', coordinate: point });
  assert.equal(h.circles[0].radius, 750);
  h.dragTo({ lat: 51.000001234, lng: -0.111112345 });
  assert.deepEqual(h.messages.at(-1), { type: 'select', coordinate: { latitude: 51.000001234, longitude: -0.111112345 } });
  h.hostEvents.keydown({ key: 'Enter', target: h.host, preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(h.messages.at(-1), { type: 'select', coordinate: { latitude: 48.8566123, longitude: 2.3522456 } });
  h.mapEvents.click({ latlng: { lat: 10, lng: 190 } });
  assert.deepEqual(h.messages.at(-1), { type: 'select', coordinate: { latitude: 10, longitude: -170 } });
});

test('an initial pin is rendered and fitted without committing another search', () => {
  const h = mapHarness({ ...options, selected: point, dark: true }, true);
  assert.equal(h.circles.length, 1);
  assert.equal(h.fits, 1);
  assert.deepEqual(h.messages, [{ type: 'ready' }]);
  assert.deepEqual([...h.positions[0]], [point.latitude, point.longitude]);
});

test('tile failure is reported once per batch and only clears when failed tiles leave the viewport', () => {
  const h = mapHarness();
  const tile = { isConnected: true, getBoundingClientRect: () => ({ left: 0, right: 256, top: 0, bottom: 256 }) };
  h.tileEvents.loading();
  h.tileEvents.tileerror({ tile });
  h.tileEvents.tileerror({ tile });
  h.tileEvents.load();
  assert.equal(h.messages.filter((message) => message.type === 'tile-error').length, 1);
  assert.equal(h.messages.filter((message) => message.type === 'tiles-loaded').length, 0);
  h.tileEvents.loading();
  h.tileEvents.load();
  assert.equal(h.messages.at(-1)?.type, 'tile-error');
  tile.getBoundingClientRect = () => ({ left: 500, right: 756, top: 0, bottom: 256 });
  h.mapEvents.moveend();
  assert.equal(h.messages.at(-1)?.type, 'tiles-loaded');
});

test('Escape cancels and attribution clicks request the fixed link without navigation', () => {
  const h = mapHarness();
  let prevented = 0;
  const event = { preventDefault() { prevented++; }, stopPropagation() {} };
  h.documentEvents.keydown({ ...event, key: 'Escape' });
  assert.equal(h.messages.at(-1)?.type, 'cancel');
  h.documentEvents.click({ ...event, target: { closest: () => ({ getAttribute: () => 'https://www.openstreetmap.org/copyright' }) } });
  assert.equal(h.messages.at(-1)?.type, 'attribution');
  assert.equal(prevented, 2);
  const previous = h.messages.length;
  h.documentEvents.click({ ...event, target: { closest: () => ({ getAttribute: () => 'https://example.com/' }) } });
  assert.equal(h.messages.length, previous);
  assert.equal(prevented, 3);
});
