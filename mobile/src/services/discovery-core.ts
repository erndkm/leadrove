import type {
  Business,
  BusinessCategory,
  DiscoverySettings,
  LocationSample,
  NearbyLead,
} from "../types";

export const SCAN_INTERVAL = 120_000;
export const MOVEMENT_METERS = 200;
export function dayKey(time = Date.now()) {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function nextMidnight(time = Date.now()) {
  const d = new Date(time);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}
export function distance(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const rad = Math.PI / 180;
  const lat = (b.latitude - a.latitude) * rad;
  const lon = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(lat / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(lon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function validSample(
  sample: LocationSample,
  previous: LocationSample | null,
  now = Date.now(),
) {
  if (
    ![
      sample.latitude,
      sample.longitude,
      sample.accuracy,
      sample.timestamp,
    ].every(Number.isFinite) ||
    Math.abs(sample.latitude) > 90 ||
    Math.abs(sample.longitude) > 180 ||
    sample.accuracy < 0 ||
    sample.accuracy > 100 ||
    now - sample.timestamp > 120000 ||
    sample.timestamp > now + 10000
  )
    return false;
  if (previous) {
    const seconds = (sample.timestamp - previous.timestamp) / 1000;
    if (seconds <= 0) return false;
    if (distance(previous, sample) > Math.max(200, seconds * 70)) return false;
  }
  return true;
}
export function shouldScan(
  sample: LocationSample,
  last: LocationSample | null,
  lastTime: number | null,
  now = Date.now(),
) {
  return (
    (!lastTime || now - lastTime >= SCAN_INTERVAL) &&
    (!last || distance(sample, last) >= MOVEMENT_METERS)
  );
}
export function pruneLeads(leads: NearbyLead[], now = Date.now()) {
  const cutoff = new Date(now);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - 6);
  return leads.filter((l) => l.saved || l.lastSeenAt >= cutoff.getTime());
}
export function mergeEncounters(
  leads: NearbyLead[],
  businesses: Business[],
  time: number,
) {
  const next = [...leads];
  const fresh: NearbyLead[] = [];
  for (const b of businesses) {
    const i = next.findIndex((l) => l.id === b.id && l.dayKey === dayKey(time));
    if (i >= 0) {
      const old = next[i];
      next[i] = {
        ...old,
        ...b,
        closestDistanceMeters: Math.min(
          old.closestDistanceMeters,
          b.distanceMeters,
        ),
        lastSeenAt: time,
        seenCount: old.seenCount + 1,
      };
    } else {
      const prior = next.find((l) => l.id === b.id);
      const item: NearbyLead = {
        ...b,
        firstSeenAt: time,
        lastSeenAt: time,
        closestDistanceMeters: b.distanceMeters,
        seenCount: 1,
        saved: prior?.saved ?? false,
        dismissed: prior?.dismissed ?? false,
        dayKey: dayKey(time),
        notes: prior?.notes ?? "",
      };
      next.push(item);
      // A repeat encounter is useful history, but not a newly discovered lead.
      if (!item.dismissed && !prior) fresh.push(item);
    }
  }
  return { leads: pruneLeads(next, time), fresh };
}
export function categoryFor(tags: Record<string, string>): BusinessCategory {
  const kind =
    tags.shop ||
    tags.craft ||
    tags.amenity ||
    tags.office ||
    tags.tourism ||
    "";
  if (/hairdresser|beauty|massage|tattoo/.test(kind)) return "beauty";
  if (tags.craft || /^(car_repair|car_parts|tyres|bicycle_repair)$/.test(kind))
    return "trades";
  if (/restaurant|cafe|bar|pub|fast_food|bakery|butcher/.test(kind))
    return "food";
  if (/doctor|dentist|pharmacy|clinic|physio/.test(kind)) return "health";
  if (tags.shop) return "retail";
  if (tags.tourism) return "hospitality";
  return "professional";
}
export function kindLabel(tags: Record<string, string>) {
  const kind =
    tags.shop ||
    tags.craft ||
    tags.amenity ||
    tags.office ||
    tags.tourism ||
    "business";
  const labels: Record<string, string> = {
    hairdresser: "Hair salon",
    beauty: "Beauty salon",
    car_repair: "Auto repair",
    car_parts: "Auto parts",
    tyres: "Tire service",
    fast_food: "Quick-service restaurant",
    doctors: "Medical practice",
    dentist: "Dental practice",
    physiotherapist: "Physiotherapy",
    estate_agent: "Real estate agency",
    guest_house: "Guest house",
    clothes: "Clothing store",
    convenience: "Convenience store",
    doityourself: "Home improvement store",
    yes: "Local business",
  };
  return (
    labels[kind] ??
    kind
      .replaceAll("_", " ")
      .replace(/^\w/, (character) => character.toUpperCase())
  );
}
export function isClosed(tags: Record<string, string>) {
  return (
    ["disused", "abandoned", "demolished", "razed", "closed"].some(
      (key) => tags[key] === "yes",
    ) ||
    ["shop", "amenity", "office", "craft", "tourism"].some((key) =>
      /^(vacant|disused|abandoned|closed|no)$/.test(tags[key] ?? ""),
    ) ||
    !!tags["disused:shop"] ||
    !!tags["abandoned:shop"] ||
    tags.opening_hours === "closed"
  );
}
export function isNoncommercial(tags: Record<string, string>) {
  return [
    "government", "political_party", "association", "ngo", "diplomatic",
    "religion", "educational_institution", "research",
  ].includes(tags.office);
}

function listedUrl(raw: string) {
  const value = raw.trim();
  if (!value || /[\u0000-\u0020\u007f]/.test(value)) return "";
  if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^https?:\/\//i.test(value))
    return "";
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value.replace(/^\/\//, "")}`);
    return url.hostname.includes(".") && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}

function isSocialUrl(value: string) {
  const host = new URL(value).hostname.toLowerCase();
  return ["facebook.com", "facebook.de", "instagram.com", "tiktok.com", "linktr.ee", "wa.me"]
    .some((domain) => host === domain || host.endsWith(`.${domain}`));
}
export function uniqueSaved(leads: NearbyLead[]) {
  const saved = new Map<string, NearbyLead>();
  for (const lead of leads)
    if (
      lead.saved &&
      (!saved.has(lead.id) || saved.get(lead.id)!.lastSeenAt < lead.lastSeenAt)
    )
      saved.set(lead.id, lead);
  return [...saved.values()];
}
export function scoreBusiness(tags: Record<string, string>) {
  const listed = [tags.website, tags["contact:website"], tags.url,
    tags["contact:facebook"], tags["contact:instagram"]].filter(Boolean);
  const urls = listed.flatMap((value) => value.split(";").map(listedUrl)).filter(Boolean);
  // Prefer a dedicated site when both a social profile and a site are listed.
  const website = urls.find((url) => !isSocialUrl(url)) || urls[0] || "";
  const social = !!website && isSocialUrl(website);
  const websiteStatus: Business["websiteStatus"] = website
    ? social
      ? "social"
      : "website"
    : listed.some((value) => value.trim()) ? "website" : "missing";
  const chain = !!(tags.brand || tags["brand:wikidata"] || tags.operator);
  const reasons = [
    websiteStatus === "missing"
      ? "No website listed in OpenStreetMap; verify independently."
      : social
        ? "Only a social profile is listed."
        : website
          ? "A website is already listed."
          : "A web address is listed but could not be parsed; verify independently.",
  ];
  let score = websiteStatus === "missing" ? 65 : social ? 55 : 15;
  if (tags.phone || tags["contact:phone"]) {
    score += 15;
    reasons.push("A public phone number is listed.");
  }
  if (tags.email || tags["contact:email"]) {
    score += 10;
    reasons.push("A public email is listed.");
  }
  if (chain) {
    score -= 25;
    reasons.push("Brand or operator tag; may be a chain.");
  } else {
    score += 10;
    reasons.push("No brand or operator tag.");
  }
  return {
    website,
    websiteStatus,
    chain,
    score: Math.max(0, Math.min(100, score)),
    reasons,
  };
}
export function matches(b: Business, settings: DiscoverySettings) {
  return (
    b.score >= settings.minScore &&
    (settings.includeChains || !b.chain) &&
    (settings.category === "all" || settings.category === b.category)
  );
}
