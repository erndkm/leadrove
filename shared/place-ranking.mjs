// Shared by the browser and native clients. Context is a hint, never a country filter.
const PHOTON_LANGUAGES = new Set(['en', 'de', 'fr']);
const SETTLEMENT_KIND = /^(city|town|village|hamlet|municipality|suburb|quarter|neighbourhood|neighborhood|district|locality)$/i;
const TIME_ZONE_COUNTRIES = {
  'Europe/Berlin': 'DE', 'Europe/Busingen': 'DE', 'Europe/Paris': 'FR',
  'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Vienna': 'AT',
  'Europe/Zurich': 'CH', 'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE',
  'Europe/Luxembourg': 'LU', 'Europe/Madrid': 'ES', 'Atlantic/Canary': 'ES',
  'Europe/Lisbon': 'PT', 'Atlantic/Azores': 'PT', 'Europe/Rome': 'IT',
  'Europe/Warsaw': 'PL', 'Europe/Prague': 'CZ', 'Europe/Bratislava': 'SK',
  'Europe/Budapest': 'HU', 'Europe/Bucharest': 'RO', 'Europe/Sofia': 'BG',
  'Europe/Athens': 'GR', 'Europe/Helsinki': 'FI', 'Europe/Stockholm': 'SE',
  'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK', 'Atlantic/Reykjavik': 'IS',
  'Europe/Tallinn': 'EE', 'Europe/Riga': 'LV', 'Europe/Vilnius': 'LT',
  'Europe/Kyiv': 'UA', 'Europe/Kiev': 'UA', 'Europe/Istanbul': 'TR',
  'Europe/Zagreb': 'HR', 'Europe/Ljubljana': 'SI', 'Europe/Belgrade': 'RS',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US',
  'America/Los_Angeles': 'US', 'America/Phoenix': 'US', 'America/Anchorage': 'US',
  'Pacific/Honolulu': 'US', 'America/Toronto': 'CA', 'America/Vancouver': 'CA',
  'America/Edmonton': 'CA', 'America/Winnipeg': 'CA', 'America/Halifax': 'CA',
  'America/St_Johns': 'CA', 'America/Mexico_City': 'MX', 'America/Cancun': 'MX',
  'America/Sao_Paulo': 'BR', 'America/Bogota': 'CO', 'America/Lima': 'PE',
  'America/Santiago': 'CL', 'America/Argentina/Buenos_Aires': 'AR',
  'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Shanghai': 'CN',
  'Asia/Hong_Kong': 'HK', 'Asia/Taipei': 'TW', 'Asia/Singapore': 'SG',
  'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Bangkok': 'TH',
  'Asia/Jakarta': 'ID', 'Asia/Manila': 'PH', 'Asia/Dubai': 'AE',
  'Asia/Jerusalem': 'IL', 'Asia/Riyadh': 'SA', 'Asia/Kuala_Lumpur': 'MY',
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU',
  'Australia/Perth': 'AU', 'Australia/Adelaide': 'AU', 'Australia/Darwin': 'AU',
  'Australia/Hobart': 'AU', 'Pacific/Auckland': 'NZ', 'Pacific/Chatham': 'NZ',
  'Africa/Johannesburg': 'ZA', 'Africa/Cairo': 'EG', 'Africa/Lagos': 'NG',
  'Africa/Nairobi': 'KE', 'Africa/Casablanca': 'MA',
};
const COUNTRY_NAMES = {
  DE: ['Germany', 'Deutschland', 'Allemagne'], FR: ['France', 'Frankreich'],
  GB: ['United Kingdom', 'Great Britain', 'Britain', 'UK', 'Royaume Uni', 'Vereinigtes Königreich'],
  US: ['United States', 'United States of America', 'USA', 'Vereinigte Staaten', 'États Unis'],
  AT: ['Austria', 'Österreich', 'Autriche'], CH: ['Switzerland', 'Schweiz', 'Suisse'],
  NL: ['Netherlands', 'Niederlande', 'Pays Bas'], BE: ['Belgium', 'Belgien', 'Belgique'],
  ES: ['Spain', 'España', 'Spanien', 'Espagne'], IT: ['Italy', 'Italia', 'Italien', 'Italie'],
  PT: ['Portugal'], IE: ['Ireland', 'Irland', 'Irlande'], CA: ['Canada', 'Kanada'],
  AU: ['Australia', 'Australien', 'Australie'], NZ: ['New Zealand', 'Neuseeland', 'Nouvelle Zélande'],
  PL: ['Poland', 'Polska', 'Polen', 'Pologne'], CZ: ['Czechia', 'Czech Republic', 'Tschechien', 'Tchéquie'],
  DK: ['Denmark', 'Danmark', 'Dänemark', 'Danemark'], SE: ['Sweden', 'Sverige', 'Schweden', 'Suède'],
  NO: ['Norway', 'Norge', 'Norwegen', 'Norvège'], FI: ['Finland', 'Suomi', 'Finnland', 'Finlande'],
  TR: ['Türkiye', 'Turkey', 'Türkei', 'Turquie'], GR: ['Greece', 'Griechenland', 'Grèce'],
  UA: ['Ukraine'], BR: ['Brazil', 'Brasil', 'Brasilien', 'Brésil'],
  MX: ['Mexico', 'México', 'Mexiko', 'Mexique'], IN: ['India', 'Indien', 'Inde'],
  JP: ['Japan', 'Japon', '日本'], CN: ['China', 'Chine', '中国'],
};
const US_STATES = Object.fromEntries([
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'],
  ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'],
  ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'], ['ID', 'Idaho'],
  ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'],
  ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'],
  ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'],
  ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'],
  ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'],
  ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'],
  ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'],
  ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'],
  ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'],
  ['WI', 'Wisconsin'], ['WY', 'Wyoming'], ['DC', 'District of Columbia'],
].map(([code, name]) => [name.toLowerCase(), code]));

