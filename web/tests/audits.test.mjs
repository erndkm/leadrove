import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, request as httpRequest } from 'node:http';
import { isPublicAddress, publicUrl, requestPublic } from '../server/public-web.mjs';
import { scanTargets, createAuditManager } from '../server/audits.mjs';
import { createAuditApi } from '../server/http.mjs';
import { validateReport } from '../server/report.mjs';
import { subscriptionEnvironment, parseClaudeOutput, claudeMessage } from '../server/providers.mjs';
import { attachAudits, auditKey, auditResultLabel } from '../src/audit-model.mjs';
import { filterBusinesses, toCsv } from '../src/model.mjs';

const business = (name, website, websiteStatus = 'website') => ({ id: name, name, website, websiteStatus, distance: 1, score: 40, kind: 'Shop', category: 'retail' });
const report = () => ({ summary: 'The homepage has several opportunities.', categories: Object.fromEntries(['ui', 'seo', 'safety', 'accessibility', 'performance'].map(key => [key, { score: 60, rationale: 'Based on observed evidence.' }])), findings: [{ category: 'seo', severity: 'medium', title: 'Missing description', evidence: 'No description meta tag was observed.', recommendation: 'Add a descriptive summary.' }], strengths: ['Clear business name.'], limitations: ['Homepage only.'] });
const ready = async () => ({ installed: true, ready: true });
const capture = async website => ({ evidence: { finalUrl: website, limitations: ['Homepage only.'] }, images: [] });
const waitUntil = async predicate => { for (let i = 0; i < 100; i++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); } throw new Error('Timed out waiting for test job'); };
async function setupManager(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'clientfinder-test-'));
  const manager = createAuditManager({ directory, capture, review: async () => validateReport(report()), status: ready, hasBrowser: async () => true, ...options });
  t.after(async () => { manager.close(); await rm(directory, { recursive: true, force: true }); });
  return { manager, directory };
}

