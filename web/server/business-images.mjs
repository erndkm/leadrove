import { publicUrl, requestPublic } from './public-web.mjs';

const decode = value => value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_, hex, number) => { const n = parseInt(hex || number, hex ? 16 : 10); return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ''; });
function attributes(tag) {
  const values = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) values[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? match[4]);
  return values;
}
export function websiteImageCandidates(html, website) {
  const candidates = [], seen = new Set();
  function add(raw, kind) {
    if (typeof raw !== 'string' || !raw || raw.length > 3000) return;
    try { const url = publicUrl(new URL(raw, website).href).href; if (!seen.has(url)) { seen.add(url); candidates.push({ url, kind, sourcePage: website }); } } catch { /* Unsupported or private image source. */ }
  }
  const tags = html.replace(/<!--[\s\S]*?-->/g, '').match(/<(?:meta|link|img)\b[^>]*>/gi) || [];
  for (const tag of tags) { const a = attributes(tag); if (/^<meta/i.test(tag) && ['og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:image:src'].includes((a.property || a.name || '').toLowerCase())) add(a.content, 'website image'); }
  for (const tag of tags) { const a = attributes(tag); if (/^<img/i.test(tag) && /logo/i.test(`${a.alt || ''} ${a.class || ''} ${a.id || ''} ${a.src || ''}`)) add(a.src || a['data-src'], 'logo'); }
  for (const tag of tags) {
    const a = attributes(tag), raw = a.src || a['data-src'];
    if (/^<img/i.test(tag) && raw && !(Number(a.width) > 0 && Number(a.width) < 48) && !(Number(a.height) > 0 && Number(a.height) < 48) && !/tracking|pixel|spinner|spacer|loading|facebook|instagram|payment|cookie|captcha|doctolib|(?:^|[\/_-])(?:map|plan|karte)\d*[.\/_-]/i.test(`${raw} ${a.alt || ''}`)) add(raw, 'website image');
  }
  for (const tag of tags) { const a = attributes(tag); if (/^<link/i.test(tag) && /(?:^|\s)(?:apple-touch-icon(?:-precomposed)?|icon)(?:\s|$)/i.test(a.rel || '')) add(a.href, 'website icon'); }
  add('/favicon.ico', 'website icon');
  return [...candidates.filter(c => c.kind !== 'website icon').slice(0, 3), ...candidates.filter(c => c.kind === 'website icon').slice(0, 2)];
}
export function imageMime(bytes) {
  if (bytes.length < 12) return '';
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (/^GIF8[79]a/.test(bytes.subarray(0, 6).toString())) return 'image/gif';
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (bytes.subarray(4, 12).toString().match(/^ftyp(?:avif|avis)/)) return 'image/avif';
  if (bytes.readUInt32LE(0) === 65536) return 'image/x-icon';
  const svg = bytes.toString('utf8');
  if (/^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)?<svg[\s>]/i.test(svg) && !/<(?:script|foreignObject)\b|\bon\w+\s*=|<!ENTITY|<!DOCTYPE/i.test(svg)) return 'image/svg+xml';
  return '';
}
async function fetchPublic(url, request, signal, maxBytes) {
  let target = publicUrl(url).href;
  for (let i = 0; i < 5; i++) {
    const response = await request(target, { signal, maxBytes });
    if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.location) { target = publicUrl(new URL(response.headers.location, target).href).href; continue; }
    if (response.status < 200 || response.status >= 300) throw new Error('Image source unavailable.');
    return { ...response, url: target };
  }
  throw new Error('Too many image redirects.');
}
export function createBusinessImages({ request = requestPublic } = {}) {
  const cache = new Map(), pages = new Map(), pending = new Map();
  let bytes = 0;
  async function resolve(input) {
    if (!input || ['website', 'imageUrl', 'imageSource'].some(k => input[k] != null && (typeof input[k] !== 'string' || input[k].length > 3000)) || (input.exclude != null && (!Array.isArray(input.exclude) || input.exclude.length > 3 || input.exclude.some(u => typeof u !== 'string' || u.length > 3000)))) throw new Error('Invalid business image request.');
    const safe = raw => { try { return raw ? publicUrl(raw).href : ''; } catch { return ''; } };
    const website = safe(input.website), imageUrl = safe(input.imageUrl), source = safe(input.imageSource);
    const excluded = new Set(input.exclude || []);
    const key = JSON.stringify([website, imageUrl, [...excluded].sort()]);
    const cached = cache.get(key);
    if (cached && cached.until > Date.now()) return cached.value;
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= 20) throw new Error('Image lookup is busy. Try again shortly.');
    const operation = (async () => {
      const signal = AbortSignal.timeout(22000);
      async function load(candidate) {
        if (excluded.has(candidate.url)) return null;
        try {
          const response = await fetchPublic(candidate.url, request, signal, 900000);
          const mime = imageMime(response.body);
          if (!mime || excluded.has(response.url)) return null;
          return { dataUrl: `data:${mime};base64,${response.body.toString('base64')}`, url: candidate.url, sourceUrl: response.url, sourcePage: candidate.sourcePage, kind: candidate.kind };
        } catch { return null; }
      }
      let image = imageUrl ? await load({ url: imageUrl, kind: 'listing photo', sourcePage: source || imageUrl }) : null;
      if (!image && website && !signal.aborted) {
        let candidates = pages.get(website);
        if (!candidates || candidates.until <= Date.now()) {
          try {
            const page = await fetchPublic(website, request, signal, 1200000);
            candidates = { until: Date.now() + 3600000, items: /text\/html|application\/xhtml/i.test(page.headers['content-type'] || '') ? websiteImageCandidates(page.body.toString('utf8'), page.url) : [] };
          } catch { candidates = { until: Date.now() + 300000, items: [{ url: new URL('/favicon.ico', website).href, sourcePage: website, kind: 'website icon' }] }; }
          pages.set(website, candidates); if (pages.size > 300) pages.delete(pages.keys().next().value);
        }
        for (const candidate of candidates.items.filter(c => !excluded.has(c.url)).slice(0, 5)) { if (signal.aborted) break; image = await load(candidate); if (image) break; }
      }
      const value = { image }, size = image?.dataUrl.length || 0;
      if (cache.has(key)) bytes -= cache.get(key).size;
      cache.delete(key); cache.set(key, { value, size, until: Date.now() + (image ? 6 * 3600000 : 300000) }); bytes += size;
      while (cache.size > 200 || bytes > 20000000) { const oldest = cache.keys().next().value; bytes -= cache.get(oldest).size; cache.delete(oldest); }
      return value;
    })();
    pending.set(key, operation);
    try { return await operation; } finally { pending.delete(key); }
  }
  return { resolve };
}
