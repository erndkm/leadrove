import { safeUrl, websiteStatus, CATEGORIES } from './model.mjs';

export const PRESENCE = { live: 'Website reachable', unreachable: 'Could not reach website', blocked: 'Check blocked', parked: 'Possible parked domain', placeholder: 'Possible placeholder', social: 'Social profile only', unlisted: 'No website listed', unknown: 'Not checked' };
export const JOURNEYS = {
  food: [['menu', 'Read the menu', 'menu|speisekarte|karte'], ['booking', 'Reserve a table', 'reserv|book|tisch']],
  beauty: [['booking', 'Book an appointment', 'book|termin|appoint|treatwell|planity'], ['services', 'Explore treatments', 'service|leistung|behandlung|preis']],
  health: [['booking', 'Request an appointment', 'termin|appoint|book|doctolib'], ['services', 'Find treatments', 'leistung|treatment|service|therap']],
  trades: [['quote', 'Request a quote', 'angebot|quote|anfrag|estimate|kontakt|contact'], ['area', 'Find the service area', 'gebiet|region|standort|area|location']],
  hospitality: [['booking', 'Check availability', 'book|buchen|verf.gbar|availability|reserv'], ['rooms', 'Explore rooms', 'zimmer|room|suite']],
  retail: [['products', 'Browse products', 'shop|produkt|product|sortiment'], ['visit', 'Plan a visit', 'location|anfahrt|standort|hours|.ffnungs']],
  professional: [['services', 'Understand the services', 'leistung|service|beratung'], ['quote', 'Request a consultation', 'kontakt|contact|consult|anfrag']],
};
export const journeyFor = category => [...(JOURNEYS[category] || JOURNEYS.professional), ['contact', 'Contact the business', 'kontakt|contact|mailto:|tel:']];
export const shortText = (value, max = 2000) => typeof value === 'string' ? value.slice(0, max) : '';
const timestamp = value => Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : '';
const numeric = (v, max = 10000000) => v !== '' && v != null && Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.min(max, Number(v)) : null;
export function cleanInsight(v) {
  if (!v || typeof v !== 'object') return null;
  return { checkedAt: timestamp(v.checkedAt), website: safeUrl(v.website), presence: Object.hasOwn(PRESENCE, v.presence) ? v.presence : 'unknown', httpStatus: numeric(v.httpStatus, 599), detail: shortText(v.detail), tlsExpiry: timestamp(v.tlsExpiry), fingerprint: shortText(v.fingerprint, 100), screenshotId: /^[a-f0-9]{64}$/.test(v.screenshotId) ? v.screenshotId : '',
    technologies: Array.isArray(v.technologies) ? v.technologies.slice(0, 20).map(t => shortText(t, 60)) : [],
    contacts: Array.isArray(v.contacts) ? v.contacts.slice(0, 20).map(c => ({ type: ['email', 'phone'].includes(c.type) ? c.type : 'email', value: shortText(c.value, 200), source: safeUrl(c.source) })) : [],
    journeys: Array.isArray(v.journeys) ? v.journeys.slice(0, 6).map(j => ({ id: shortText(j.id, 40), label: shortText(j.label, 150), state: ['found', 'broken', 'not-observed', 'unknown'].includes(j.state) ? j.state : 'unknown', url: safeUrl(j.url), evidence: shortText(j.evidence, 600) })) : [],
    mobile: v.mobile ? { width: numeric(v.mobile.width, 2000), horizontalOverflow: v.mobile.horizontalOverflow === true, smallTextSamples: numeric(v.mobile.smallTextSamples, 10000) } : null,
    changed: v.changed === true, previousCheckedAt: timestamp(v.previousCheckedAt) };
}
export function cleanBenchmark(v) {
  if (!v) return null;
  const metrics = values => Object.fromEntries(Object.entries(values || {}).slice(0, 8).map(([key, value]) => [shortText(key, 60), numeric(value)]));
  return { website: safeUrl(v.website), checkedAt: timestamp(v.checkedAt), performance: numeric(v.performance, 100), lab: metrics(v.lab), field: metrics(v.field), fieldScope: ['page', 'origin', 'unavailable'].includes(v.fieldScope) ? v.fieldScope : 'unavailable' };
}
export function cleanProposal(v = {}) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) v = {};
  return { language: v.language === 'de' ? 'de' : 'en', author: shortText(v.author, 150), contact: shortText(v.contact, 250), intro: shortText(v.intro, 1800), scope: shortText(v.scope, 3000), nextStep: shortText(v.nextStep, 500), brief: shortText(v.brief, 12000),
    findings: Array.isArray(v.findings) ? v.findings.slice(0, 3).map(f => ({ title: shortText(f.title, 180), evidence: shortText(f.evidence, 700), recommendation: shortText(f.recommendation, 700) })) : null,
    annotations: Array.isArray(v.annotations) ? v.annotations.slice(0, 3).map(a => ({ x: Math.max(0, Math.min(100, Number(a.x) || 0)), y: Math.max(0, Math.min(100, Number(a.y) || 0)), label: shortText(a.label, 150) })) : [], updatedAt: timestamp(v.updatedAt) };
}
export function defaultFindings(b, lead = {}) {
  if (lead.proposal?.findings) return lead.proposal.findings;
  const fresh = at => Number.isFinite(Date.parse(at)) && Date.now() - Date.parse(at) < 90 * 86400000;
  const checks = lead.insight?.website === b.website && fresh(lead.insight.checkedAt) ? lead.insight.journeys?.filter(j => j.state === 'broken').map(j => ({ title: j.label, evidence: j.evidence, recommendation: 'Repair the destination and check the customer journey on mobile.' })) || [] : [];
  return [...checks, ...(fresh(b.audit?.scannedAt) ? b.audit?.findings || [] : []).filter(f => f.severity !== 'low'), ...(lead.opportunity ? [{ title: 'Opportunity to discuss', evidence: lead.opportunity, recommendation: lead.offer || b.prospect?.offer || '' }] : [])].slice(0, 3);
}
export function buildBrief(b, lead = {}, language = 'en') {
  const de = language === 'de', findings = defaultFindings(b, lead);
  return `${de ? 'Website-Briefing' : 'Website design brief'}: ${b.name}\n\n${de ? 'Branche' : 'Business'}: ${b.kind || b.category}\n${de ? 'Standort' : 'Location'}: ${b.address || b.searchLocation || ''}\n${de ? 'Aktuelle Website' : 'Current website'}: ${b.website || (de ? 'Nicht bestätigt' : 'Not confirmed')}\n\n${de ? 'Projektumfang' : 'Scope'}\n${lead.proposal?.scope || lead.offer || b.prospect?.price?.scopeText || ''}\n\n${de ? 'Beobachtete Probleme (vor Umsetzung prüfen)' : 'Observed issues (verify before implementation)'}\n${findings.map(f => `- ${f.title}: ${f.evidence}\n  ${f.recommendation}`).join('\n') || (de ? 'Noch keine bestätigten Befunde.' : 'No confirmed findings yet.')}\n\n${de ? 'Zentrale Nutzeraktionen' : 'Primary customer actions'}\n${journeyFor(b.category).map(j => `- ${j[1]}`).join('\n')}\n\n${de ? 'Gestaltung & Umsetzung' : 'Design & implementation'}\n${de ? 'Mobile zuerst. Klare Navigation, lesbare Schrift, sichtbare Fokuszustände und zugängliche Formulare. Vorhandene Markenidentität verwenden. Unbekannte Leistungen, Preise, Bilder, Bewertungen und Kundenstimmen als Platzhalter kennzeichnen. Keine erfundenen Aussagen. Text und Fotos vom Kunden bestätigen lassen.' : 'Mobile first. Clear navigation, readable typography, visible keyboard focus, accessible forms. Use the existing brand. Mark unknown services, pricing, imagery, reviews and testimonials as placeholders. Never invent business claims. Confirm copy and photography with the client.'}`;
}
export function leadRationale(b, lead = {}) {
  const insight = lead.insight;
  return [
    { label: 'Contact', state: b.prospect?.verified ? 'positive' : 'pending', value: b.prospect?.contactLabel || 'Needs verification' },
    { label: 'Opportunity', state: lead.opportunity || b.prospect?.finding || insight?.journeys?.some(j => j.state === 'broken') ? 'positive' : 'pending', value: lead.opportunity || insight?.journeys?.find(j => j.state === 'broken')?.evidence || b.prospect?.finding?.title || 'Confirm a specific need' },
    { label: 'Offer fit', state: b.prospect?.signals?.[2]?.points > 0 ? 'positive' : 'pending', value: b.prospect?.signals?.[2]?.label || 'Check your preferences' },
    { label: 'Buying intent', state: 'unknown', value: ['Replied', 'Meeting', 'Proposal', 'Won'].includes(lead.status) ? 'Check your conversation notes' : 'Not established' },
  ];
}
export function snapshotOf(businesses) {
  return Object.fromEntries(businesses.slice(0, 10000).map(b => [b.id, { name: b.name, website: b.website || '', phone: b.phone || '', email: b.email || '', address: b.address || '', lat: b.lat, lng: b.lng, category: b.category, kind: b.kind, chain: b.chain, source: b.source, fetchedAt: b.fetchedAt }]));
}
export function watchlistBusiness(watches, id) {
  for (const watch of Object.values(watches).sort((a, b) => b.updatedAt - a.updatedAt)) {
    const b = watch.snapshot[id];
    if (b && [b.lat, b.lng].every(Number.isFinite)) return { ...b, id, websiteStatus: websiteStatus(b.website), searchLocation: watch.center.label };
  }
  return null;
}
export function compareSearch(previous = {}, businesses = []) {
  const current = snapshotOf(businesses), changes = [];
  for (const [id, b] of Object.entries(current)) {
    if (!previous[id]) changes.push({ id, name: b.name, type: 'new', detail: 'New in this search' });
    else { const fields = ['website', 'phone', 'email', 'address'].filter(k => previous[id][k] !== b[k]); if (fields.length) changes.push({ id, name: b.name, type: 'changed', detail: `${fields.join(', ')} changed` }); }
  }
  for (const [id, b] of Object.entries(previous)) if (!current[id]) changes.push({ id, name: b.name, type: 'not-returned', detail: 'Not returned this time; not proof of closure' });
  return changes;
}
export function cleanWatchlist(v) {
  if (!v || !/^[\w-]{1,100}$/.test(v.id) || ['__proto__', 'constructor', 'prototype'].includes(v.id) || ![v.center?.lat, v.center?.lng].every(Number.isFinite)) return null;
  if (Math.abs(v.center.lat) > 90 || Math.abs(v.center.lng) > 180) return null;
  const snapshot = {};
  for (const [id, b] of Object.entries(v.snapshot || {}).slice(0, 10000)) if (b && /^[\w/:.-]{1,200}$/.test(id) && !['__proto__', 'constructor', 'prototype'].includes(id)) snapshot[id] = { name: shortText(b.name, 300), website: safeUrl(b.website), phone: shortText(b.phone, 100), email: shortText(b.email, 200), address: shortText(b.address, 500), ...([b.lat, b.lng].every(Number.isFinite) && Math.abs(b.lat) <= 90 && Math.abs(b.lng) <= 180 ? { lat: b.lat, lng: b.lng } : {}), category: CATEGORIES.some(c => c.id === b.category && c.id !== 'all') ? b.category : 'retail', kind: shortText(b.kind, 120), chain: b.chain === true, source: safeUrl(b.source), fetchedAt: Number.isFinite(b.fetchedAt) ? Math.min(Math.max(b.fetchedAt, 0), Date.now()) : 0 };
  return { id: v.id, name: shortText(v.name, 120), center: { lat: v.center.lat, lng: v.center.lng, label: shortText(v.center.label, 300) }, radius: Math.max(.5, Math.min(10, Number(v.radius) || 1.5)), category: CATEGORIES.some(c => c.id === v.category) ? v.category : 'all', independent: v.independent === true, noWebsite: v.noWebsite === true, technology: shortText(v.technology, 60), checkWebsites: v.checkWebsites === true, interval: [1, 7, 30].includes(v.interval) ? v.interval : 7, checkedAt: timestamp(v.checkedAt), updatedAt: Math.min(Number(v.updatedAt) || 0, Date.now() + 60000), snapshot,
    changes: Array.isArray(v.changes) ? v.changes.slice(0, 1000).map(c => ({ id: shortText(c.id, 200), name: shortText(c.name, 300), type: ['new', 'changed', 'not-returned'].includes(c.type) ? c.type : 'changed', detail: shortText(c.detail, 300) })) : [] };
}
export function pipelineStats(leads) {
  const stages = ['Contacted', 'Replied', 'Meeting', 'Proposal', 'Won'];
  const reached = (lead, stage) => lead.status === stage || lead.history?.some(h => h.text === `Status: ${stage}` || stage === 'Contacted' && h.text.startsWith('Marked contacted'));
  const counts = Object.fromEntries(stages.map((stage, index) => [stage, leads.filter(l => stages.slice(index).some(s => reached(l, s))).length]));
  const revenue = {};
  for (const lead of leads) if (lead.status === 'Won' && lead.actualValue !== '' && lead.actualValue != null) revenue[lead.dealCurrency || 'EUR'] = (revenue[lead.dealCurrency || 'EUR'] || 0) + Number(lead.actualValue);
  const groups = key => [...new Set(leads.map(key))].map(name => { const members = leads.filter(l => key(l) === name); return { name, total: members.length, contacted: members.filter(l => stages.some(s => reached(l, s))).length, replied: members.filter(l => stages.slice(1).some(s => reached(l, s))).length, won: members.filter(l => l.status === 'Won').length }; }).sort((a, b) => b.won - a.won || b.total - a.total);
  return { counts, revenue, categories: groups(l => l.business.category || 'Other'), opportunities: groups(l => l.opportunityType || 'Unclassified'), unvaluedWins: leads.filter(l => l.status === 'Won' && (l.actualValue === '' || l.actualValue == null)).length };
}
export function crmCsv(leads) {
  const cell = value => { let s = String(value ?? ''); if (/^[\s\u0000-\u001f]*[=+@-]|^[\t\r\n]/.test(s)) s = `'${s}`; return `"${s.replaceAll('"', '""')}"`; };
  const rows = [['Company name', 'Website URL', 'Email', 'Phone number', 'City / Address', 'Lifecycle stage', 'Deal amount', 'Currency', 'Next activity date', 'Next activity', 'Opportunity', 'Notes'], ...leads.map(l => [l.business.name, l.verification?.website ?? l.business.website, l.verification?.email ?? l.business.email, l.verification?.phone ?? l.business.phone, l.business.address, l.status, l.actualValue === '' ? l.quote : l.actualValue, l.dealCurrency || 'EUR', l.nextDate, l.nextAction, l.opportunity, l.notes])];
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n');
}
export function followupCalendar(leads) {
  const esc = s => String(s || '').replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Leadrove//Follow-ups//EN'];
  for (const l of leads) if (/^\d{4}-\d{2}-\d{2}$/.test(l.nextDate) && !['Won', 'Lost', 'Not a fit', 'Do not contact'].includes(l.status)) lines.push('BEGIN:VEVENT', `UID:${encodeURIComponent(l.business.id)}-${l.nextDate}@leadrove`, `DTSTAMP:${new Date(l.updatedAt || Date.now()).toISOString().replace(/[-:]|\.\d{3}/g, '')}`, `DTSTART;VALUE=DATE:${l.nextDate.replaceAll('-', '')}`, `SUMMARY:${esc(`Follow up: ${l.business.name}`)}`, `DESCRIPTION:${esc(l.nextAction)}`, 'END:VEVENT');
  lines.push('END:VCALENDAR');
  return lines.map(line => { const chunks = []; let part = ''; for (const c of line) { if (new TextEncoder().encode(part + c).length > 73) { chunks.push(part); part = ' '; } part += c; } return [...chunks, part].join('\r\n'); }).join('\r\n');
}
