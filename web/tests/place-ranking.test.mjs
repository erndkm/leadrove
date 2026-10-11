import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlaceText, normalizePhotonFeatures, derivePlaceContext, contextKey, rankPlaceSuggestions } from '../../shared/place-ranking.mjs';

const feature = (name, countrycode, state, lat, lng, extra = {}) => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] },
  properties: { name, countrycode, state, country: countrycode === 'FR' ? 'France' : countrycode === 'DE' ? 'Deutschland' : 'United States', osm_key: 'place', osm_value: 'city', ...extra },
});
const paris = () => normalizePhotonFeatures([
  feature('Paris', 'FR', 'Île-de-France', 48.8566, 2.3522),
  feature('Paris', 'US', 'Texas', 33.6609, -95.5555),
  feature('Paris', 'US', 'Tennessee', 36.302, -88.3267),
]);
const texasContext = () => derivePlaceContext({ languages: ['en-US'], timeZone: 'America/Chicago', nearby: { lat: 33.6609, lng: -95.5555 }, recentPlaces: [paris()[1]] });

test('labels distinguish ambiguous towns and retain address details', () => {
  const places = normalizePhotonFeatures([
    feature('Paris', 'US', 'Texas', 33.66, -95.55, { city: 'Paris', county: 'Lamar County' }),
    feature('', 'DE', 'Berlin', 52.52, 13.4, { street: 'Friedrichstraße', housenumber: '25', city: 'Berlin', district: 'Mitte', osm_value: 'house' }),
  ]);
  assert.equal(places[0].label, 'Paris, Lamar County, Texas, United States');
  assert.equal(places[1].name, 'Friedrichstraße 25');
  assert.equal(places[1].label, 'Friedrichstraße 25, Mitte, Berlin, Deutschland');
  assert.equal(places[1].region, 'Berlin');
});

test('rejects malformed features and coordinates before selection', () => {
  const valid = feature('Paris', 'FR', '', 48.8, 2.3);
  assert.deepEqual(normalizePhotonFeatures({ features: [valid] }), []);
  assert.equal(normalizePhotonFeatures([
    null, {}, { ...valid, geometry: { type: 'Polygon', coordinates: [2, 49] } },
    feature('Bad', 'FR', '', 91, 2), feature('Bad', 'FR', '', 50, Infinity),
    feature('Bad', 'FR', '', '50', 2), { ...valid, properties: null },
    { ...valid, properties: { name: 13 } }, valid,
  ]).length, 1);
});

test('locale regions and timezone are weak country hints without language-country guessing', () => {
  assert.deepEqual(derivePlaceContext({ languages: ['en'], timeZone: 'UTC' }).countryCodes, []);
  const context = derivePlaceContext({ languages: ['en-US', 'de-DE'], timeZone: 'Europe/Berlin' });
  assert.equal(context.language, 'en');
  assert.deepEqual(context.countryCodes, ['DE', 'US']);
  assert.deepEqual(derivePlaceContext({ languages: ['en-US'], regionCode: 'GB', timeZone: 'Europe/Berlin' }).countryCodes, ['GB', 'DE', 'US']);
  assert.deepEqual(derivePlaceContext({ languages: ['zh-Hant-TW', 'en-u-rg-uszzzz'] }).countryCodes, ['TW']);
  assert.equal(derivePlaceContext({ languages: ['tr-TR'] }).language, undefined);
  assert.equal(derivePlaceContext({ languages: ['tr-TR', 'fr-CA'] }).language, 'fr');
});

test('provider order survives without useful context; device region can resolve equal names', () => {
  assert.equal(rankPlaceSuggestions(paris(), 'Paris')[0].countryCode, 'FR');
  assert.equal(rankPlaceSuggestions(paris(), 'Paris', texasContext())[0].state, 'Texas');
  assert.ok(rankPlaceSuggestions(paris(), 'Paris', texasContext()).some(place => place.countryCode === 'FR'));
  assert.equal(rankPlaceSuggestions(paris(), 'Paris', derivePlaceContext({ languages: ['de-DE'], timeZone: 'Europe/Berlin' }))[0].countryCode, 'FR');
});

