import test from 'node:test';
import assert from 'node:assert/strict';
import { safeUrl, websiteStatus, normalizeBusinesses, filterBusinesses, scoreBusiness, toCsv, distanceKm } from '../src/model.mjs';

const center = { lat: 52.52, lng: 13.4 };
const element = (id, tags = {}, lat = 52.52) => ({ type: 'node', id, lat, lon: 13.4, tags: { name: 'Example Salon', shop: 'hairdresser', ...tags } });
test('directory omissions are labeled as missing, not verified absence', () => {
  const [b] = normalizeBusinesses([element(1)], center, 1);
  assert.equal(b.websiteStatus, 'missing'); assert.equal(b.score, 75);
  assert.match(b.signals[0].detail, /may be incomplete/);
});
test('a business with a dedicated website ranks below an equivalent missing-website prospect', () => {
  const [missing] = normalizeBusinesses([element(1, { phone: '123', opening_hours: 'Mo-Fr 09:00-17:00' })], center, 1);
  const [website] = normalizeBusinesses([element(2, { website: 'example.com', phone: '123', opening_hours: 'Mo-Fr 09:00-17:00' })], center, 1);
  assert.equal(missing.score, 100); assert.equal(website.score, 45);
});
test('recognizes real social domains without substring spoofing', () => {
  assert.equal(websiteStatus('https://www.instagram.com/test'), 'social');
  assert.equal(websiteStatus('https://instagram.com.example.org'), 'website');
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('https://user:pass@example.com'), '');
});
test('handles way centers, excludes out-of-radius and closed listings, deduplicates representations', () => {
  const duplicate = { type: 'way', id: 2, center: { lat: 52.52001, lon: 13.4 }, tags: { name: 'Example Salon', shop: 'hairdresser', phone: '123' } };
  const found = normalizeBusinesses([element(1), duplicate, element(3, { name: 'Too far' }, 53), element(4, { name: 'Closed', disused: 'yes' })], center, 1);
  assert.equal(found.length, 1); assert.equal(found[0].id, 'way/2'); assert.equal(found[0].phone, '123');
});
test('combines filters and deterministically ranks best first', () => {
  const data = normalizeBusinesses([element(1, { name: 'A', phone: '123' }), element(2, { name: 'B', brand: 'Chain' }), element(3, { name: 'C', website: 'example.com' })], center, 1);
  const found = filterBusinesses(data, { category: 'all', noWebsite: true, independent: true, contact: true, sort: 'score' });
  assert.deepEqual(found.map(b => b.name), ['A']);
  assert.deepEqual(filterBusinesses(data, { category: 'all', sort: 'score' }).map(b => b.name), ['A', 'B', 'C']);
});
test('CSV preserves notes and neutralizes spreadsheet formulas', () => {
  const [b] = normalizeBusinesses([element(1, { name: '=HYPERLINK("evil")', phone: '+49123' })], center, 1);
  const csv = toCsv([b], { [b.id]: { notes: 'A "quote", and\na new line', status: 'Contacted' } });
  assert.ok(csv.includes('"\'=HYPERLINK(""evil"")"')); assert.ok(csv.includes('"\'+49123"'));
  assert.ok(csv.includes('A ""quote"", and\na new line')); assert.ok(csv.includes('Contacted')); assert.ok(csv.includes('ODbL'));
});
test('distance is stable for coincident points and distant coordinates', () => {
  assert.equal(distanceKm(center, center), 0); assert.ok(distanceKm(center, { lat: 48.8566, lng: 2.3522 }) > 870);
});
test('priority always stays in range even for low-fit chains', () => {
  assert.equal(scoreBusiness({ websiteStatus: 'website', category: 'retail', chain: true }).score, 0);
});
test('public and political offices are not business leads', () => {
  assert.equal(normalizeBusinesses([element(1, { shop: undefined, office: 'political_party' }), element(2, { shop: undefined, office: 'government' })], center, 1).length, 0);
});