test('blocks local, private, metadata, reserved and mapped IPv6 network addresses', () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '172.16.5.4', '192.168.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', 'fe80::1', 'fc00::1', '::ffff:127.0.0.1', '2001:db8::1']) assert.equal(isPublicAddress(address), false, address);
  for (const address of ['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111']) assert.equal(isPublicAddress(address), true, address);
  for (const url of ['file:///secret', 'http://localhost', 'http://2130706433', 'http://0x7f000001', 'http://[::1]', 'https://example.com:8080', 'https://user:pass@example.com', 'http://host.local']) assert.throws(() => publicUrl(url), undefined, url);
});
test('rejects any private DNS answer before opening a socket, including a mixed answer', async () => {
  await assert.rejects(requestPublic('https://example.com', { resolve: async () => [{ address: '1.1.1.1', family: 4 }, { address: '127.0.0.1', family: 4 }] }), /restricted/);
});
test('deduplicates websites, excludes missing and social listings, preserves invalid URLs as failures', () => {
  const targets = scanTargets([business('A', 'https://example.com'), business('B', 'https://example.com/#contact'), business('C', '', 'missing'), business('D', 'https://instagram.com/a', 'social'), business('E', 'http://localhost')]);
  assert.equal(targets.length, 2); assert.equal(targets[0].website, 'https://example.com/'); assert.equal(targets[1].website, 'http://localhost/');
  assert.throws(() => scanTargets([]));
});
test('validates all category scores and evidence instead of accepting plausible-looking AI JSON', () => {
  const value = report();
  assert.equal(validateReport(value).qualityScore, 60);
  value.categories.ui.score = 101; assert.throws(() => validateReport(value), /invalid category/);
  value.categories.ui.score = 60; value.findings[0].evidence = ''; assert.throws(() => validateReport(value), /invalid findings/);
});
test('weakest first sorting keeps unaudited websites behind rated ones and exports real audit data', () => {
  const strong = { ...validateReport(report()), qualityScore: 85, provider: 'codex' };
  const weak = { ...validateReport(report()), qualityScore: 25, provider: 'codex' };
  const data = attachAudits([business('Unrated', 'https://unrated.com'), business('Strong', 'https://strong.com'), business('Weak', 'https://weak.com')], { [auditKey('https://strong.com')]: strong, [auditKey('https://weak.com')]: weak });
  assert.deepEqual(filterBusinesses(data, { category: 'all', sort: 'website' }).map(b => b.name), ['Weak', 'Strong', 'Unrated']);
  assert.match(toCsv(data), /Website quality \/100/); assert.match(toCsv(data), /Missing description/);
});
test('CLI environment excludes API keys and alternate billing providers', () => {
  const env = subscriptionEnvironment({ PATH: 'binary', HOME: '/home/user', OPENAI_API_KEY: 'secret', CODEX_API_KEY: 'secret', ANTHROPIC_API_KEY: 'secret', ANTHROPIC_AUTH_TOKEN: 'secret', AWS_ACCESS_KEY_ID: 'secret', CLAUDE_CODE_USE_BEDROCK: '1' });
  assert.equal(env.PATH, 'binary'); assert.equal(env.HOME, '/home/user'); assert.equal(JSON.stringify(env).includes('secret'), false); assert.equal(env.CLAUDE_CODE_USE_BEDROCK, undefined);
});
test('accessible audit labels include live and failed review states, even with a previous rating', () => {
  const b = { ...business('Example', 'https://example.com/'), audit: { qualityScore: 60 } };
  const job = { status: 'running', items: [{ website: b.website, status: 'reviewing' }] };
  assert.match(auditResultLabel(b, job), /reviewing, last website quality 60/);
  job.status = 'completed'; job.items[0].status = 'failed';
  assert.match(auditResultLabel(b, job), /failed, last website quality 60/);
  assert.equal(auditResultLabel(b, null), 'website quality 60 out of 100');
});
test('Claude protocol carries screenshots and rejects error results', () => {
  const message = JSON.parse(claudeMessage('Review evidence', [Buffer.from('image')]));
  assert.equal(message.message.content[1].source.data, Buffer.from('image').toString('base64'));
  assert.deepEqual(parseClaudeOutput(JSON.stringify({ type: 'result', subtype: 'success', structured_output: report() })), report());
  assert.throws(() => parseClaudeOutput('{"type":"result","is_error":true}'));
});
test('queue continues after an unreachable website and persists completed reports', async t => {
  const { manager, directory } = await setupManager(t, { review: async () => ({ ...validateReport(report()), usage: { inputTokens: 9000, outputTokens: 1000, totalTokens: 10000 } }), capture: async website => { if (website.includes('bad')) throw new Error('Website unavailable.'); return capture(website); } });
  await manager.start({ provider: 'codex', businesses: [business('Bad', 'https://bad.example.com'), business('Good', 'https://good.example.com')] });
  await waitUntil(async () => (await manager.state()).job.status !== 'running');
  const state = await manager.state();
  assert.deepEqual(state.job.items.map(i => i.status), ['failed', 'completed']);
  const restored = createAuditManager({ directory, status: ready, hasBrowser: async () => true });
  assert.equal((await restored.state()).reports['https://good.example.com/'].qualityScore, 60);
  assert.equal(state.job.items[1].usage.totalTokens, 10000);
  assert.equal((await restored.state()).reports['https://good.example.com/'].usage.totalTokens, 10000);
});
test('provider failure stops remaining requests and preserves older successful reports', async t => {
  let fail = false, calls = 0;
  const { manager } = await setupManager(t, { review: async () => { calls++; if (fail) throw new Error('Subscription usage limit reached.'); return validateReport(report()); } });
  await manager.start({ provider: 'codex', businesses: [business('A', 'https://a.example.com')] });
  await waitUntil(async () => (await manager.state()).job.status !== 'running');
  fail = true;
  await manager.start({ provider: 'codex', businesses: [business('A', 'https://a.example.com'), business('B', 'https://b.example.com')] });
  await waitUntil(async () => (await manager.state()).job.status !== 'running');
  const state = await manager.state();
  assert.equal(state.job.status, 'failed'); assert.deepEqual(state.job.items.map(i => i.status), ['failed', 'cancelled']); assert.equal(calls, 2); assert.ok(state.reports['https://a.example.com/']);
});
test('cancellation stops the active capture and never starts the next website', async t => {
  let captures = 0;
  const { manager } = await setupManager(t, { capture: async (_, { signal }) => { captures++; await new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true })); } });
  await manager.start({ provider: 'codex', businesses: [business('A', 'https://a.example.com'), business('B', 'https://b.example.com')] });
  await assert.rejects(manager.start({ provider: 'codex', businesses: [business('C', 'https://c.example.com')] }), /already running/);
  manager.cancel(); await waitUntil(async () => (await manager.state()).job.status !== 'running');
  assert.equal(captures, 1); assert.equal((await manager.state()).job.status, 'cancelled');
});
test('API rejects cross-origin and DNS-rebinding requests and requires a token for the hosted site', async t => {
  const { manager, directory } = await setupManager(t);
  const allowedOrigin = 'https://clientfinder.example.com';
  const api = createAuditApi({ directory, manager, allowedOrigin, token: 'test-connection-token' });
  const server = createServer((req, res) => { void api.handle(req, res); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/audits`;
  assert.equal((await fetch(`${base}/state`, { headers: { Origin: 'https://evil.example' } })).status, 403);
  const rebindingStatus = await new Promise((resolve, reject) => {
    const request = httpRequest(`${base}/state`, { headers: { Host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); });
    request.on('error', reject); request.end();
  });
  assert.equal(rebindingStatus, 403);
  assert.equal((await fetch(`${base}/state`, { headers: { Origin: allowedOrigin, 'X-Leadrove-Client': '1' } })).status, 401);
  const paired = await fetch(`${base}/state`, { headers: { 'X-Leadrove-Client': '1', Origin: allowedOrigin, Authorization: 'Bearer test-connection-token' } });
  assert.equal(paired.status, 200); assert.equal(paired.headers.get('access-control-allow-origin'), allowedOrigin);
  assert.equal((await fetch(`${base}/state`, { headers: { 'X-Leadrove-Client': '1' } })).status, 200);
  assert.equal((await fetch(`${base}/scan`, { method: 'POST', headers: { 'X-Leadrove-Client': '1', 'content-type': 'text/plain' }, body: '{}' })).status, 415);
});
