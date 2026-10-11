import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DEFAULT_PROFILE, estimatePrice, effectiveBusiness, prospectFor, dailyShortlist, dayKey, addDays } from '../src/prospect-model.mjs';
import { cleanLead, cleanWorkspace, mergeWorkspace } from '../src/prospect-storage.mjs';
import { identityCheck, verifyResearch, validateResearch } from '../server/prospect-research.mjs';
import { createProspectManager } from '../server/prospects.mjs';
import { toCsv } from '../src/model.mjs';

const now = new Date('2026-10-09T12:00:00Z');
const business = (id = 'node/1') => ({ id, name: 'Mitte Plumbing', kind: 'Plumber', category: 'trades', lat: 52.52, lng: 13.4, distance: .1, website: '', websiteStatus: 'missing', phone: '030 12345678', email: '', address: 'Beispielweg 27, 10119 Berlin', source: 'https://www.openstreetmap.org/node/1' });
const verified = (patch = {}) => ({ status: 'Qualified', verification: { checkedAt: now.toISOString(), presence: 'no-website', website: '', phone: '030 12345678', active: true, contactChecked: true, sourceUrl: 'https://example.org/contact' }, ...patch });
function enriched(b = business(), lead = verified()) { const effective = effectiveBusiness(b, lead); return { ...effective, prospect: prospectFor(effective, lead, DEFAULT_PROFILE, null, now) }; }
const blank = () => ({ version: 1, leads: {}, tombstones: {}, settings: DEFAULT_PROFILE, settingsUpdatedAt: 0 });

