import { chromium } from 'playwright';
import { requestPublic, publicUrl } from './public-web.mjs';
import { inspectMobile } from './mobile-evidence.mjs';
import { launchIsolatedBrowser } from './isolated-browser.mjs';

export async function browserAvailable() {
  const { access } = await import('node:fs/promises');
  try { await access(chromium.executablePath()); return true; } catch { return false; }
}

export async function collectEvidence(website, { signal, request = requestPublic } = {}) {
  publicUrl(website);
  signal?.throwIfAborted();
  const browser = await launchIsolatedBrowser();
  const close = () => { void browser.close().catch(() => {}); };
  signal?.addEventListener('abort', close, { once: true });
  const captureSignal = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(60000)]);
  captureSignal.addEventListener('abort', close, { once: true });
  let requests = 0, bytes = 0, blockedRequests = 0, active = 0;
  const waiting = [];
  const acquire = () => active < 6 ? (active++, Promise.resolve()) : new Promise(resolve => waiting.push(resolve));
  const release = () => { const next = waiting.shift(); if (next) next(); else active--; };
  try {
    signal?.throwIfAborted();
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', acceptDownloads: false, permissions: [] });
    await context.routeWebSocket('**/*', socket => socket.close());
    await context.route('**/*', async route => {
      let acquired = false;
      try {
        // Public pages and assets only: no form submissions, cookies, credentials,
        // local-network requests, media downloads, or uncontrolled redirects.
        if (++requests > 180 || bytes > 35_000_000 || route.request().method() !== 'GET' || ['media', 'websocket'].includes(route.request().resourceType())) throw new Error('Request outside audit scope');
        await acquire(); acquired = true;
        if (bytes > 35_000_000 || !browser.isConnected()) throw new Error('Capture finished');
        publicUrl(route.request().url());
        const response = await request(route.request().url(), { signal: captureSignal });
        bytes += response.body.length;
        const headers = Object.fromEntries(Object.entries(response.headers).filter(([key]) => !['set-cookie', 'transfer-encoding', 'connection', 'content-length'].includes(key)).map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : String(value)]));
        await route.fulfill({ status: response.status, headers, body: response.body });
      } catch { blockedRequests++; await route.abort().catch(() => {}); }
      finally { if (acquired) release(); }
    });
    const page = await context.newPage();
    context.on('page', other => { if (other !== page) void other.close().catch(() => {}); });
    page.setDefaultTimeout(12_000);
    page.on('dialog', dialog => dialog.dismiss());
    const started = Date.now();
    const response = await page.goto(website, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    if (!response || response.status() >= 400) throw new Error(`Website could not be reviewed${response ? ` (HTTP ${response.status()})` : ''}.`);
    if (!/text\/html|application\/xhtml/i.test(response.headers()['content-type'] || '')) throw new Error('The website did not return an HTML page.');
    await page.waitForLoadState('load', { timeout: 6000 }).catch(() => {});
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    const documentLoadMs = Date.now() - started;
    const inspect = () => {
      const all = selector => [...document.querySelectorAll(selector)];
      const text = node => (node?.textContent || '').replace(/\s+/g, ' ').trim();
      const visible = node => { const r = node.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const images = all('img');
      const inputs = all('input:not([type=hidden]), select, textarea');
      const sample = all('p, a, button, label, h1, h2').filter(visible).slice(0, 100);
      return {
        title: document.title.slice(0, 300), language: document.documentElement.lang.slice(0, 100),
        description: (document.querySelector('meta[name="description" i]')?.content || '').slice(0, 2000),
        robots: (document.querySelector('meta[name="robots" i]')?.content || '').slice(0, 2000),
        canonical: (document.querySelector('link[rel="canonical" i]')?.href || '').slice(0, 2000),
        viewport: (document.querySelector('meta[name="viewport" i]')?.content || '').slice(0, 2000),
        headings: all('h1, h2, h3').slice(0, 35).map(node => ({ level: node.tagName, text: text(node).slice(0, 180) })),
        images: { total: images.length, missingAlt: images.filter(node => !node.hasAttribute('alt')).length, broken: images.filter(node => node.complete && !node.naturalWidth).length },
        controls: { total: inputs.length, withoutLabel: inputs.filter(node => !node.labels?.length && !node.getAttribute('aria-label') && !node.getAttribute('aria-labelledby') && !['submit', 'button'].includes(node.type)).length },
        links: all('a[href]').slice(0, 50).map(node => ({ text: text(node).slice(0, 100), href: node.href.slice(0, 500) })),
        structuredDataBlocks: all('script[type="application/ld+json"]').length,
        insecureResources: all('script[src], link[rel=stylesheet][href], img[src], iframe[src]').filter(node => /^(http:)/i.test(node.src || node.href)).length,
        insecureFormActions: all('form[action]').filter(node => /^http:/i.test(node.action)).length,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 4,
        smallTextSamples: sample.filter(node => parseFloat(getComputedStyle(node).fontSize) < 12).length,
        visibleText: (document.body?.innerText || '').slice(0, 14_000),
      };
    };
    const desktop = await page.evaluate(inspect);
    // A viewport capture keeps image size predictable; do not claim a full-site review.
    const desktopImage = await page.screenshot({ type: 'png', animations: 'disabled', timeout: 10_000 });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const mobile = await page.evaluate(inspectMobile);
    const mobileImage = await page.screenshot({ type: 'png', animations: 'disabled', timeout: 10_000 });
    await page.setViewportSize({ width: 320, height: 740 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const narrow = await page.evaluate(inspectMobile);
    mobile.narrow = { width: narrow.width, horizontalOverflow: narrow.horizontalOverflow };
    const finalUrl = page.url();
    const headers = response.headers();
    return {
      evidence: { requestedUrl: website, finalUrl, checkedAt: new Date().toISOString(), httpStatus: response.status(), https: finalUrl.startsWith('https:'),
        headers: Object.fromEntries(['strict-transport-security', 'content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'permissions-policy', 'x-robots-tag'].map(key => [key, headers[key] || null])),
        desktop, mobile,
        loading: { documentLoadMs, requests, bytes, blockedRequests },
        limitations: ['Homepage and two viewport screenshots only.', 'Isolated browser with no login, cookies, form submissions or consent clicks; blocked assets may affect appearance.', 'Single local load through an inspection proxy, not a Lighthouse or Core Web Vitals measurement.', 'Passive HTTPS and header observations only; no vulnerability testing or safety certification.'],
      }, images: [desktopImage, mobileImage],
    };
  } catch (error) {
    signal?.throwIfAborted();
    if (error.message.includes('Executable doesn\'t exist')) throw new Error('Install the audit browser with npm run audit:setup, then retry.');
    throw new Error(error.message.startsWith('Website') ? error.message : 'Could not capture this website. It may be unavailable, blocking automated browsers, or too slow.');
  } finally {
    captureSignal.removeEventListener('abort', close); signal?.removeEventListener('abort', close); await browser.close().catch(() => {});
  }
}