test('explicit country/state qualifiers override nearby location, language and history', () => {
  for (const query of ['Paris, France', 'Paris France', 'Paris FR', 'Paris, Frankreich', 'Paris, Fran']) {
    assert.equal(rankPlaceSuggestions(paris(), query, texasContext())[0].countryCode, 'FR', query);
  }
  const franceContext = derivePlaceContext({ languages: ['fr-FR'], nearby: { lat: 48.85, lng: 2.35 }, recentPlaces: [paris()[0]] });
  for (const query of ['Paris Texas', 'Paris, TX', 'Paris, Texas, USA']) {
    assert.equal(rankPlaceSuggestions(paris(), query, franceContext)[0].state, 'Texas', query);
  }
});

test('a complete multiword city name is not split into a different town and qualifier', () => {
  const places = normalizePhotonFeatures([
    feature('New', 'US', 'York', 40.71, -74),
    feature('New York', 'US', 'New York', 40.71, -74),
  ]);
  assert.equal(rankPlaceSuggestions(places, 'New York')[0].name, 'New York');
});

test('global exact names beat local prefixes and venue matches', () => {
  const exact = feature('Berlin', 'DE', 'Berlin', 52.52, 13.405);
  const nearby = feature('Berlin Heights', 'US', 'Ohio', 41.325, -82.493);
  const places = normalizePhotonFeatures([nearby, exact]);
  const context = derivePlaceContext({ languages: ['en-US'], nearby: { lat: 41.325, lng: -82.493 }, recentPlaces: [places[0]] });
  assert.equal(rankPlaceSuggestions(places, 'Berlin', context)[0].countryCode, 'DE');
  const cityAndVenue = normalizePhotonFeatures([
    feature('Paris Café', 'US', 'Texas', 33.66, -95.55, { osm_key: 'amenity', osm_value: 'cafe' }),
    exact, ...[feature('Paris', 'FR', 'Île-de-France', 48.8566, 2.3522)],
  ]);
  assert.equal(rankPlaceSuggestions(cityAndVenue, 'Paris', texasContext())[0].name, 'Paris');
});

test('diacritics, German transliteration and supplied name aliases match', () => {
  assert.equal(normalizePlaceText('  Łódź / Straße  '), 'lodz strasse');
  const places = normalizePhotonFeatures([
    feature('Munich Road', 'US', 'Texas', 33, -95, { osm_key: 'highway', osm_value: 'residential' }),
    feature('München', 'DE', 'Bayern', 48.137, 11.575, { 'name:en': 'Munich' }),
    feature('Münchenbernsdorf', 'DE', 'Thüringen', 50.82, 11.93),
  ]);
  for (const query of ['Munchen', 'Muenchen', 'München', 'Munich']) assert.equal(rankPlaceSuggestions(places, query)[0].name, 'München', query);
});

test('nearby towns and previous choices resolve otherwise equally named places', () => {
  const towns = normalizePhotonFeatures([
    feature('Springfield', 'US', 'Illinois', 39.8, -89.64),
    feature('Springfield', 'US', 'Massachusetts', 42.1, -72.59),
  ]);
  const context = derivePlaceContext({ languages: ['en-US'], nearby: { latitude: 42.1, longitude: -72.59 } });
  assert.equal(rankPlaceSuggestions(towns, 'Springfield', context)[0].state, 'Massachusetts');
  assert.equal(rankPlaceSuggestions(towns, 'Springfield IL', context)[0].state, 'Illinois');
  const history = derivePlaceContext({ recentPlaces: [{ latitude: 42.1, longitude: -72.59, label: towns[1].label }] });
  assert.equal(rankPlaceSuggestions(towns, 'Springfield', history)[0].state, 'Massachusetts');
});

test('city names prefer settlements but explicit street addresses remain available', () => {
  const places = normalizePhotonFeatures([
    feature('Berlin', 'DE', 'Berlin', 52.53, 13.4, { osm_key: 'amenity', osm_value: 'restaurant' }),
    feature('Berlin', 'DE', 'Berlin', 52.52, 13.405),
    feature('Berlin Street 12', 'US', 'Texas', 33, -95, { street: 'Berlin Street', housenumber: '12', osm_value: 'house' }),
  ]);
  assert.equal(rankPlaceSuggestions(places, 'Berlin')[0].kind, 'city');
  assert.equal(rankPlaceSuggestions(places, 'Berlin Street 12')[0].kind, 'house');
  assert.equal(rankPlaceSuggestions(places, '12 Berlin Street')[0].kind, 'house');
});

