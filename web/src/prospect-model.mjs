import { safeUrl, websiteStatus } from './model.mjs';

export const LEAD_STAGES = ['To review', 'Qualified', 'Contacted', 'Replied', 'Meeting', 'Proposal', 'Won', 'Lost', 'Not a fit', 'Do not contact'];
export const CLOSED_STAGES = ['Won', 'Lost', 'Not a fit', 'Do not contact'];
export const DEFAULT_PROFILE = { market: 'Germany', currency: 'EUR', rate: 65, minimumProject: 1200, targetPrice: 2500, preferredCategory: 'all', offer: 'Websites & redesigns' };
export const PRICE_SOURCES = [
  { label: 'Restaurant packages · €799 / €1,499 / €2,499+', url: 'https://www.komplettwebdesign.de/branchen/webdesign-restaurant' },
  { label: 'Trades · €1,990 / €3,990 / €6,990', url: 'https://primal-pixel.de/' },
  { label: 'Practice websites · from €1,250', url: 'https://pixelplanwebdesign.de/webdesign-fuer-arztpraxen' },
  { label: 'Salon websites · packages from €990', url: 'https://www.eviternum-webdesign.de/startseite/webdesign-fuer-kosmetik-und-friseursalons-stylistinnen-und-haarstudios/' },
];
// Planning estimates, not a dataset of client budgets. Hours include discovery,
// design, implementation, QA and revisions; integrations are links/embeds only.
const NICHES = {
  beauty: { hours: [22, 38], label: 'Salon / wellness website', scope: '3–5 pages, service prices, gallery and an existing booking link', rationale: 'Start with a compact offer for an appointment-led local business. Add custom booking only after scoping it.' },
  food: { hours: [20, 36], label: 'Restaurant / café website', scope: '3–5 pages, editable menu, opening hours and reservation link', rationale: 'A focused menu-and-contact site keeps the initial proposal accessible. Online ordering is a separate project.' },
  retail: { hours: [22, 40], label: 'Local shop website', scope: '3–5 pages, product highlights, location and contact', rationale: 'This is a brochure website for a local shop. A catalogue, checkout or stock integration increases the scope.' },
  trades: { hours: [32, 60], label: 'Service enquiry website', scope: '5–8 pages, service pages, project gallery and quote form', rationale: 'Several services and reference projects usually need more content and enquiry planning than a simple shop site.' },
  health: { hours: [34, 64], label: 'Practice / health website', scope: '5–8 pages, services, team, accessibility checks and existing booking link', rationale: 'Allow more time for service explanations and client-approved content. Medical systems and legal review are separate.' },
  professional: { hours: [36, 68], label: 'Professional services website', scope: '5–8 pages, service explanations, credentials and enquiry form', rationale: 'Detailed services and credibility content support a larger scope. The business’s actual budget still needs a conversation.' },
  hospitality: { hours: [42, 78], label: 'Accommodation website', scope: '5–8 pages, room information, photo gallery and existing booking link', rationale: 'Room content and booking journeys need more work. A booking engine, channel manager or extra language is separate.' },
};
const round = value => Math.round(value / 50) * 50;
export const dayKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function addDays(days, date = new Date()) { const next = new Date(date); next.setDate(next.getDate() + days); return dayKey(next); }
export function cleanProfile(value = {}) {
  const numeric = (key, min, max) => Number.isFinite(Number(value[key])) && value[key] !== '' ? Math.min(max, Math.max(min, Number(value[key]))) : DEFAULT_PROFILE[key];
  return { ...DEFAULT_PROFILE, market: typeof value.market === 'string' ? value.market.slice(0, 80) : DEFAULT_PROFILE.market, currency: ['EUR', 'GBP', 'USD', 'CHF'].includes(value.currency) ? value.currency : 'EUR', rate: numeric('rate', 15, 300), minimumProject: numeric('minimumProject', 0, 50000), targetPrice: numeric('targetPrice', 0, 100000), preferredCategory: ['all', ...Object.keys(NICHES)].includes(value.preferredCategory) ? value.preferredCategory : 'all', offer: ['Websites & redesigns', 'New websites', 'Redesigns'].includes(value.offer) ? value.offer : DEFAULT_PROFILE.offer };
}
export function estimatePrice(business, settings = DEFAULT_PROFILE, lead = {}) {
  const profile = cleanProfile(settings);
  const niche = NICHES[business.category] || NICHES.retail;
  const scope = ['compact', 'standard', 'extended'].includes(lead.scope) ? lead.scope : 'standard';
  const factor = scope === 'compact' ? 0.7 : scope === 'extended' ? 1.45 : 1;
  const low = round(Math.max(profile.minimumProject, niche.hours[0] * factor * profile.rate));
  const high = round(Math.max(low, niche.hours[1] * factor * profile.rate));
  const custom = Number(lead.quote);
  const suggested = lead.quote !== '' && lead.quote != null && Number.isFinite(custom) && custom >= 0 && custom <= 1000000 ? custom : round(low + (high - low) * 0.4);
  return { ...niche, low, high, suggested, custom: lead.quote !== '' && lead.quote != null && Number.isFinite(custom) && custom >= 0 && custom <= 1000000, currency: profile.currency, scope, hours: niche.hours.map(h => Math.round(h * factor)), scopeText: scope === 'compact' ? '1–3 pages, one clear contact action, supplied text and photos' : scope === 'extended' ? `${niche.scope}; additional content and revision allowance` : niche.scope };
}
const moneyFormats = new Map();
export function money(value, currency = 'EUR') { if (!moneyFormats.has(currency)) moneyFormats.set(currency, new Intl.NumberFormat('en-IE', { style: 'currency', currency, maximumFractionDigits: 0 })); return moneyFormats.get(currency).format(value); }
export const priceRange = price => `${money(price.low, price.currency)}–${money(price.high, price.currency)}`;
export function effectiveBusiness(business, lead = {}, research) {
  const b = { ...business };
  const verified = lead.verification;
  if (verified && Object.hasOwn(verified, 'website')) b.website = safeUrl(verified.website);
  else if (research?.identityMatched && research.website) b.website = safeUrl(research.website);
  b.websiteStatus = websiteStatus(b.website);
  if (verified) { b.phone = verified.phone || ''; b.email = verified.email || ''; }
  else if (research?.identityMatched) { b.phone = research.phone || ''; b.email = research.email || ''; }
  return b;
}
export function prospectFor(b, lead = {}, settings = DEFAULT_PROFILE, research, now = new Date()) {
  const profile = cleanProfile(settings), price = estimatePrice(b, profile, lead);
  const v = lead.verification;
  const verifiedAt = v?.checkedAt || (research?.identityMatched ? research.checkedAt : null);
  const fresh = !!verifiedAt && Number.isFinite(Date.parse(verifiedAt)) && now.getTime() - Date.parse(verifiedAt) < 90 * 86400000 && Date.parse(verifiedAt) <= now.getTime() + 60000;
  const presenceConsistent = v && (v.presence === 'no-website' ? b.websiteStatus === 'missing' : ['website', 'social'].includes(v.presence) && v.presence === b.websiteStatus && !!safeUrl(v.website));
  const verified = fresh && (v ? v.active === true && v.contactChecked === true && presenceConsistent && !!safeUrl(v.sourceUrl) : research?.identityMatched === true && research?.contactMatched === true);
  const stage = lead.status === 'Verified opportunity' ? 'Qualified' : lead.status || 'To review';
  const reachable = (b.phone || '').replace(/\D/g, '').length >= 6 || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email || '');
  const noSite = verified && v?.presence === 'no-website';
  const social = verified && b.websiteStatus === 'social';
  const auditFresh = b.audit && Number.isFinite(Date.parse(b.audit.scannedAt)) && now.getTime() - Date.parse(b.audit.scannedAt) < 90 * 86400000;
  const insightFresh = lead.insight?.website === b.website && Number.isFinite(Date.parse(lead.insight?.checkedAt)) && now.getTime() - Date.parse(lead.insight.checkedAt) < 90 * 86400000;
  const brokenJourney = insightFresh ? lead.insight.journeys?.find(j => j.state === 'broken') : null;
  const finding = (auditFresh ? b.audit.findings?.find(f => ['high', 'medium'].includes(f.severity)) : null) || (brokenJourney ? { title: brokenJourney.label, evidence: brokenJourney.evidence, recommendation: 'Repair the customer action link and verify its destination.', severity: 'high' } : null);
  const reason = lead.opportunity?.trim() || (noSite ? 'You checked that this business has no dedicated website.' : social ? 'Verified social presence; a dedicated service and contact website is an offer to discuss.' : finding ? `${finding.title}: ${finding.evidence}` : 'Confirm a specific website need before making an offer.');
  const hasNeed = !!(lead.opportunity?.trim() || noSite || social || finding);
  const fit = profile.preferredCategory === 'all' || profile.preferredCategory === b.category;
  const offerFit = profile.offer === 'Websites & redesigns' || (profile.offer === 'New websites' ? b.websiteStatus !== 'website' : b.websiteStatus === 'website');
  const signals = [
    { label: verified ? 'Identity and contact checked' : fresh ? 'Identity checked; contact needs review' : 'Verification needed', points: verified ? 25 : 0, detail: 'A source and recent identity/contact check are required for the contact shortlist.' },
    { label: hasNeed ? 'Specific opportunity identified' : 'Website need unconfirmed', points: hasNeed ? (finding?.severity === 'high' ? 30 : 25) : b.websiteStatus === 'website' ? 5 : 8, detail: reason },
    { label: fit && offerFit ? 'Fits your target and offer' : 'Outside your preferred offer or niche', points: fit && offerFit ? 20 : 0, detail: `${profile.offer}; ${profile.preferredCategory === 'all' ? 'all industries' : profile.preferredCategory}.` },
    { label: reachable ? 'Contact channel available' : 'Find a business contact', points: reachable ? 10 : 0, detail: 'Use public business contact details. Availability does not indicate interest.' },
    { label: 'Project size fit', points: price.high >= profile.targetPrice ? 10 : 3, detail: `Your target is ${money(profile.targetPrice, profile.currency)}. This compares estimated scope, not the owner’s budget.` },
    { label: b.chain ? 'Central buying may apply' : 'Local ownership needs checking', points: b.chain ? -20 : 5, detail: 'No brand in the listing does not prove independent ownership.' },
  ];
  const score = Math.max(0, Math.min(100, signals.reduce((n, s) => n + s.points, 0)));
  const excluded = CLOSED_STAGES.includes(stage);
  const ready = verified && reachable && hasNeed && fit && offerFit && !excluded;
  const offer = lead.offer?.trim() || (noSite || social ? `Build a ${price.label.toLowerCase()}` : finding ? `Improve the website: ${finding.recommendation}` : `Explore a ${price.label.toLowerCase()} project`);
  const nextAction = lead.nextAction?.trim() || (!verified ? 'Verify the business, website and contact' : !hasNeed ? 'Review the website and confirm a useful improvement' : 'Discuss this offer with the business');
  const dueDate = lead.nextDate || dayKey(now);
  return { score, signals, price, verified, verifiedAt, ready, excluded, reason, offer, nextAction, dueDate, stage, finding, research, contactLabel: verified ? (v ? 'Checked by you' : 'Matched online') : verifiedAt ? 'Recheck details' : 'Needs verification' };
}
export function dailyShortlist(businesses, saved = {}, today = dayKey(), limit = 10) {
  const unique = new Set();
  return businesses.filter(b => b.prospect?.ready && (!saved[b.id]?.nextDate || saved[b.id].nextDate <= today) && saved[b.id]?.completedDate !== today && (!['Contacted', 'Replied', 'Meeting', 'Proposal'].includes(b.prospect.stage) || !!saved[b.id]?.nextDate)).sort((a, b) => {
    const ad = saved[a.id]?.nextDate, bd = saved[b.id]?.nextDate;
    return Number(!!bd) - Number(!!ad) || (ad && bd ? ad.localeCompare(bd) : 0) || b.prospect.score - a.prospect.score || a.name.localeCompare(b.name);
  }).filter(b => {
    const key = b.websiteStatus === 'website' ? new URL(b.website).hostname.replace(/^www\./, '') : `${b.name.toLowerCase()}|${(b.phone || b.address || b.id).replace(/\s/g, '')}`;
    if (unique.has(key)) return false;
    unique.add(key); return true;
  }).slice(0, limit);
}
export function outreachDraft(b) {
  const p = b.prospect;
  return `Hello ${b.name} team,\n\nI build websites for local businesses. ${p.verified && p.ready ? `While reviewing your online presence, I noted: ${p.reason}` : 'I am getting in touch to understand whether improving your website is a priority.'}\n\nMy suggested project is: ${p.offer}. Would a short conversation about the scope and your priorities be useful?\n\nBest regards,\n[Your name]`;
}
