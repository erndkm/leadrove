export const CATEGORIES = [
  { id: 'all', label: 'All businesses' },
  { id: 'beauty', label: 'Beauty & wellness' },
  { id: 'trades', label: 'Trades & repairs' },
  { id: 'food', label: 'Food & drink' },
  { id: 'health', label: 'Health & fitness' },
  { id: 'retail', label: 'Shops & retail' },
  { id: 'professional', label: 'Professional services' },
  { id: 'hospitality', label: 'Hotels & accommodation' },
];
const beauty = new Set(['hairdresser', 'beauty', 'massage', 'cosmetics', 'tattoo']);
const food = new Set(['restaurant', 'cafe', 'bar', 'pub', 'fast_food', 'ice_cream', 'bakery', 'confectionery']);
const health = new Set(['dentist', 'doctors', 'clinic', 'physiotherapist', 'optician', 'fitness_centre', 'pharmacy']);
const trades = new Set(['car_repair', 'bicycle', 'locksmith', 'hardware']);
const socialDomains = ['facebook.com', 'instagram.com', 'tiktok.com', 'linktr.ee', 'wa.me', 'facebook.de'];
export const WEBSITE_LABELS = { missing: 'No website listed', social: 'Social profile only', website: 'Website listed' };
export function safeUrl(raw) {
  if (!raw || typeof raw !== 'string' || raw.length > 3000 || /[\u0000-\u001f\u007f]/.test(raw)) return '';
  const value = raw.trim().split(';')[0];
  if (/^(javascript|data|vbscript|file):/i.test(value)) return '';
  try { const u = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`); return ['http:', 'https:'].includes(u.protocol) && u.hostname.includes('.') && !u.username && !u.password ? u.href : ''; } catch { return ''; }
}
export function websiteStatus(raw) {
  const url = safeUrl(raw);
  if (!url) return 'missing';
  const host = new URL(url).hostname.toLowerCase();
  return socialDomains.some(d => host === d || host.endsWith(`.${d}`)) ? 'social' : 'website';
}
export function businessImage(tags) {
  for (const raw of [tags.wikimedia_commons, tags.image]) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const value = raw.trim();
    let file = value.startsWith('File:') ? value.slice(5) : '';
    const url = /^https?:\/\//i.test(value) ? safeUrl(value) : '';
    if (url) {
      const parsed = new URL(url);
      const commonsFile = parsed.hostname === 'commons.wikimedia.org' && parsed.pathname.match(/^\/wiki\/(?:File:|Special:(?:FilePath|Redirect\/file)\/)(.+)$/i);
      if (commonsFile) {
        try { file = decodeURIComponent(commonsFile[1]); } catch { continue; }
      }
    }
    if (file && /\.(jpe?g|png|webp|gif|avif|svg)$/i.test(file)) {
      const encoded = encodeURIComponent(file);
      return { imageUrl: `https://commons.wikimedia.org/wiki/Special:FilePath/${encoded}?width=120`, imageSource: `https://commons.wikimedia.org/wiki/File:${encoded}` };
    }
    if (url && raw === tags.image && new URL(url).hostname !== 'commons.wikimedia.org') return { imageUrl: url, imageSource: url };
  }
  return { imageUrl: '', imageSource: '' };
}
export function distanceKm(a, b) {
  const r = Math.PI / 180;
  const x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lng - a.lng) * r / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(Math.min(1, x)), Math.sqrt(Math.max(0, 1 - x)));
}
export function classify(tags) {
  const kind = tags.shop || tags.amenity || tags.craft || tags.office || tags.healthcare || tags.leisure || tags.tourism || 'business';
  const category = beauty.has(kind) ? 'beauty' : food.has(kind) ? 'food' : health.has(kind) || tags.healthcare ? 'health' : tags.craft || trades.has(kind) ? 'trades' : tags.office ? 'professional' : tags.tourism ? 'hospitality' : 'retail';
  const names = { hairdresser: 'Hair salon', beauty: 'Beauty salon', car_repair: 'Auto repair', doctors: 'Medical practice', fast_food: 'Takeaway', fitness_centre: 'Fitness studio', electrician: 'Electrician', plumber: 'Plumber', physiotherapist: 'Physiotherapy', cafe: 'Café', dentist: 'Dental practice', bicycle: 'Bicycle shop', hardware: 'Hardware store', cosmetics: 'Cosmetics shop', massage: 'Massage studio', tattoo: 'Tattoo studio', confectionery: 'Sweet shop', ice_cream: 'Ice cream shop', clothes: 'Clothing store', convenience: 'Convenience store', estate_agent: 'Estate agent', insurance: 'Insurance agency', lawyer: 'Law firm', accountant: 'Accountant', guest_house: 'Guest house', optician: 'Optician', bakery: 'Bakery', restaurant: 'Restaurant' };
  return { category, kind: names[kind] || kind.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase()) };
}
export function scoreBusiness(b) {
  const signals = [];
  if (b.websiteStatus === 'missing') signals.push({ label: 'No website in the listing', points: 55, detail: 'A reason to investigate. The directory may be incomplete.' });
  if (b.websiteStatus === 'social') signals.push({ label: 'Social profile instead of a website', points: 45, detail: 'A dedicated website could give this business a place of its own.' });
  if (['beauty', 'trades', 'health', 'professional', 'hospitality'].includes(b.category)) signals.push({ label: 'Service or booking-led business', points: 20, detail: 'This category can benefit from enquiries, service information or booking online.' });
  else signals.push({ label: 'Local customer-facing business', points: 10, detail: 'A website can help local customers find useful business information.' });
  if (b.phone || b.email) signals.push({ label: 'Direct contact available', points: 15, detail: 'A phone number or email is included in the listing.' });
  if (b.hours) signals.push({ label: 'Opening hours documented', points: 10, detail: 'A more complete listing gives you a useful starting point to verify the business.' });
  if (b.chain) signals.push({ label: 'Brand or chain recorded', points: -25, detail: 'Website decisions may be handled centrally.' });
  return { score: Math.max(0, Math.min(100, signals.reduce((n, s) => n + s.points, 0))), signals };
}
export function normalizeBusinesses(elements, center, radius) {
  const seen = new Map();
  const byName = new Map();
  for (const el of elements) {
    const t = el.tags || {};
    if (!t.name || t.disused === 'yes' || t.abandoned === 'yes' || t.shop === 'vacant') continue;
    if (['government', 'political_party', 'association', 'ngo', 'diplomatic', 'religion', 'educational_institution', 'research'].includes(t.office)) continue;
    const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const distance = distanceKm(center, { lat, lng });
    if (distance > radius) continue;
    const { category, kind } = classify(t);
    const website = safeUrl(t.website || t['contact:website'] || t.url || t['contact:facebook'] || t['contact:instagram']);
    const b = { id: `${el.type}/${el.id}`, name: t.name, lat, lng, distance, category, kind, website, websiteStatus: websiteStatus(website), phone: t['contact:phone'] || t.phone || '', email: t['contact:email'] || t.email || '', hours: t.opening_hours || '', chain: !!(t.brand || t['brand:wikidata'] || t['operator:wikidata']), address: [[t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' '), [t['addr:postcode'], t['addr:city']].filter(Boolean).join(' ')].filter(Boolean).join(', '), source: `https://www.openstreetmap.org/${el.type}/${el.id}` };
    Object.assign(b, scoreBusiness(b), businessImage(t));
    const nameKey = b.name.toLocaleLowerCase();
    const matches = byName.get(nameKey) || [];
    const duplicate = matches.find(v => distanceKm(v, b) < 0.06);
    if (!duplicate) { seen.set(b.id, b); matches.push(b); byName.set(nameKey, matches); }
    else {
      // Photos may be tagged on either the business node or its building.
      if (!b.imageUrl && duplicate.imageUrl) Object.assign(b, { imageUrl: duplicate.imageUrl, imageSource: duplicate.imageSource });
      if (!duplicate.imageUrl && b.imageUrl) Object.assign(duplicate, { imageUrl: b.imageUrl, imageSource: b.imageSource });
      if ((b.phone ? 1 : 0) + (b.website ? 1 : 0) + (b.address ? 1 : 0) > (duplicate.phone ? 1 : 0) + (duplicate.website ? 1 : 0) + (duplicate.address ? 1 : 0)) { seen.delete(duplicate.id); seen.set(b.id, b); matches[matches.indexOf(duplicate)] = b; }
    }
  }
  return [...seen.values()];
}
export function filterBusinesses(businesses, filters, saved = {}) {
  return businesses.filter(b => (filters.category === 'all' || b.category === filters.category) && (!filters.noWebsite || b.websiteStatus !== 'website') && (!filters.independent || !b.chain) && (!filters.contact || b.phone || b.email) && b.score >= (filters.minScore || 0) && (!filters.query || `${b.name} ${b.kind} ${b.address}`.toLocaleLowerCase().includes(filters.query.toLocaleLowerCase())) && (!filters.status || filters.status === 'all' || (saved[b.id]?.status || 'To review') === filters.status)).sort((a, b) => {
    const nearbyFirst = () => a.distance - b.distance || a.name.localeCompare(b.name);
    switch (filters.sort) {
      case 'value':
      case 'value-asc': {
        const aValue = a.prospect?.price?.suggested, bValue = b.prospect?.price?.suggested;
        const aHasValue = Number.isFinite(aValue), bHasValue = Number.isFinite(bValue);
        // Missing estimates stay last in either direction; a zero quote is valid.
        if (aHasValue !== bHasValue) return aHasValue ? -1 : 1;
        const difference = aHasValue ? aValue - bValue : 0;
        return (filters.sort === 'value-asc' ? difference : -difference) || b.score - a.score || nearbyFirst();
      }
      case 'score-asc': return a.score - b.score || nearbyFirst();
      case 'website': return (a.audit?.qualityScore ?? (a.websiteStatus === 'website' ? 101 : 102)) - (b.audit?.qualityScore ?? (b.websiteStatus === 'website' ? 101 : 102)) || nearbyFirst();
      case 'distance': return nearbyFirst();
      case 'name': return a.name.localeCompare(b.name) || a.distance - b.distance;
      default: return b.score - a.score || nearbyFirst();
    }
  });
}
export function toCsv(businesses, saved = {}) {
  const cell = value => { let s = String(value ?? ''); if (/^[\s\u0000-\u001f]*[=+@-]|^[\t\r\n]/.test(s)) s = `'${s}`; return `"${s.replaceAll('"', '""')}"`; };
  const rows = [['Business', 'Category', 'Priority score', 'Website signal', 'Website', 'Phone', 'Email', 'Address', 'Latitude', 'Longitude', 'Distance km', 'Status', 'Notes', 'Source', 'Data license', 'Website quality /100', 'UI /100', 'SEO /100', 'Safety /100', 'Accessibility /100', 'Performance /100', 'AI provider', 'Reviewed at', 'AI summary', 'AI findings'], ...businesses.map(b => [b.name, b.kind, b.score, WEBSITE_LABELS[b.websiteStatus], b.website, b.phone, b.email, b.address, b.lat, b.lng, b.distance.toFixed(2), saved[b.id]?.status || 'To review', saved[b.id]?.notes || '', b.source, 'OpenStreetMap contributors, ODbL 1.0', b.audit?.qualityScore, b.audit?.categories.ui.score, b.audit?.categories.seo.score, b.audit?.categories.safety.score, b.audit?.categories.accessibility.score, b.audit?.categories.performance.score, b.audit?.provider, b.audit?.scannedAt, b.audit?.summary, b.audit?.findings.map(f => `[${f.category}/${f.severity}] ${f.title}: ${f.evidence} Fix: ${f.recommendation}`).join(' | ')])];
  rows[0].push('Suggested website quote', 'Estimate low', 'Estimate high', 'Currency', 'Price basis', 'Opportunity', 'Suggested offer', 'Verification', 'Verified at', 'Next action', 'Follow-up date', 'Last contact');
  businesses.forEach((b, i) => rows[i + 1].push(b.prospect?.price.suggested, b.prospect?.price.low, b.prospect?.price.high, b.prospect?.price.currency, b.prospect ? 'One-time project, excluding VAT; scope estimate, not client budget' : '', b.prospect?.reason, b.prospect?.offer, b.prospect?.contactLabel, b.prospect?.verifiedAt, saved[b.id]?.nextAction || b.prospect?.nextAction, saved[b.id]?.nextDate || '', saved[b.id]?.lastContact || ''));
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n');
}
