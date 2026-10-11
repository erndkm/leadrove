import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { createAuditApi, readBody } from '../server/http.mjs';
import { createRequestLimits, localRequestOrigin, configuredOrigin } from '../server/security.mjs';
import { createStaticHandler, sensitivePath } from '../server/static.mjs';
import { requestPublic, publicUrl } from '../server/public-web.mjs';
import { launchIsolatedBrowser } from '../server/isolated-browser.mjs';
import { collectEvidence } from '../server/evidence.mjs';
import { createAuditManager } from '../server/audits.mjs';
import { safeUrl, toCsv } from '../src/model.mjs';
import { crmCsv, followupCalendar } from '../src/workflow-model.mjs';
import { cleanWorkspace } from '../src/prospect-storage.mjs';
import { chromium } from 'playwright';
import { exportProposal } from '../server/proposal-export.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const client = { 'X-Leadrove-Client': '1' };
async function directory(t) { const dir = await mkdtemp(join(tmpdir(), 'leadrove-security-')); t.after(() => rm(dir, { recursive: true, force: true })); return dir; }
async function serve(t, handler) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return `http://127.0.0.1:${server.address().port}`;
}
async function apiFixture(t, options = {}) {
  const dir = await directory(t);
  const api = createAuditApi({ directory: dir, manager: { state: async () => ({ reports: {}, providers: {} }), close() {}, start: async () => ({}), cancel: () => ({}) }, token: 'pairing-fixture', ...options });
  t.after(() => api.close());
  const base = await serve(t, (req, res) => void api.handle(req, res));
  return { base, dir, get: (headers = {}) => fetch(base + '/api/audits/state', { headers: { ...client, ...headers } }) };
}

test('API rejects navigations, foreign origins, spoofed hosts and remote sockets', async t => {
  const { base, get } = await apiFixture(t);
  assert.equal((await get()).status, 200);
  assert.equal((await fetch(base + '/api/audits/state')).status, 403);
  for (const headers of [{ Origin: 'https://evil.example' }, { Origin: 'null' }, { 'Sec-Fetch-Site': 'cross-site' }, { 'Sec-Fetch-Site': 'none' }]) assert.equal((await get(headers)).status, 403, JSON.stringify(headers));
  // fetch normalizes Host; use a raw HTTP request to exercise spoofed authorities.
  for (const host of ['localhost:1', 'evil.example', 'user@localhost']) {
    const status = await new Promise((resolve, reject) => { const req = httpRequest(base + '/api/audits/state', { headers: { ...client, Host: host } }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject); req.end(); });
    assert.equal(status, 403, host);
  }
  assert.throws(() => localRequestOrigin({ headers: { host: 'localhost:4318' }, socket: { remoteAddress: '192.168.1.2', localPort: 4318 } }), /this computer/);
  assert.equal((await get({ Origin: 'https://clientfinder.layer8problem.chatgpt.site', Authorization: 'Bearer pairing-fixture' })).status, 403, 'hosted access is opt-in');
});

test('hosted pairing requires the exact origin, token and preflight-safe client header', async t => {
  const origin = 'https://paired.example';
  const { base, get } = await apiFixture(t, { allowedOrigin: origin });
  assert.equal((await get({ Origin: origin })).status, 401);
  assert.equal((await get({ Origin: origin, Authorization: 'Bearer wrong' })).status, 401);
  const paired = await get({ Origin: origin, Authorization: 'Bearer pairing-fixture' });
  assert.equal(paired.status, 200); assert.equal(paired.headers.get('access-control-allow-origin'), origin);
  const preflight = await fetch(base + '/api/audits/state', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization,x-leadrove-client' } });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-headers'), /X-Leadrove-Client/);
  assert.equal((await fetch(base + '/api/audits/state', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'DELETE' } })).status, 405);
  for (const value of ['*', 'null', 'http://paired.example', origin + '/', origin + '/path', 'https://user:pass@paired.example']) assert.throws(() => configuredOrigin(value));
});