test('deduplication keeps different towns and does not mutate provider results', () => {
  const places = paris();
  const original = structuredClone(places);
  const duplicate = { ...places[0], id: 'duplicate', lat: places[0].lat + 0.0001 };
  const sameNameElsewhere = { ...places[0], id: 'another-city', lat: places[0].lat + 5 };
  const result = rankPlaceSuggestions([...places, duplicate, sameNameElsewhere], 'Paris');
  assert.equal(result.length, 4);
  assert.deepEqual(places, original);
  assert.deepEqual(rankPlaceSuggestions(places, ''), []);
  assert.deepEqual(rankPlaceSuggestions(places, 'Paris', {}, 0), []);
});

test('same-label Tübingen town and administrative centroids occupy one suggestion', () => {
  // The live provider returned a city and two "other" features with this same label.
  // Representative separated centroids model that response without a network test.
  const common = { county: 'Landkreis Tübingen', osm_type: 'R' };
  const places = normalizePhotonFeatures([
    feature('Tübingen', 'DE', 'Baden-Württemberg', 48.5216, 9.0576, { ...common, osm_id: 1, type: 'city' }),
    feature('Tübingen', 'DE', 'Baden-Württemberg', 48.5516, 9.0576, { ...common, osm_id: 2, type: 'other', osm_key: 'boundary', osm_value: 'administrative' }),
    feature('Tübingen', 'DE', 'Baden-Württemberg', 48.6216, 9.0576, { ...common, osm_id: 3, type: 'other', osm_key: 'boundary', osm_value: 'administrative' }),
  ]);
  assert.deepEqual(places.map(place => place.kind), ['city', 'administrative', 'administrative']);
  const results = rankPlaceSuggestions(places, 'Tübingen', derivePlaceContext({ languages: ['de-DE'], nearby: places[2] }));
  assert.equal(results.length, 1);
  assert.equal(results[0].kind, 'city');
});

test('wider administrative deduplication preserves different towns, distant areas and venues', () => {
  const places = normalizePhotonFeatures([
    feature('Neustadt', 'DE', 'Bayern', 49, 11, { osm_id: 1, osm_type: 'N' }),
    feature('Neustadt', 'DE', 'Bayern', 49.05, 11, { osm_id: 2, osm_type: 'N' }),
    feature('Neustadt', 'DE', 'Bayern', 49.5, 11, { osm_id: 3, osm_type: 'R', type: 'other', osm_key: 'boundary', osm_value: 'administrative' }),
    feature('Neustadt', 'DE', 'Bayern', 49.06, 11, { osm_id: 4, osm_type: 'N', type: 'other', osm_key: 'tourism', osm_value: 'attraction' }),
    feature('Neustadt', 'DE', 'Bayern', 49.07, 11, { osm_id: 5, osm_type: 'W', type: 'street', osm_key: 'highway', osm_value: 'residential' }),
  ]);
  assert.equal(rankPlaceSuggestions(places, 'Neustadt').length, 5);
});

test('a global exact result remains visible when numerous equal local names get a boost', () => {
  const places = normalizePhotonFeatures([
    feature('Paris', 'FR', 'Île-de-France', 48.85, 2.35),
    ...Array.from({ length: 8 }, (_, index) => feature('Paris', 'US', `Region ${index}`, 33 + index / 100, -95)),
  ]);
  const result = rankPlaceSuggestions(places, 'Paris', texasContext());
  assert.equal(result.length, 6);
  assert.ok(result.some(place => place.countryCode === 'FR'));
  assert.equal(result[0].countryCode, 'US');
});

test('context-sensitive cache keys include history and omit insignificant position jitter', () => {
  const first = derivePlaceContext({ languages: ['en-US'], nearby: { lat: 33.66, lng: -95.55 } });
  const second = derivePlaceContext({ languages: ['de-DE'], nearby: first.nearby });
  assert.notEqual(contextKey(first), contextKey(second));
  assert.notEqual(contextKey(first), contextKey({ ...first, recentPlaces: paris() }));
  assert.equal(contextKey(first), contextKey({ ...first, nearby: { lat: 33.660001, lng: -95.550001 } }));
  assert.equal(derivePlaceContext({ nearby: { lat: 91, lng: 0 }, recentPlaces: [{ lat: 0, lng: 999, label: 'Invalid' }] }).nearby, undefined);
});
