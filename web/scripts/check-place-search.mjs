import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseURL = process.env.LEADROVE_URL || 'http://127.0.0.1:5173';
const output = '.impeccable/review/place-search';
await mkdir(output, { recursive: true });
const feature = (name, country, countrycode, coordinates, state = '') => ({ type: 'Feature', geometry: { type: 'Point', coordinates }, properties: { name, country, countrycode, state, osm_key: 'place', osm_value: 'city' } });
const germany = feature('Berlin', 'Germany', 'DE', [13.4, 52.52]);
const america = feature('Berlin', 'United States', 'US', [-71.2, 44.4], 'New Hampshire');
const browser = await chromium.launch({ headless: true });
try {
  for (const device of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport: device, locale: 'de-DE', timezoneId: 'Europe/Berlin', isMobile: device.name === 'mobile', hasTouch: device.name === 'mobile' });
    const page = await context.newPage();
    const errors = [], calls = [];
    let businessCalls = 0, releaseSlow, errorAttempts = 0;
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem('cf:last-search', JSON.stringify({ businesses: [], center: { lat: 52.5295, lng: 13.401, label: 'Berlin Mitte, Germany' }, radius: 1.5, fetchedAt: Date.now() }));
      Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition() { throw new Error('Unexpected GPS permission request'); } } });
    });
    await page.route('**/api/audits/**', route => route.fulfill({ status: 503, json: { error: 'QA service is offline.' } }));
    await page.route('**/*tile*/*', route => route.abort());
    await page.route('**/api/interpreter**', route => { businessCalls++; return route.fulfill({ json: { elements: [] } }); });
    await page.route('https://photon.komoot.io/api/**', async route => {
      const url = new URL(route.request().url()); calls.push(url);
      const q = url.searchParams.get('q');
      if (q === 'Slow') await new Promise(resolve => { releaseSlow = resolve; });
      if (q === 'Error city' && ++errorAttempts === 1) return route.fulfill({ status: 503, body: 'Unavailable' });
      const features = q === 'No matching town' ? [] : q === 'Hamburg' ? [feature('Hamburg', 'Germany', 'DE', [10, 53.5])]
        : q === 'Slow' ? [feature('Slow result', 'Germany', 'DE', [10, 53])]
        : q === 'Error city' ? [feature('Frankfurt am Main', 'Germany', 'DE', [8.6, 50.1], 'Hesse')]
        : [america, germany];
      await route.fulfill({ json: { features } }).catch(() => {});
    });
    await page.goto(baseURL);
    const input = page.getByRole('combobox', { name: 'Search location' });
    await input.waitFor();
    await input.focus();
    await page.waitForTimeout(450);
    assert.equal(calls.length, 0, 'focusing a selected location must not query the provider');
    await input.fill('B'); await input.fill('Be'); await input.fill('Ber');
    await page.getByRole('listbox').getByRole('option', { name: 'Berlin Germany' }).waitFor();
    assert.equal(calls.length, 1, 'fast typing must be debounced');
    assert.equal(calls[0].searchParams.get('lang'), 'de');
    assert.equal(calls[0].searchParams.has('lat'), false, 'demo Berlin must not become a location hint');
    assert.equal(await page.getByRole('listbox').getByRole('option').first().innerText(), 'Berlin\nGermany');
    await page.screenshot({ path: `${output}/${device.name}-suggestions.png`, fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'viewport must not overflow');
    await input.press('ArrowDown');
    assert.equal(await input.getAttribute('aria-activedescendant'), 'location-option-1');
    await input.press('Enter');
    assert.match(await input.inputValue(), /New Hampshire/);
    assert.equal(await input.getAttribute('aria-expanded'), 'false');
    assert.equal(businessCalls, 0, 'choosing a location previews without searching for businesses');
    assert.match(await page.evaluate(() => localStorage.getItem('cf:recent-places')), /New Hampshire/);
    await page.getByRole('button', { name: 'Search area', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.search-button').disabled);
    assert.equal(businessCalls, 1, 'business lookup requires the separate search action');
    await input.fill('Slow');
    await page.waitForFunction(() => document.querySelector('[role="listbox"]')?.getAttribute('aria-busy') === 'true');
    while (!releaseSlow) await page.waitForTimeout(30);
    await input.fill('Hamburg');
    await page.getByRole('listbox').getByRole('option', { name: 'Hamburg Germany' }).waitFor();
    releaseSlow();
    await page.waitForTimeout(150);
    assert.equal(await page.getByRole('listbox').getByRole('option').count(), 1);
    assert.match(await page.getByRole('listbox').getByRole('option').innerText(), /Hamburg/);
    const nearby = calls.find(url => url.searchParams.get('q') === 'Hamburg');
    assert.equal(nearby.searchParams.get('lat'), '44.4');
    await input.press('Escape');
    assert.equal(await input.getAttribute('aria-expanded'), 'false');
    await input.fill('No matching town');
    await page.locator('.location-suggestion-status').filter({ hasText: 'No matching location. Try a nearby town or add a region.' }).waitFor();
    await input.fill('Error city');
    await page.getByRole('button', { name: 'Try location search again' }).click();
    await page.getByRole('listbox').getByRole('option', { name: /Frankfurt am Main/ }).waitFor();
    const recoveredOption = page.getByRole('listbox').getByRole('option', { name: /Frankfurt am Main/ });
    if (device.name === 'mobile') await recoveredOption.tap(); else await recoveredOption.click();
    await input.fill('');
    await page.getByRole('listbox', { name: 'Recent locations' }).waitFor();
    assert.equal(await page.getByRole('listbox').getByRole('option').count(), 2);
    const beforeComposition = calls.length;
    await input.dispatchEvent('compositionstart');
    await input.fill('Mun');
    await page.waitForTimeout(450);
    assert.equal(calls.length, beforeComposition, 'IME composition must not issue intermediate searches');
    await input.dispatchEvent('compositionend');
    await page.getByRole('listbox').getByRole('option', { name: 'Berlin Germany' }).waitFor();
    await input.press('Tab');
    assert.equal(await input.getAttribute('aria-expanded'), 'false');
    assert.deepEqual(errors, []);
    console.log(`${device.name}: debounce, localization, keyboard, preview/search separation, stale results, empty/error/retry, recent choices, IME and overflow passed`);
    await context.close();
  }
} finally { await browser.close(); }