const clean = value => typeof value === 'string' ? value.trim() : '';
export function normalizePlaceText(value) {
  return clean(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/ß/g, 'ss').replace(/æ/g, 'ae').replace(/œ/g, 'oe')
    .replace(/ø/g, 'o').replace(/ł/g, 'l').replace(/đ/g, 'd').replace(/ı/g, 'i')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}
const transliterated = value => normalizePlaceText(value).replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u');
const countryCode = value => {
  const code = clean(value).toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code === 'UK' ? 'GB' : code : '';
};
const uniqueParts = values => [...new Map(values.map(clean).filter(Boolean).map(value => [normalizePlaceText(value), value])).values()];
function coordinates(value) {
  const lat = value?.lat ?? value?.latitude, lng = value?.lng ?? value?.longitude;
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : undefined;
}

/** Validate GeoJSON before it reaches either client's selection UI. */
export function normalizePhotonFeatures(features) {
  if (!Array.isArray(features)) return [];
  return features.flatMap(feature => {
    if (feature?.geometry?.type !== 'Point' || !Array.isArray(feature.geometry.coordinates)) return [];
    const point = coordinates({ lng: feature.geometry.coordinates[0], lat: feature.geometry.coordinates[1] });
    if (!point) return [];
    const p = feature.properties;
    if (!p || typeof p !== 'object' || Array.isArray(p)) return [];
    const street = clean(p.street), housenumber = clean(p.housenumber);
    const address = [street, housenumber].filter(Boolean).join(' ');
    const name = clean(p.name) || address || clean(p.city) || clean(p.district) || clean(p.state) || clean(p.country);
    if (!name) return [];
    const city = clean(p.city), district = clean(p.district), county = clean(p.county);
    const state = clean(p.state), country = clean(p.country), code = countryCode(p.countrycode);
    // Photon can call a boundary centroid "other"; retain its geographic role.
    const osmKey = clean(p.osm_key), osmValue = clean(p.osm_value);
    const kind = osmKey === 'boundary' && osmValue === 'administrative' ? 'administrative'
      : osmKey === 'place' && SETTLEMENT_KIND.test(osmValue) ? osmValue
        : clean(p.type) || osmValue || osmKey;
    const postcode = clean(p.postcode), region = state || county;
    const aliases = uniqueParts([name, address, housenumber && street ? `${housenumber} ${street}` : '', ...Object.entries(p).filter(([key]) => /^name:/.test(key)).map(([, value]) => value)]);
    const label = uniqueParts([name, address, district, city, county, state, country]).join(', ');
    const osmType = clean(p.osm_type);
    const osmId = typeof p.osm_id === 'number' || typeof p.osm_id === 'string' ? String(p.osm_id) : '';
    const id = osmType && osmId ? `${osmType}/${osmId}` : `${point.lat.toFixed(5)},${point.lng.toFixed(5)}:${normalizePlaceText(name)}`;
    return [{ id, ...point, label, name, region, city, district, county, state, country, countryCode: code, kind, aliases, street, housenumber, postcode }];
  });
}

