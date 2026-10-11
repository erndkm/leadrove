import test from 'node:test';
import assert from 'node:assert/strict';
import { websiteImageCandidates, imageMime, createBusinessImages } from '../server/business-images.mjs';
import { businessImage, normalizeBusinesses } from '../src/model.mjs';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64');
const response = (body, type = 'image/png', status = 200) => ({ status, headers: { 'content-type': type }, body: Buffer.isBuffer(body) ? body : Buffer.from(body) });

test('discovers relative website images, logos and icons without accepting private or executable URLs', () => {
  const candidates = websiteImageCandidates(`<meta content='/front.jpg?a=1&amp;b=2' property='og:image'><meta name="twitter:image" content="javascript:alert(1)"><img alt="Business logo" src="/logo.svg"><link href=/touch.png rel=apple-touch-icon><link rel="shortcut icon" href="https://127.0.0.1/icon">`, 'https://business.example/about/');
  assert.equal(candidates[0].url, 'https://business.example/front.jpg?a=1&b=2');
  assert.equal(candidates[1].kind, 'logo');
  assert.equal(candidates[2].url, 'https://business.example/touch.png');
  assert.equal(candidates.at(-1).url, 'https://business.example/favicon.ico');
  assert.ok(!candidates.some(c => c.url.includes('127.0.0.1')));
});
test('checks image bytes rather than trusting an image content-type', () => {
  assert.equal(imageMime(png), 'image/png');
  assert.equal(imageMime(Buffer.from('<html>A bot protection page</html>')), '');
  assert.equal(imageMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="20" height="20"/></svg>')), 'image/svg+xml');
  assert.equal(imageMime(Buffer.from('<svg onload="alert(1)"></svg>')), '');
});
test('uses a real website image, coalesces lookups and reuses the bounded cache', async () => {
  const calls = [];
  const images = createBusinessImages({ request: async url => { calls.push(url); return url.endsWith('/photo.png') ? response(png) : response('<meta property="og:image" content="/photo.png">', 'text/html'); } });
  const input = { website: 'https://business.example' };
  const [a, b] = await Promise.all([images.resolve(input), images.resolve(input)]);
  assert.equal(a.image.kind, 'website image'); assert.match(a.image.dataUrl, /^data:image\/png;base64,/);
  assert.deepEqual(a, b); await images.resolve(input); assert.equal(calls.length, 2);
});
test('falls back from an unavailable listing photo and invalid metadata image to a site icon', async () => {
  const images = createBusinessImages({ request: async url => {
    if (url.endsWith('/listing.jpg')) return response('', 'text/html', 404);
    if (url.endsWith('/icon.png')) return response(png);
    if (url.endsWith('/blocked.jpg')) return response('<html>Access denied</html>');
    return response('<meta property="og:image" content="/blocked.jpg"><link rel="icon" href="/icon.png">', 'text/html');
  } });
  const { image } = await images.resolve({ website: 'https://business.example', imageUrl: 'https://business.example/listing.jpg' });
  assert.equal(image.kind, 'website icon'); assert.equal(image.sourceUrl, 'https://business.example/icon.png');
});
test('a browser decoding failure can request the next candidate without refetching the homepage', async () => {
  let pages = 0;
  const images = createBusinessImages({ request: async url => {
    if (url.endsWith('.png')) return response(png);
    pages++; return response('<meta property="og:image" content="/photo.png"><link rel="icon" href="/icon.png">', 'text/html');
  } });
  await images.resolve({ website: 'https://business.example' });
  const { image } = await images.resolve({ website: 'https://business.example', exclude: ['https://business.example/photo.png'] });
  assert.equal(image.kind, 'website icon'); assert.equal(pages, 1);
});
test('rejects private redirect targets and returns no image when no public source works', async () => {
  const calls = [];
  const images = createBusinessImages({ request: async url => { calls.push(url); return { status: 302, headers: { location: 'http://127.0.0.1/private' }, body: Buffer.alloc(0) }; } });
  assert.equal((await images.resolve({ website: 'https://business.example' })).image, null);
  assert.ok(calls.every(url => !url.includes('127.0.0.1')));
  assert.equal((await images.resolve({ imageUrl: 'http://169.254.169.254/secret' })).image, null);
});
test('retains tagged Commons photos when duplicate OSM entries are merged', () => {
  const image = businessImage({ wikimedia_commons: 'File:Example Shop.jpg' });
  assert.match(image.imageUrl, /Special:FilePath\/Example%20Shop.jpg\?width=120/);
  const tags = { name: 'Example Shop', shop: 'bakery' };
  const businesses = normalizeBusinesses([{ type: 'node', id: 1, lat: 52, lon: 13, tags: { ...tags, image: 'https://photos.example/store.jpg' } }, { type: 'node', id: 2, lat: 52, lon: 13, tags: { ...tags, website: 'https://business.example', phone: '12345678' } }], { lat: 52, lng: 13 }, 1);
  assert.equal(businesses.length, 1); assert.equal(businesses[0].imageUrl, 'https://photos.example/store.jpg');
});
