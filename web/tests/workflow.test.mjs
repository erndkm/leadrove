import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanWorkspace, cleanLead, mergeWorkspace } from '../src/prospect-storage.mjs';
import { compareSearch, snapshotOf, watchlistBusiness, pipelineStats, crmCsv, followupCalendar, defaultFindings, buildBrief } from '../src/workflow-model.mjs';
import { proposalDocument } from '../src/proposal-document.mjs';
import { inspectOpportunity, classifyPresence, detectTechnologies, fetchPublicPage, normalizePageSpeed, normalizeEmailCheck, loadScreenshots } from '../server/opportunities.mjs';
import { prospectFor } from '../src/prospect-model.mjs';

const business = { id: 'node/1', name: 'Example Salon', website: 'https://example.com/', websiteStatus: 'website', category: 'beauty', kind: 'Salon', lat: 52, lng: 13, phone: '+49 301234567', email: 'hello@example.com', address: 'Example Street 1' };
const now = new Date().toISOString();
const html = (body, status = 200) => ({ status, body: Buffer.from(body), headers: { 'content-type': 'text/html' } });
const workspace = leads => cleanWorkspace({ version: 1, leads });
test('watchlists and report edits survive backup normalization and deletion wins over older snapshots', () => {
  const a = cleanWorkspace({ version: 1, leads: { [business.id]: { business, updatedAt: 10, proposal: { language: 'de', intro: 'Hello', findings: [{ title: 'Issue', evidence: 'Checked', recommendation: 'Fix' }] }, actualValue: 4500, dealCurrency: 'GBP' } }, watchlists: { one: { id: 'one', name: 'Local salons', center: { lat: 52, lng: 13 }, radius: 2, updatedAt: 20, snapshot: snapshotOf([business]) } } });
  assert.equal(a.leads[business.id].proposal.language, 'de');
  assert.equal(a.leads[business.id].actualValue, 4500);
  const restored = watchlistBusiness(a.watchlists, business.id);
  assert.equal(cleanLead({ business: restored }).business.name, business.name);
  assert.equal(restored.category, 'beauty');
  assert.equal(restored.websiteStatus, 'website');
  assert.equal(watchlistBusiness(a.watchlists, 'node/missing'), null);
  const b = { ...workspace({}), watchlistTombstones: { one: 25 } };
  assert.equal(Object.keys(mergeWorkspace(a, b).watchlists).length, 0);
  assert.equal(Object.keys(mergeWorkspace(b, a).watchlists).length, 0);
});
test('saved search comparison separates new, edited and absent listings without inferring closure', () => {
  const old = snapshotOf([business, { ...business, id: 'node/2', name: 'Other' }]);
  const changes = compareSearch(old, [{ ...business, phone: 'changed' }, { ...business, id: 'node/3' }]);
  assert.deepEqual(changes.map(c => c.type), ['changed', 'new', 'not-returned']);
  assert.match(changes[2].detail, /not proof of closure/);
  assert.deepEqual(compareSearch(old, [business, { ...business, id: 'node/2', name: 'Other' }]), []);
});
test('presence checks distinguish access blocks, failures, parking and placeholders', () => {
  const response = body => ({ ...html(body), html: body });
  assert.equal(classifyPresence(response('<h1>This domain is for sale</h1>')), 'parked');
  assert.equal(classifyPresence(response('<h1>Coming soon</h1>')), 'placeholder');
  assert.equal(classifyPresence({ ...response('Denied'), status: 403 }), 'blocked');
  assert.equal(classifyPresence({ ...response('Missing'), status: 404 }), 'unreachable');
  assert.deepEqual(detectTechnologies('<script src="/wp-content/app.js"></script>'), ['WordPress']);
});
test('journey checks mark only clear missing destinations as broken and keep unknown links unconfirmed', async () => {
  const request = async url => url.endsWith('/book') ? html('not found', 404) : html('<html><title>Salon</title><a href="/book">Book appointment</a><a href="mailto:hello@example.com">Contact</a><p>Our salon welcomes you.</p></html>');
  const result = await inspectOpportunity(business, { request });
  assert.equal(result.journeys.find(j => j.id === 'booking').state, 'broken');
  assert.equal(result.journeys.find(j => j.id === 'services').state, 'not-observed');
  assert.equal(result.contacts[0].value, 'hello@example.com');
  assert.equal(result.presence, 'live');
  assert.equal(result.screenshotId, '');
});
test('redirected journey pages cannot reach private services', async () => {
  let calls = 0;
  await assert.rejects(fetchPublicPage(business.website, { request: async () => { calls++; return { status: 302, headers: { location: 'http://127.0.0.1/' }, body: Buffer.alloc(0) }; } }), /Private and local/);
  assert.equal(calls, 1);
});
test('unlisted websites are not converted to confirmed absence and failed requests remain uncertain', async () => {
  const a = await inspectOpportunity({ ...business, website: '' }); assert.equal(a.presence, 'unlisted');
  const b = await inspectOpportunity(business, { request: async () => { throw new Error('DNS failure'); } });
  assert.equal(b.presence, 'unreachable'); assert.match(b.detail, /does not establish permanent/);
});
test('a fresh broken journey becomes a qualified opportunity only after independent identity verification', () => {
  const lead = cleanLead({ business, insight: { website: business.website, checkedAt: now, journeys: [{ id: 'booking', label: 'Booking link', state: 'broken', evidence: 'HTTP 404' }] } });
  assert.equal(prospectFor(business, lead).ready, false);
  lead.verification = { presence: 'website', website: business.website, sourceUrl: business.website, active: true, contactChecked: true, checkedAt: now };
  assert.equal(prospectFor(business, lead).ready, true);
  assert.equal(prospectFor({ ...business, website: 'https://other.example.com/' }, lead).finding, null);
});
test('PageSpeed keeps field data unavailable and never invents a zero performance score', () => {
  const result = normalizePageSpeed({ lighthouseResult: { categories: { performance: { score: null } }, audits: { 'largest-contentful-paint': { numericValue: 2200 } } } }, business.website);
  assert.equal(result.performance, null); assert.equal(result.fieldScope, 'unavailable'); assert.equal(result.lab.lcp, 2200); assert.equal(result.field.inp, null);
  const measured = normalizePageSpeed({ lighthouseResult: { categories: { performance: { score: .82 } } }, originLoadingExperience: { metrics: { CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 12 }, INTERACTION_TO_NEXT_PAINT: { percentile: 180 } } } }, business.website);
  assert.equal(measured.fieldScope, 'origin'); assert.equal(measured.field.cls, .12); assert.equal(measured.performance, 82);
});
test('mailbox results must match the queried address and ambiguous statuses remain unknown', () => {
  assert.throws(() => normalizeEmailCheck({ data: [{ query: 'other@example.com', status: 'RECEIVING' }] }, business.email));
  assert.equal(normalizeEmailCheck({ data: [{ query: business.email, status: 'UNKNOWN' }] }, business.email).status, 'unknown');
  assert.equal(normalizeEmailCheck({ data: [{ query: business.email, status: 'RECEIVING' }] }, business.email).status, 'valid');
});
test('pipeline reports actual won value by currency, preserves prior progress after loss, and flags missing values', () => {
  const leads = [{ business, status: 'Won', actualValue: 4000, dealCurrency: 'EUR' }, { business, status: 'Won', actualValue: '', dealCurrency: 'USD' }, { business, status: 'Lost', history: [{ text: 'Status: Replied' }] }];
  const result = pipelineStats(leads); assert.equal(result.counts.Contacted, 3); assert.equal(result.counts.Replied, 3); assert.equal(result.counts.Won, 2); assert.deepEqual(result.revenue, { EUR: 4000 }); assert.equal(result.unvaluedWins, 1);
});
test('CRM and calendar exports escape untrusted fields, omit closed follow-ups and fold long calendar lines', () => {
  const lead = cleanLead({ business: { ...business, name: '=SUM(A1)' }, status: 'Contacted', nextDate: '2026-10-10', nextAction: 'Hello;\nBEGIN:VTODO', notes: '@cmd' });
  assert.match(crmCsv([lead]), /'=SUM/); assert.match(crmCsv([lead]), /'@cmd/);
  const calendar = followupCalendar([lead, { ...lead, status: 'Won' }]); assert.equal(calendar.split('BEGIN:VEVENT').length - 1, 1); assert.match(calendar, /Hello\\;\\nBEGIN:VTODO/);
});
test('reports are self-contained, escape malicious content, and preserve German labels and edited evidence', () => {
  const document = proposalDocument({ business: { ...business, name: '<script>alert(1)</script>' }, proposal: { language: 'de', findings: [{ title: '<img src=x onerror=alert(1)>', evidence: 'Checked by hand', recommendation: 'Fix' }], scope: 'Website', nextStep: 'Call me' }, price: { suggested: 2500, currency: 'EUR' }, checkedAt: now });
  assert.doesNotMatch(document, /<script>|onerror=alert\(1\)>/); assert.match(document, /&lt;script&gt;/); assert.match(document, /Projektangebot/); assert.match(document, /Checked by hand/); assert.match(document, /default-src 'none'/);
});
test('design briefs do not reuse stale website findings and support an editable German brief', () => {
  const lead = cleanLead({ business, insight: { website: 'https://other.example.com/', checkedAt: now, journeys: [{ state: 'broken', label: 'Wrong website', evidence: '404' }] } });
  assert.deepEqual(defaultFindings(business, lead), []); assert.match(buildBrief(business, lead, 'de'), /Website-Briefing/);
});
test('evidence images are stored separately and screenshot lookup rejects path traversal', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'leadrove-workflow-'));
  try { const result = await inspectOpportunity(business, { directory, request: async () => html('<html><h1>Example Salon</h1></html>'), capture: async () => ({ images: [Buffer.from('desktop'), Buffer.from('mobile')], evidence: { mobile: { width: 390 } } }) }); assert.equal(result.screenshotId.length, 64); assert.equal((await loadScreenshots(directory, result.screenshotId)).images.length, 2); assert.deepEqual((await loadScreenshots(directory, '../reports')).images, []); } finally { await rm(directory, { recursive: true, force: true }); }
});