test('niche quotes include a delivery floor, scope and an explicit user override', () => {
  const food = estimatePrice({ category: 'food' }), trades = estimatePrice({ category: 'trades' });
  assert.ok(trades.suggested > food.suggested);
  assert.equal(food.scope, 'standard');
  const compact = estimatePrice({ category: 'food' }, DEFAULT_PROFILE, { scope: 'compact' });
  assert.ok(compact.low >= 1200); assert.ok(compact.high <= food.high);
  assert.equal(estimatePrice({ category: 'food' }, DEFAULT_PROFILE, { quote: '1850' }).suggested, 1850);
  assert.equal(estimatePrice({ category: 'food' }, DEFAULT_PROFILE, { quote: '' }).custom, false);
  assert.equal(estimatePrice({ category: 'food' }, DEFAULT_PROFILE, { quote: -99 }).custom, false);
  assert.equal(estimatePrice({ category: 'unknown' }).currency, 'EUR');
});
test('missing directory website alone never produces a ready prospect', () => {
  const p = prospectFor(business(), {}, DEFAULT_PROFILE, null, now);
  assert.equal(p.ready, false); assert.equal(p.verified, false); assert.ok(p.score < 70);
  assert.equal(enriched().prospect.ready, true);
});
test('verification must be recent, consistent and include a usable contact', () => {
  const b = business();
  assert.equal(enriched(b, verified({ verification: { ...verified().verification, checkedAt: '2026-01-01T00:00:00Z' } })).prospect.ready, false);
  assert.equal(enriched(b, verified({ verification: { ...verified().verification, presence: 'website' } })).prospect.verified, false);
  assert.equal(enriched({ ...b, phone: '' }, verified({ verification: { ...verified().verification, phone: '' } })).prospect.ready, false);
  assert.equal(enriched(b, verified({ verification: { ...verified().verification, contactChecked: false } })).prospect.verified, false);
});
test('manually corrected URLs replace listing and research URLs', () => {
  const b = { ...business(), website: 'https://wrong.example', websiteStatus: 'website' };
  assert.equal(effectiveBusiness(b, { verification: { website: 'https://correct.example' } }, { identityMatched: true, website: 'https://ai.example' }).website, 'https://correct.example/');
  assert.equal(effectiveBusiness(b, verified()).websiteStatus, 'missing');
  assert.equal(effectiveBusiness(b, { verification: { website: '', phone: '', email: 'checked@example.org' } }).phone, '');
  assert.equal(effectiveBusiness(b, {}, { identityMatched: true, website: 'https://example.org', phone: '', email: 'checked@example.org' }).phone, '');
});
test('AI website match needs contact evidence and a specific, current audit issue', () => {
  const b = { ...business(), website: 'https://example.org', websiteStatus: 'website' };
  const research = { identityMatched: true, contactMatched: true, checkedAt: now.toISOString() };
  assert.equal(prospectFor(b, {}, DEFAULT_PROFILE, research, now).ready, false);
  const audit = { scannedAt: now.toISOString(), findings: [{ severity: 'high', title: 'Broken contact link', evidence: 'The contact page returned 404.', recommendation: 'Repair the contact link.' }] };
  assert.equal(prospectFor({ ...b, audit }, {}, DEFAULT_PROFILE, research, now).ready, true);
  assert.equal(prospectFor({ ...b, audit }, {}, DEFAULT_PROFILE, { ...research, contactMatched: false }, now).ready, false);
});
test('daily shortlist respects exclusions, future follow-ups, today completion and the ten-lead limit', () => {
  const saved = {}, businesses = Array.from({ length: 20 }, (_, i) => {
    const b = { ...business(`node/${i}`), name: `Business ${i}`, phone: `030 1234${1000 + i}` };
    saved[b.id] = verified(); return enriched(b, saved[b.id]);
  });
  saved['node/0'].nextDate = '2026-10-10';
  saved['node/1'].completedDate = '2026-10-09';
  businesses[2].prospect.ready = false;
  const shortlist = dailyShortlist(businesses, saved, '2026-10-09');
  assert.equal(shortlist.length, 10); assert.ok(!shortlist.some(b => ['node/0', 'node/1', 'node/2'].includes(b.id)));
  const excluded = enriched(business(), verified({ status: 'Do not contact' }));
  assert.equal(excluded.prospect.ready, false); assert.equal(excluded.prospect.excluded, true);
});
test('same-domain businesses do not fill the shortlist multiple times', () => {
  const b = enriched(), c = enriched({ ...business('node/2'), name: 'Another branch' });
  for (const item of [b, c]) { item.website = 'https://www.example.org/a'; item.websiteStatus = 'website'; }
  assert.equal(dailyShortlist([b, c], {}, '2026-10-09').length, 1);
});
test('identity verification rejects similarly named businesses at a different address', () => {
  const b = business();
  const result = { phone: '030 12345678', email: 'office@example.org' };
  assert.equal(identityCheck(b, result, 'Mitte Plumbing in Hamburg, hello@example.org').identityMatched, false);
  const match = identityCheck(b, result, 'Mitte Plumbing Beispielweg 27, 10119 Berlin. Telefon 030 12345678 office@example.org');
  assert.equal(match.identityMatched, true); assert.equal(match.contactMatched, true);
  assert.equal(match.email, 'office@example.org');
  assert.equal(identityCheck(b, { ...result, email: 'guessed@example.org' }, 'Mitte Plumbing Beispielweg 27, 10119 Berlin').email, '');
});
test('research validates URLs and independently checks redirected source pages', async () => {
  assert.throws(() => validateResearch({ website: 'http://127.0.0.1', contactUrl: '', phone: '', email: '', summary: '', sources: [] }));
  const result = await verifyResearch(business(), { website: 'https://example.org', contactUrl: '', phone: '030 12345678', email: '' }, { request: async () => ({ status: 200, headers: { 'content-type': 'text/html' }, body: Buffer.from('<h1>Mitte Plumbing</h1><p>Beispielweg 27, 10119 Berlin. 030 12345678</p>') }) });
  assert.equal(result.identityMatched, true); assert.equal(result.contactMatched, true);
  await assert.rejects(() => verifyResearch(business(), { website: 'https://example.org' }, { request: async () => ({ status: 302, headers: { location: 'http://127.0.0.1/private' } }) }));
});
test('workspace merging preserves newer edits and tombstones across old backups', () => {
  const first = cleanLead({ business: business(), notes: 'old', savedAt: 100, updatedAt: 100 });
  const newer = { ...first, notes: 'new', updatedAt: 200 };
  const a = { ...blank(), leads: { [first.business.id]: newer } };
  const b = { ...blank(), leads: { [first.business.id]: first } };
  assert.equal(mergeWorkspace(a, b).leads[first.business.id].notes, 'new');
  assert.equal(Object.keys(mergeWorkspace({ ...blank(), tombstones: { [first.business.id]: 300 } }, b).leads).length, 0);
  assert.throws(() => cleanWorkspace({ version: 5, leads: {} }));
  assert.throws(() => cleanLead({ business: { ...business(), id: '__proto__' } }));
});
test('lead store survives restart, includes backup, and completed research is durable', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'leadrove-prospects-test-'));
  const options = { directory, status: async () => ({ ready: true }), discover: async () => ({ website: '', summary: 'Could not establish an official site.', sources: [] }), verify: async (_b, r) => ({ ...r, identityMatched: false, contactMatched: false }) };
  const manager = createProspectManager(options);
  t.after(async () => { manager.close(); await rm(directory, { recursive: true, force: true }); });
  const lead = cleanLead({ business: business(), notes: 'Keep this', updatedAt: 100 });
  await manager.save({ ...blank(), leads: { [lead.business.id]: lead } });
  await manager.start({ businesses: [business()], provider: 'codex' });
  for (let i = 0; i < 100 && (await manager.state()).job.status === 'running'; i++) await new Promise(r => setTimeout(r, 10));
  assert.equal((await manager.state()).job.status, 'completed');
  await new Promise(r => setTimeout(r, 30));
  const reopened = createProspectManager(options);
  assert.equal((await reopened.state()).workspace.leads[lead.business.id].notes, 'Keep this');
  assert.equal((await reopened.state()).research[lead.business.id].identityMatched, false);
  assert.ok(await readFile(join(directory, 'prospects.json.bak'), 'utf8')); reopened.close();
});
test('CSV includes actionable quotes and follow-up fields without executing formulas', () => {
  const b = enriched(); b.name = '=HYPERLINK("evil")';
  const csv = toCsv([b], { [b.id]: verified({ nextAction: 'Call', nextDate: '2026-10-10' }) });
  assert.match(csv, /Suggested website quote/); assert.match(csv, /2026-10-10/); assert.match(csv, /'=HYPERLINK/);
});
test('local calendar helpers cross month boundaries correctly', () => {
  assert.equal(dayKey(new Date(2026, 9, 9)), '2026-10-09');
  assert.equal(addDays(3, new Date(2026, 9, 30)), '2026-11-02');
});