test('API bounds input, rejects non-objects and compressed bodies, and returns security headers', async t => {
  const { base, get } = await apiFixture(t);
  for (const body of ['null', '[]', '1', '"hello"', '{bad']) assert.equal((await fetch(base + '/api/audits/cancel', { method: 'POST', headers: { ...client, 'Content-Type': 'application/json' }, body })).status, 400);
  assert.equal((await fetch(base + '/api/audits/cancel', { method: 'POST', headers: { ...client, 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' }, body: '{}' })).status, 415);
  assert.equal((await fetch(base + '/api/audits/business-image', { method: 'POST', headers: { ...client, 'Content-Type': 'application/json' }, body: JSON.stringify({ website: 'x'.repeat(17000) }) })).status, 413);
  const response = await get();
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
});

test('body reader preserves split UTF-8 and stops stalled or oversized streams', async () => {
  const stream = new PassThrough(); stream.headers = { 'content-type': 'application/json' };
  const result = readBody(stream), data = Buffer.from('{"name":"Café"}');
  const split = data.indexOf(0xc3) + 1; stream.write(data.subarray(0, split)); stream.end(data.subarray(split));
  assert.equal((await result).name, 'Café');
  const large = new PassThrough(); large.headers = stream.headers;
  const rejected = assert.rejects(readBody(large, 10), e => e.status === 413); large.end('x'.repeat(20)); await rejected;
  const slow = new PassThrough(); slow.headers = stream.headers;
  await assert.rejects(readBody(slow, 100, 10), e => e.status === 408); slow.destroy();
});

test('Windows startup restricts existing data permissions without requiring elevation', { skip: process.platform !== 'win32' }, async t => {
  const dir = await directory(t); await writeFile(join(dir, 'token-canary'), 'fixture');
  const run = promisify(execFile), powershell = join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
  await run(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/protect-data.ps1', '-DataPath', dir], { windowsHide: true });
  const { stdout } = await run(powershell, ['-NoProfile', '-NonInteractive', '-Command', '$acl = Get-Acl -LiteralPath (Join-Path $env:LEADROVE_TEST_DIRECTORY "token-canary"); @($acl.Access | ForEach-Object { $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value }) | ConvertTo-Json -Compress'], { windowsHide: true, env: { ...process.env, LEADROVE_TEST_DIRECTORY: dir } });
  const sids = JSON.parse(stdout);
  assert.equal(sids.length, 3); assert.ok(sids.includes('S-1-5-18')); assert.ok(sids.includes('S-1-5-32-544'));
  for (const id of ['S-1-1-0', 'S-1-5-11', 'S-1-5-32-545']) assert.ok(!sids.includes(id));
  await assert.rejects(run(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/protect-data.ps1', '-DataPath', process.cwd()], { windowsHide: true }), /dedicated Leadrove data directory/);
});

test('request limits reject bursts and simultaneous costly work, then recover', async t => {
  const { get } = await apiFixture(t, { limits: createRequestLimits({ limit: 2 }) });
  assert.equal((await get()).status, 200); assert.equal((await get()).status, 200);
  const limited = await get(); assert.equal(limited.status, 429); assert.equal(limited.headers.get('retry-after'), '60');
  let now = 0; const limits = createRequestLimits({ limit: 3, now: () => now });
  const release = limits.enter('/api/audits/insights/check', 'POST');
  assert.throws(() => limits.enter('/api/audits/insights/check', 'POST'), e => e.status === 429);
  release(); limits.enter('/api/audits/insights/check', 'POST')(); now = 61000;
  limits.enter('/api/audits/state', 'GET')();
});

test('public requests reject restricted host variants and abort stalled DNS before connecting', async () => {
  for (const url of ['http://localhost.', 'http://router.home.arpa', 'http://server.localdomain', 'http://127.1', 'http://0177.0.0.1', 'http://[::ffff:7f00:1]', 'http://example.com\n', 'http://example.com/' + 'x'.repeat(3001)]) assert.throws(() => publicUrl(url));
  const controller = new AbortController();
  const result = assert.rejects(requestPublic('https://public.example', { signal: controller.signal, resolve: () => new Promise(() => {}) }), /stop DNS/);
  controller.abort(new Error('stop DNS')); await result;
});

test('private filenames, traversal and symlinks cannot escape the built asset directory', async t => {
  const dir = await directory(t), dist = join(dir, 'dist'), privateDir = join(dir, 'private');
  await mkdir(dist); await mkdir(privateDir); await writeFile(join(dist, 'index.html'), '<h1>Workspace</h1>');
  await writeFile(join(privateDir, 'secret.js'), 'SECRET CANARY');
  await symlink(privateDir, join(dist, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const base = await serve(t, createStaticHandler(dist));
  const response = await fetch(base); assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy'), /script-src 'self';/);
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  for (const path of ['/.clientfinder/connection-token', '/%2eclientfinder/reports.json', '/.env', '/.git/config', '/linked/secret.js', '/index.html:secret']) {
    const response = await fetch(base + path); assert.ok([403, 404].includes(response.status), path); assert.ok(!(await response.text()).includes('SECRET CANARY'));
  }
  for (const path of ['/@fs/C:/web/.clientfinder/reports.json?raw', '/%252eclientfinder/connection-token', '/.ENV.local?import']) assert.equal(sensitivePath(path), true);
});

test('exported CSV and calendars neutralize whitespace formulas and bare-CR property injection', () => {
  const b = { id: 'node/1', name: '  =HYPERLINK("https://evil.example")', distance: 0, websiteStatus: 'missing' };
  assert.ok(toCsv([b]).includes('"\'  =HYPERLINK'));
  assert.ok(crmCsv([{ business: b }]).includes('"\'  =HYPERLINK'));
  const calendar = followupCalendar([{ business: { ...b, name: 'Business\rBEGIN:VEVENT\rSUMMARY:Injected' }, nextDate: '2026-10-10' }]);
  assert.equal(calendar.split('\r\nBEGIN:VEVENT').length, 2);
  assert.match(calendar, /Business\\nBEGIN:VEVENT/);
  for (const value of ['javascript:alert(1)', 'java\nscript:alert(1)', 'data:text/html,evil', 'https://user:password@example.com']) assert.equal(safeUrl(value), '');
  assert.throws(() => cleanWorkspace(JSON.parse('{"version":1,"leads":{"__proto__":{"business":{"id":"__proto__","name":"bad","lat":0,"lng":0}}}}')));
  assert.equal({}.polluted, undefined);
});

test('repeated status refreshes coalesce CLI processes and use a short cooldown', async t => {
  const dir = await directory(t); let calls = 0;
  const manager = createAuditManager({ directory: dir, status: async () => { calls++; await new Promise(resolve => setTimeout(resolve, 10)); return { ready: true }; }, hasBrowser: async () => true });
  await Promise.all(Array.from({ length: 12 }, () => manager.state(true))); await manager.state(true);
  assert.equal(calls, 2); manager.close();
});

test('proposal PDF export still renders in the sandbox without running embedded content', async t => {
  const dir = await directory(t);
  const { pdf } = await exportProposal({ format: 'pdf', lead: { business: { id: 'node/1', name: '<script>alert(1)</script> Bakery', lat: 52.5, lng: 13.4, category: 'retail', website: 'javascript:alert(1)' }, proposal: { intro: '<img src="http://127.0.0.1/private">', scope: 'A small business website' } } }, dir);
  const bytes = Buffer.from(pdf, 'base64'); assert.equal(bytes.subarray(0, 5).toString(), '%PDF-'); assert.ok(bytes.length > 1000);
});

test('browser deny proxy blocks even unintercepted loopback requests while fulfilled pages render', async t => {
  let hits = 0;
  const target = await serve(t, (_req, res) => { hits++; res.end('PRIVATE'); });
  const browser = await launchIsolatedBrowser();
  try {
    const page = await browser.newPage();
    assert.equal((await page.goto(target, { timeout: 4000 })).status(), 403);
    assert.equal(hits, 0);
    await page.route('https://public.example/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Allowed content</h1>' }));
    await page.goto('https://public.example/'); assert.equal(await page.locator('h1').textContent(), 'Allowed content');
  } finally { await browser.close(); }
});

test('hostile scanned pages cannot submit data or follow redirects to local services', async t => {
  let hits = 0; const calls = [];
  const target = await serve(t, (_req, res) => { hits++; res.end('PRIVATE'); });
  const html = `<html><head><title>Security fixture</title></head><body><h1>Business</h1><img src="${target}/image"><iframe src="https://public.example/redirect"></iframe><script>fetch('${target}/post',{method:'POST',body:'attack'}).catch(()=>{});fetch('https://public.example/post',{method:'POST',body:'attack'}).catch(()=>{});new WebSocket('${target.replace('http:', 'ws:')}/ws');</script></body></html>`;
  const capture = await collectEvidence('https://public.example/', { request: async url => { calls.push(url); return url.endsWith('/redirect') ? { status: 302, headers: { location: target + '/redirected' }, body: Buffer.alloc(0) } : { status: 200, headers: { 'content-type': 'text/html' }, body: Buffer.from(html) }; } });
  assert.equal(hits, 0); assert.ok(calls.every(url => url.startsWith('https://public.example/')));
  assert.ok(!calls.some(url => url.endsWith('/post'))); assert.ok(capture.evidence.loading.blockedRequests >= 2);
  assert.equal(capture.images.length, 2); assert.match(capture.evidence.desktop.title, /Security fixture/);
});

test('development and built apps load with security policies and never request listing photos directly', async t => {
  const { createServer: createVite, build } = await import('vite');
  const dir = await directory(t), prior = process.env.CLIENTFINDER_DATA_DIR;
  process.env.CLIENTFINDER_DATA_DIR = dir;
  const dev = await createVite({ server: { host: '127.0.0.1', port: 5200, strictPort: false }, logLevel: 'silent' });
  t.after(() => dev.close());
  if (prior === undefined) delete process.env.CLIENTFINDER_DATA_DIR; else process.env.CLIENTFINDER_DATA_DIR = prior;
  await dev.listen();
  const devBase = `http://127.0.0.1:${dev.httpServer.address().port}`;
  await writeFile(join(dir, 'private-canary.json'), '{"secret":"MUST NOT BE SERVED"}');
  for (const path of [`/@fs/${dir.replaceAll('\\', '/')}/private-canary.json?raw`, '/.clientfinder/connection-token', '/%2eclientfinder/reports.json?import', '/.env', '/.git/config']) {
    const response = await fetch(devBase + path); assert.equal(response.status, 403, path); assert.ok(!(await response.text()).includes('MUST NOT BE SERVED'));
  }
  const buildDir = join(dir, 'dist');
  await build({ logLevel: 'silent', build: { outDir: buildDir } });
  const productionBase = await serve(t, createStaticHandler(buildDir));
  const browser = await chromium.launch();
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=';
  try {
    for (const base of [devBase, productionBase]) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const errors = [], directImages = []; page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => {
        window.policyViolations = []; document.addEventListener('securitypolicyviolation', e => policyViolations.push(e.violatedDirective));
        localStorage.setItem('cf:theme', '"dark"');
        localStorage.setItem('cf:last-search', JSON.stringify({ center: { lat: 52.5, lng: 13.4, label: 'Berlin' }, radius: 1.5, fetchedAt: Date.now(), businesses: [{ id: 'node/1', name: '<img src=x onerror=alert(1)> Bakery', category: 'retail', kind: 'Bakery', lat: 52.5, lng: 13.4, distance: 0, website: '', websiteStatus: 'missing', phone: '', imageUrl: 'https://photo.example/business.png', signals: [] }] }));
      });
      await page.route('**/api/audits/**', route => {
        assert.equal(route.request().headers()['x-leadrove-client'], '1');
        const path = new URL(route.request().url()).pathname;
        return route.fulfill({ json: path.endsWith('/business-image') ? { image: { dataUrl: png, url: 'https://photo.example/business.png', sourcePage: 'https://photo.example/', kind: 'listing photo' } } : path.includes('/prospects/') ? { workspace: { version: 1, leads: {}, tombstones: {}, settings: {}, settingsUpdatedAt: 0 }, research: {} } : { providers: {}, reports: {} } });
      });
      await page.route('**/*', route => { const url = route.request().url(); if (url.startsWith(base)) return route.fallback(); if (url.includes('photo.example')) directImages.push(url); return route.abort(); });
      const response = await page.goto(base);
      assert.equal(response.status(), 200);
      await page.locator('.business-row').first().waitFor();
      await page.waitForFunction(() => document.querySelector('.business-thumbnail')?.naturalWidth > 0);
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
      assert.deepEqual(directImages, []);
      assert.equal(await page.locator('.business-row img:not(.business-thumbnail)').count(), 0, 'business name stays plain text');
      await page.getByRole('button', { name: 'Today', exact: true }).click();
      await page.locator('.today-workspace').waitFor();
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(await page.evaluate(() => window.policyViolations), []);
      if (base === productionBase) {
        await page.evaluate(() => { const script = document.createElement('script'); script.textContent = 'window.injected = true'; document.head.append(script); });
        await page.waitForFunction(() => window.policyViolations.length > 0);
        assert.equal(await page.evaluate(() => window.injected), undefined);
      }
      assert.deepEqual(errors, []); await page.close();
    }
  } finally { await browser.close(); }
});