function recentPlace(value) {
  const point = coordinates(value);
  if (!point) return null;
  const label = clean(value?.label), name = clean(value?.name) || label.split(',')[0].trim();
  if (!name) return null;
  return {
    ...point, id: clean(value.id), label: label || name, name,
    region: clean(value.region), city: clean(value.city), district: clean(value.district),
    county: clean(value.county), state: clean(value.state), country: clean(value.country),
    countryCode: countryCode(value.countryCode), kind: clean(value.kind),
    aliases: uniqueParts([name, ...(Array.isArray(value.aliases) ? value.aliases : [])]),
    street: clean(value.street), housenumber: clean(value.housenumber), postcode: clean(value.postcode),
  };
}

/** Uses existing hints only; this function never reads the device or asks permission. */
export function derivePlaceContext(input = {}) {
  const languages = (Array.isArray(input.languages) ? input.languages : [input.languages]).map(clean).filter(Boolean);
  const language = languages.map(locale => locale.toLowerCase().split(/[-_]/)[0]).find(value => PHOTON_LANGUAGES.has(value));
  const localeCountries = languages.map(locale => {
    // Stop before Unicode/private extensions: en-u-rg-uszzzz is not a region subtag.
    const parts = locale.replace(/_/g, '-').split('-').slice(1);
    const extension = parts.findIndex(part => part.length === 1);
    return (extension < 0 ? parts : parts.slice(0, extension)).find(part => /^[a-z]{2}$/i.test(part));
  });
  const countries = [input.regionCode, ...(Array.isArray(input.countryCodes) ? input.countryCodes : []), TIME_ZONE_COUNTRIES[clean(input.timeZone)], ...localeCountries];
  const countryCodes = [...new Set(countries.map(countryCode).filter(Boolean))];
  const recentPlaces = (Array.isArray(input.recentPlaces) ? input.recentPlaces : []).map(recentPlace).filter(Boolean).slice(0, 8);
  const nearby = coordinates(input.nearby);
  return { ...(language ? { language } : {}), countryCodes, ...(nearby ? { nearby } : {}), recentPlaces };
}

/** Cache keys must change when a user changes their area, locale or recent choices. */
export function contextKey(context = {}) {
  const nearby = coordinates(context.nearby);
  return JSON.stringify({
    language: clean(context.language), countries: context.countryCodes || [],
    nearby: nearby ? [Number(nearby.lat.toFixed(3)), Number(nearby.lng.toFixed(3))] : null,
    recent: (context.recentPlaces || []).slice(0, 8).map(place => [clean(place.id), place.lat, place.lng, clean(place.label)]),
  });
}

