import { cleanProfile, LEAD_STAGES } from './prospect-model.mjs';
import { safeUrl, websiteStatus } from './model.mjs';
import { cleanInsight, cleanBenchmark, cleanProposal, cleanWatchlist } from './workflow-model.mjs';

const text = (v, max = 2000) => typeof v === 'string' ? v.slice(0, max) : '';
const stamp = v => Number.isFinite(v) && v >= 0 ? Math.min(v, Date.now() + 60000) : 0;
const idSafe = id => typeof id === 'string' && /^[\w/:.-]{1,200}$/.test(id) && !['__proto__', 'constructor', 'prototype'].includes(id);
export function cleanLead(value) {
  if (!value?.business || !idSafe(value.business.id) || !text(value.business.name, 300)) throw new Error('A lead is missing its business name or ID.');
  const b = value.business;
  if (![b.lat, b.lng].every(Number.isFinite) || Math.abs(b.lat) > 90 || Math.abs(b.lng) > 180) throw new Error('A lead has invalid coordinates.');
  const business = Object.fromEntries(['id', 'name', 'kind', 'category', 'phone', 'email', 'hours', 'address', 'searchLocation'].map(k => [k, text(b[k], k === 'name' ? 300 : 2000)]));
  Object.assign(business, { lat: b.lat, lng: b.lng, distance: Number.isFinite(b.distance) ? b.distance : 0, chain: b.chain === true, fetchedAt: stamp(b.fetchedAt), website: safeUrl(b.website), websiteStatus: websiteStatus(b.website), source: safeUrl(b.source), imageUrl: safeUrl(b.imageUrl), imageSource: safeUrl(b.imageSource) });
  const status = value.status === 'Verified opportunity' ? 'Qualified' : LEAD_STAGES.includes(value.status) ? value.status : 'To review';
  const lead = { business, status, notes: text(value.notes, 20000), savedAt: stamp(value.savedAt), updatedAt: stamp(value.updatedAt || value.savedAt), opportunity: text(value.opportunity), offer: text(value.offer), nextAction: text(value.nextAction, 500), nextDate: /^\d{4}-\d{2}-\d{2}$/.test(value.nextDate) ? value.nextDate : '', lastContact: text(value.lastContact, 40), completedDate: /^\d{4}-\d{2}-\d{2}$/.test(value.completedDate) ? value.completedDate : '', scope: ['compact', 'standard', 'extended'].includes(value.scope) ? value.scope : 'standard', quote: value.quote !== '' && value.quote != null && Number.isFinite(Number(value.quote)) && Number(value.quote) >= 0 && Number(value.quote) <= 1000000 ? Number(value.quote) : '', history: Array.isArray(value.history) ? value.history.slice(-100).map(h => ({ at: text(h?.at, 40), text: text(h?.text, 1000) })) : [] };
  if (value.verification) {
    const v = value.verification;
    lead.verification = { presence: ['website', 'no-website', 'social', 'unresolved'].includes(v.presence) ? v.presence : 'unresolved', website: safeUrl(v.website), phone: text(v.phone, 100), email: text(v.email, 200), sourceUrl: safeUrl(v.sourceUrl), active: v.active === true, contactChecked: v.contactChecked === true, checkedAt: Number.isFinite(Date.parse(v.checkedAt)) ? new Date(v.checkedAt).toISOString() : '' };
  }
  lead.insight = cleanInsight(value.insight);
  lead.benchmark = cleanBenchmark(value.benchmark);
  lead.proposal = cleanProposal(value.proposal);
  lead.actualValue = value.actualValue !== '' && value.actualValue != null && Number.isFinite(Number(value.actualValue)) && Number(value.actualValue) >= 0 ? Math.min(10000000, Number(value.actualValue)) : '';
  lead.dealCurrency = ['EUR', 'USD', 'GBP', 'CHF'].includes(value.dealCurrency) ? value.dealCurrency : 'EUR';
  lead.opportunityType = ['New website', 'Mobile usability', 'Booking / enquiries', 'Performance', 'Redesign', 'Other'].includes(value.opportunityType) ? value.opportunityType : '';
  lead.emailCheck = value.emailCheck ? { email: text(value.emailCheck.email, 200), status: ['valid', 'invalid', 'risky', 'unknown'].includes(value.emailCheck.status) ? value.emailCheck.status : 'unknown', checkedAt: text(value.emailCheck.checkedAt, 40), detail: text(value.emailCheck.detail, 500), provider: text(value.emailCheck.provider, 80) } : null;
  lead.reputation = value.reputation ? { name: text(value.reputation.name, 300), rating: Number.isFinite(value.reputation.rating) ? Math.max(0, Math.min(5, value.reputation.rating)) : null, reviews: Number.isFinite(value.reputation.reviews) ? Math.max(0, value.reputation.reviews) : null, status: text(value.reputation.status, 100), source: safeUrl(value.reputation.source), checkedAt: text(value.reputation.checkedAt, 40), latestReview: text(value.reputation.latestReview, 40), provider: text(value.reputation.provider, 100) } : null;
  return lead;
}
export function cleanWorkspace(value) {
  if (!value || value.version !== 1 || !value.leads || Array.isArray(value.leads) || typeof value.leads !== 'object' || Object.keys(value.leads).length > 10000) throw new Error('Choose a valid Leadrove backup (version 1, up to 10,000 leads).');
  const leads = {}, tombstones = {};
  for (const [id, raw] of Object.entries(value.leads)) {
    const lead = cleanLead(raw);
    if (id !== lead.business.id) throw new Error('A lead ID does not match its business.');
    leads[id] = lead;
  }
  if (value.tombstones && typeof value.tombstones === 'object' && !Array.isArray(value.tombstones)) for (const [id, at] of Object.entries(value.tombstones).slice(0, 10000)) if (idSafe(id)) tombstones[id] = stamp(at);
  const watchlists = {}, watchlistTombstones = {};
  for (const raw of Object.values(value.watchlists || {}).slice(0, 100)) { const item = cleanWatchlist(raw); if (item) watchlists[item.id] = item; }
  for (const [id, at] of Object.entries(value.watchlistTombstones || {}).slice(0, 1000)) if (idSafe(id)) watchlistTombstones[id] = stamp(at);
  return { version: 1, leads, tombstones, watchlists, watchlistTombstones, settings: cleanProfile(value.settings), settingsUpdatedAt: stamp(value.settingsUpdatedAt) };
}
export function mergeWorkspace(a, b) {
  const leads = { ...a.leads }, tombstones = { ...a.tombstones };
  for (const [id, at] of Object.entries(b.tombstones || {})) tombstones[id] = Math.max(tombstones[id] || 0, at);
  for (const [id, lead] of Object.entries(b.leads || {})) if (!leads[id] || lead.updatedAt >= leads[id].updatedAt) leads[id] = lead;
  for (const [id, at] of Object.entries(tombstones)) if (leads[id] && at >= leads[id].updatedAt) delete leads[id];
  const settingsSource = (b.settingsUpdatedAt || 0) >= (a.settingsUpdatedAt || 0) ? b : a;
  const watchlists = { ...a.watchlists }, watchlistTombstones = { ...a.watchlistTombstones };
  for (const [id, at] of Object.entries(b.watchlistTombstones || {})) watchlistTombstones[id] = Math.max(at, watchlistTombstones[id] || 0);
  for (const [id, item] of Object.entries(b.watchlists || {})) if (!watchlists[id] || item.updatedAt >= watchlists[id].updatedAt) watchlists[id] = item;
  for (const [id, at] of Object.entries(watchlistTombstones)) if (watchlists[id] && at >= watchlists[id].updatedAt) delete watchlists[id];
  return { version: 1, leads, tombstones, watchlists, watchlistTombstones, settings: settingsSource.settings, settingsUpdatedAt: settingsSource.settingsUpdatedAt || 0 };
}
