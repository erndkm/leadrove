import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { requestPublic, publicUrl } from './public-web.mjs';
import { collectEvidence } from './evidence.mjs';
import { pageText } from './prospect-research.mjs';
import { journeyFor, cleanInsight, cleanBenchmark } from '../src/workflow-model.mjs';
import { websiteStatus } from '../src/model.mjs';

export async function fetchPublicPage(raw, { request = requestPublic, signal } = {}) {
  let url = publicUrl(raw).href;
  for (let i = 0; i < 5; i++) {
    const response = await request(url, { signal, maxBytes: 1800000 });
    if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.location) { url = publicUrl(new URL(response.headers.location, url).href).href; continue; }
    return { ...response, url, html: response.body.toString('utf8') };
  }
  throw new Error('The website redirected too many times.');
}
export function detectTechnologies(html) {
  return [['WordPress', /wp-content\/|wp-includes\/|generator[^>]+wordpress/i], ['Shopify', /cdn\.shopify\.com|Shopify\.theme/i], ['Wix', /wixstatic\.com|wix\.com\/website/i], ['Squarespace', /static[12]\.squarespace\.com|squarespace-cdn/i], ['Webflow', /data-wf-page|webflow\.js/i], ['Framer', /framerusercontent\.com|data-framer-name/i], ['Joomla', /generator[^>]+joomla/i], ['Drupal', /drupalSettings|sites\/default\/files/i]].filter(([, pattern]) => pattern.test(html)).map(([name]) => name);
}
export function classifyPresence(response) {
  if ([401, 403, 429].includes(response.status) || /just a moment|verify you are human|checking your browser/i.test(response.html.slice(0, 20000))) return 'blocked';
  if (response.status < 200 || response.status >= 400) return 'unreachable';
  if (!/html/i.test(response.headers['content-type'] || '')) return 'unknown';
  const text = pageText(response.html).slice(0, 8000);
  if (/domain (is )?(for sale|parked)|buy this domain|diese domain (steht zum verkauf|kaufen)|sedo domain parking/i.test(text)) return 'parked';
  if (text.length < 1200 && /under construction|coming soon|website im aufbau|hier entsteht|website wird .berarbeitet/i.test(text)) return 'placeholder';
  return 'live';
}
export function htmlLinks(html, base) {
  return [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].slice(0, 200).flatMap(match => {
    try { const href = new URL(match[1].replaceAll('&amp;', '&'), base).href; return [{ href, text: pageText(match[2]).slice(0, 150) }]; } catch { return []; }
  });
}
export async function inspectOpportunity(business, { request = requestPublic, capture = collectEvidence, directory, previous, signal } = {}) {
  const checkedAt = new Date().toISOString(), site = websiteStatus(business.website);
  if (site !== 'website') return cleanInsight({ checkedAt, website: business.website, presence: site === 'social' ? 'social' : 'unlisted', detail: 'Listing evidence only. Confirm the official website separately.' });
  let home;
  try { home = await fetchPublicPage(business.website, { request, signal }); }
  catch (error) { return cleanInsight({ checkedAt, website: business.website, presence: 'unreachable', detail: `This attempt failed: ${error.message}. This does not establish permanent downtime.` }); }
  const presence = classifyPresence(home), links = htmlLinks(home.html, home.url);
  const contacts = links.filter(l => /^(mailto:|tel:)/i.test(l.href)).map(l => ({ type: l.href.startsWith('mailto:') ? 'email' : 'phone', value: decodeURIComponent(l.href.replace(/^(mailto:|tel:)/i, '').split('?')[0]).slice(0, 200), source: home.url }));
  const contactPage = links.find(l => /kontakt|contact|impressum/i.test(`${l.text} ${l.href}`) && /^https?:/.test(l.href) && new URL(l.href).origin === new URL(home.url).origin);
  if (presence === 'live' && contactPage) {
    try { const page = await fetchPublicPage(contactPage.href, { request, signal }); if (new URL(page.url).origin === new URL(home.url).origin && page.status === 200) for (const l of htmlLinks(page.html, page.url).filter(l => /^(mailto:|tel:)/i.test(l.href))) contacts.push({ type: l.href.startsWith('mailto:') ? 'email' : 'phone', value: decodeURIComponent(l.href.replace(/^(mailto:|tel:)/i, '').split('?')[0]).slice(0, 200), source: page.url }); } catch { /* Homepage contacts remain available. */ }
  }
  const journeys = [];
  for (const [id, label, pattern] of journeyFor(business.category)) {
    const link = links.find(l => new RegExp(pattern, 'i').test(`${l.text} ${l.href}`));
    let state = presence !== 'live' ? 'unknown' : link ? 'found' : 'not-observed';
    let evidence = presence !== 'live' ? 'The homepage could not be reliably assessed.' : link ? `Homepage link: ${link.text || link.href}` : 'No matching homepage link was observed. Check menus and other pages manually.';
    if (link && presence === 'live' && /^https?:/.test(link.href)) {
      try { const destination = await fetchPublicPage(link.href, { request, signal }); if ([404, 410].includes(destination.status)) { state = 'broken'; evidence = `${label} destination returned HTTP ${destination.status}.`; } else if (destination.status >= 400) { state = 'unknown'; evidence = `Destination returned HTTP ${destination.status}; it may block automated checks.`; } else evidence += `; destination responded HTTP ${destination.status}.`; }
      catch { state = 'unknown'; evidence = 'Link found, but its destination could not be checked.'; }
    }
    journeys.push({ id, label, state, evidence, url: link?.href });
  }
  let screenshotId = '', mobile = null, detail = presence === 'live' ? 'Public homepage checked. Contacts are observed on the page; business identity still needs confirmation.' : 'Automated presence signal. Confirm manually before using it in a proposal.';
  if (presence === 'live' && directory) {
    try {
      const captured = await capture(home.url, { signal });
      const digest = createHash('sha256').update(home.url + checkedAt).digest('hex');
      await mkdir(join(directory, 'evidence'), { recursive: true, mode: 0o700 });
      for (let i = 0; i < Math.min(2, captured.images.length); i++) await writeFile(join(directory, 'evidence', `${digest}-${i}.png`), captured.images[i], { mode: 0o600 });
      screenshotId = digest;
      mobile = captured.evidence.mobile;
    } catch { detail += ' Screenshots were unavailable; retry the check to capture them.'; }
  }
  const fingerprint = createHash('sha256').update(JSON.stringify({ presence, technologies: detectTechnologies(home.html), title: home.html.match(/<title[^>]*>(.*?)<\/title>/is)?.[1] || '', contacts: contacts.map(c => c.value).sort(), journeys: journeys.map(j => [j.id, j.state, j.url]) })).digest('hex');
  return cleanInsight({ checkedAt, website: business.website, presence, httpStatus: home.status, tlsExpiry: home.tlsExpiry, detail, technologies: detectTechnologies(home.html), contacts: [...new Map(contacts.map(c => [c.value, c])).values()], journeys, screenshotId, mobile, fingerprint, previousCheckedAt: previous?.checkedAt, changed: !!previous?.fingerprint && previous.fingerprint !== fingerprint });
}
export async function loadScreenshots(directory, id) {
  if (!/^[a-f0-9]{64}$/.test(id)) return { images: [] };
  const images = await Promise.all([0, 1].map(async i => { try { return `data:image/png;base64,${(await readFile(join(directory, 'evidence', `${id}-${i}.png`))).toString('base64')}`; } catch { return ''; } }));
  return { images };
}
export function normalizePageSpeed(data, website) {
  if (data.error || !data.lighthouseResult || data.lighthouseResult.runtimeError) throw new Error('PageSpeed could not measure this website. Try again later.');
  const l = data.lighthouseResult, a = l.audits || {};
  const page = data.loadingExperience?.metrics, origin = data.originLoadingExperience?.metrics;
  const field = page && Object.keys(page).length ? page : origin && Object.keys(origin).length ? origin : {};
  const fieldScope = field === page ? 'page' : field === origin ? 'origin' : 'unavailable';
  return cleanBenchmark({ website, checkedAt: data.analysisUTCTimestamp || new Date().toISOString(), performance: typeof l.categories?.performance?.score === 'number' ? Math.round(l.categories.performance.score * 100) : null,
    lab: { lcp: a['largest-contentful-paint']?.numericValue, cls: a['cumulative-layout-shift']?.numericValue, tbt: a['total-blocking-time']?.numericValue },
    field: { lcp: field.LARGEST_CONTENTFUL_PAINT_MS?.percentile, inp: field.INTERACTION_TO_NEXT_PAINT?.percentile, cls: field.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile != null ? field.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100 : null }, fieldScope });
}
async function externalJson(url, options = {}) {
  let response;
  try { response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(75000) }); } catch { throw new Error('The data provider did not respond. Try again later.'); }
  if (!response.ok) throw new Error(`The data provider returned HTTP ${response.status}. Check the connection and account allowance.`);
  const limit = 8_000_000, chunks = []; let size = 0;
  if (Number(response.headers.get('content-length')) > limit) { await response.body?.cancel(); throw new Error('The data provider response was too large.'); }
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) throw new Error('The data provider response was too large.');
    chunks.push(Buffer.from(chunk));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('The data provider returned an invalid response.'); }
}
export async function measurePageSpeed(website) {
  const url = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  url.search = new URLSearchParams({ url: publicUrl(website).href, strategy: 'mobile', category: 'performance', ...(process.env.LEADROVE_PAGESPEED_KEY ? { key: process.env.LEADROVE_PAGESPEED_KEY } : {}) });
  return normalizePageSpeed(await externalJson(url), website);
}
export function normalizeEmailCheck(data, email) {
  const row = data.data?.flat?.(2)?.find(r => r.query?.toLowerCase() === email.toLowerCase());
  if (!row) throw new Error('Email validation is still pending or returned no matching result. Retry later.');
  const status = row.status === 'RECEIVING' ? 'valid' : ['NOT_RECEIVING', 'INVALID', 'REJECTED'].includes(row.status) ? 'invalid' : /CATCH_ALL|RISKY|DISPOSABLE/.test(row.status) ? 'risky' : 'unknown';
  return { email, status, detail: String(row.status_details || row.status || '').slice(0, 500), provider: 'Outscraper', checkedAt: new Date().toISOString() };
}
export async function validateEmail(email) {
  if (!process.env.LEADROVE_OUTSCRAPER_KEY) throw new Error('Connect Outscraper in Settings to validate mailboxes.');
  if (typeof email !== 'string' || email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Add a valid email address first.');
  const url = new URL('https://api.outscraper.com/email-validator'); url.search = new URLSearchParams({ query: email, async: 'false' });
  return normalizeEmailCheck(await externalJson(url, { headers: { 'X-API-KEY': process.env.LEADROVE_OUTSCRAPER_KEY } }), email);
}
export async function findReputation(business) {
  if (!process.env.LEADROVE_GOOGLE_PLACES_KEY) throw new Error('Connect Google Places in Settings to look up ratings.');
  const data = await externalJson('https://places.googleapis.com/v1/places:searchText', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': process.env.LEADROVE_GOOGLE_PLACES_KEY, 'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.businessStatus,places.rating,places.userRatingCount,places.googleMapsUri,places.websiteUri,places.reviews.publishTime' }, body: JSON.stringify({ textQuery: `${String(business.name).slice(0, 300)} ${String(business.address || business.searchLocation || '').slice(0, 500)}`, pageSize: 3 }) });
  return { candidates: (data.places || []).map(p => ({ id: p.id, name: p.displayName?.text || '', address: p.formattedAddress || '', website: p.websiteUri || '', source: p.googleMapsUri || '', rating: p.rating ?? null, reviews: p.userRatingCount ?? null, status: p.businessStatus || 'Unknown', latestReview: (p.reviews || []).map(r => r.publishTime).filter(Boolean).sort().at(-1) || '', checkedAt: new Date().toISOString(), provider: 'Google Maps' })) };
}
export const integrationStatus = () => ({ pagespeed: !!process.env.LEADROVE_PAGESPEED_KEY, email: !!process.env.LEADROVE_OUTSCRAPER_KEY, places: !!process.env.LEADROVE_GOOGLE_PLACES_KEY });