function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const value = Math.sin((a.lat - b.lat) * rad / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((a.lng - b.lng) * rad / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, value))));
}
function administration(place) {
  const code = countryCode(place.countryCode);
  return uniqueParts([
    place.city, place.district, place.county, place.state, place.region, place.country,
    place.postcode, code, ...(COUNTRY_NAMES[code] || []),
    code === 'US' ? US_STATES[normalizePlaceText(place.state)] : '',
    // Old stored choices may only have a display label.
    ...clean(place.label).split(',').slice(1),
  ]).map(normalizePlaceText);
}
function qualifierMatch(qualifier, fields) {
  const parts = normalizePlaceText(qualifier).split(' ').filter(Boolean);
  if (!parts.length) return 0;
  const tokens = new Set(fields.flatMap(field => field.split(' ')));
  return parts.filter((part, index) => tokens.has(part)
    || (index === parts.length - 1 && part.length >= 2 && [...tokens].some(token => token.startsWith(part)))).length / parts.length;
}
function lexicalMatch(place, query, inferQualifier) {
  const segments = query.split(',').map(normalizePlaceText).filter(Boolean);
  const head = segments[0] || '', explicit = segments.slice(1).join(' ');
  const names = uniqueParts([place.name, ...(Array.isArray(place.aliases) ? place.aliases : [])]).map(normalizePlaceText);
  const fields = administration(place);
  let best = { score: 0, exact: false, qualified: Boolean(explicit) };
  for (const name of names) {
    let score = 0, exact = false, qualifier = explicit;
    if (head === name || transliterated(head) === transliterated(name)) { score = 3000; exact = true; }
    else if (inferQualifier && head.startsWith(`${name} `)) { score = 3000; exact = true; qualifier = [head.slice(name.length), explicit].filter(Boolean).join(' '); }
    else if (name.startsWith(head) || transliterated(name).startsWith(transliterated(head))) score = 2500;
    else if (name.split(' ').some(part => part.startsWith(head))) score = 2000;
    else if (name.includes(head)) score = 1500;
    if (score && qualifier) {
      const matched = qualifierMatch(qualifier, fields);
      score += matched === 1 ? 4000 : matched > 0 ? -1500 + matched * 500 : -2500;
    }
    if (score > best.score) best = { score, exact, qualified: Boolean(qualifier) };
  }
  // Retain provider-resolved aliases and addresses even when no local name matches.
  if (!best.score) {
    const queryTokens = normalizePlaceText(query).split(' ').filter(Boolean);
    const labelTokens = normalizePlaceText(place.label).split(' ');
    if (queryTokens.length && queryTokens.every(token => labelTokens.some(part => part.startsWith(token)))) best.score = 1200;
  }
  return best;
}
function contextBoost(place, context) {
  const countryIndex = (context.countryCodes || []).indexOf(place.countryCode);
  let boost = countryIndex < 0 ? 0 : 24 / (countryIndex + 1);
  const nearby = coordinates(context.nearby);
  if (nearby) boost += 48 / (1 + distanceKm(place, nearby) / 80);
  const history = (context.recentPlaces || []).findIndex(recent =>
    (place.id && recent.id === place.id) ||
    (normalizePlaceText(recent.name || recent.label?.split(',')[0]) === normalizePlaceText(place.name) && coordinates(recent) && distanceKm(place, recent) < 2));
  if (history >= 0) boost += 38 / (1 + history * 0.3);
  return boost;
}

function samePlace(a, b) {
  if (a.id && a.id === b.id) return true;
  if (normalizePlaceText(a.label) !== normalizePlaceText(b.label)) return false;
  // A municipality's polygon centroid can sit several kilometres from its town node.
  // Only known administrative representations get this wider tolerance; two towns,
  // streets or venues keep the original 1 km rule even if their labels are identical.
  const administrativePair = (a.kind === 'administrative' || b.kind === 'administrative')
    && (a.kind === 'administrative' || SETTLEMENT_KIND.test(a.kind))
    && (b.kind === 'administrative' || SETTLEMENT_KIND.test(b.kind));
  return distanceKm(a, b) < (administrativePair ? 15 : 1);
}

/** Text/explicit qualifiers dominate; context only resolves similarly good matches. */
export function rankPlaceSuggestions(places, query, context = {}, limit = 6) {
  if (!Array.isArray(places) || !normalizePlaceText(query)) return [];
  const valid = places.filter(place => coordinates(place) && clean(place.label));
  // "New York" should stay a full name when present, not become "New, York".
  const inferQualifier = query.includes(',') || !valid.some(place =>
    [place.name, ...(Array.isArray(place.aliases) ? place.aliases : [])]
      .some(name => transliterated(name) === transliterated(query)));
  const ranked = valid.map((place, index) => {
    const match = lexicalMatch(place, clean(query), inferQualifier);
    const settlement = SETTLEMENT_KIND.test(place.kind);
    const addressQuery = /\d/.test(query) || (place.street && normalizePlaceText(query).includes(normalizePlaceText(place.street)));
    const kindBoost = addressQuery ? 0 : settlement ? 32 : place.kind === 'administrative' ? 8 : 0;
    return { place, index, ...match, score: match.score + kindBoost + contextBoost(place, context) + 12 / (index + 1) };
  }).sort((a, b) => b.score - a.score || a.index - b.index);
  const distinct = [];
  for (const item of ranked) {
    if (distinct.some(({ place }) => samePlace(item.place, place))) continue;
    distinct.push(item);
  }
  const count = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 6;
  const selected = distinct.slice(0, count);
  // Keep the provider's strongest global exact hit visible among ambiguous local names.
  const globalExact = distinct.filter(item => item.exact && !item.qualified).sort((a, b) => a.index - b.index)[0];
  if (count >= 2 && globalExact && !selected.includes(globalExact) && selected.length) selected[selected.length - 1] = globalExact;
  return selected.map(item => item.place);
}
