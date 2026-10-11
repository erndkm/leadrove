/// <reference types="node" />
import test from "node:test";
import assert from "node:assert/strict";
import {
  distance,
  validSample,
  shouldScan,
  mergeEncounters,
  pruneLeads,
  nextMidnight,
  dayKey,
  scoreBusiness,
  categoryFor,
  kindLabel,
  isClosed,
  isNoncommercial,
  uniqueSaved,
} from "../src/services/discovery-core";
import type { Business, LocationSample } from "../src/types";
const now = new Date(2026, 9, 9, 12).getTime();
const sample: LocationSample = {
  latitude: 52.5,
  longitude: 13.4,
  accuracy: 20,
  timestamp: now,
};
const business: Business = {
  id: "node/1",
  name: "Local Salon",
  kind: "hairdresser",
  category: "beauty",
  latitude: 52.5,
  longitude: 13.4,
  address: "",
  phone: "123",
  email: "",
  sourceUrl: "https://www.openstreetmap.org/node/1",
  distanceMeters: 100,
  ...scoreBusiness({ phone: "123" }),
};
test("distance agrees with known equatorial separation", () => {
  assert.ok(
    Math.abs(
      distance({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }) -
        111195,
    ) < 2,
  );
});
test("rejects stale, inaccurate, future and impossible GPS points", () => {
  assert.equal(validSample(sample, null, now), true);
  assert.equal(validSample({ ...sample, accuracy: 101 }, null, now), false);
  assert.equal(
    validSample({ ...sample, timestamp: now - 120001 }, null, now),
    false,
  );
  assert.equal(
    validSample({ ...sample, timestamp: now + 10001 }, null, now),
    false,
  );
  assert.equal(
    validSample(
      { ...sample, latitude: 53, timestamp: now + 1000 },
      sample,
      now + 1000,
    ),
    false,
  );
  assert.equal(validSample(sample, sample, now), false);
});
test("automatic scanning requires both time and movement", () => {
  const moved = { ...sample, latitude: 52.51, timestamp: now + 120000 };
  assert.equal(shouldScan(moved, sample, now, now + 119999), false);
  assert.equal(
    shouldScan(
      { ...sample, timestamp: now + 120000 },
      sample,
      now,
      now + 120000,
    ),
    false,
  );
  assert.equal(shouldScan(moved, sample, now, now + 120000), true);
});
test("one encounter per business per local day, preserves saved state and closest approach", () => {
  const first = mergeEncounters([], [business], now);
  first.leads[0].saved = true;
  first.leads[0].notes = "Call next week";
  const again = mergeEncounters(
    first.leads,
    [{ ...business, distanceMeters: 50 }],
    now + 120000,
  );
  assert.equal(again.leads.length, 1);
  assert.equal(again.fresh.length, 0);
  assert.equal(again.leads[0].seenCount, 2);
  assert.equal(again.leads[0].closestDistanceMeters, 50);
  const tomorrow = mergeEncounters(
    again.leads,
    [business],
    nextMidnight(now) + 1000,
  );
  assert.equal(tomorrow.leads.length, 2);
  assert.equal(tomorrow.leads[1].saved, true);
  assert.equal(tomorrow.leads[1].notes, "Call next week");
});
test("keeps seven calendar days and saves independently of age", () => {
  const old = mergeEncounters([], [business], now - 8 * 86400000).leads[0];
  assert.equal(pruneLeads([old], now).length, 0);
  assert.equal(pruneLeads([{ ...old, saved: true }], now).length, 1);
});
test("day session expires at next local midnight", () => {
  assert.equal(new Date(nextMidnight(now)).getHours(), 0);
  assert.notEqual(dayKey(now), dayKey(nextMidnight(now)));
});
test("website heuristic is honest and distinguishes social domains from lookalikes", () => {
  assert.equal(scoreBusiness({}).websiteStatus, "missing");
  assert.equal(
    scoreBusiness({ website: "https://instagram.com/salon" }).websiteStatus,
    "social",
  );
  assert.equal(
    scoreBusiness({ website: "https://instagram.com.fake.test" }).websiteStatus,
    "website",
  );
  assert.match(scoreBusiness({}).reasons[0], /verify independently/);
  assert.ok(scoreBusiness({ brand: "Chain" }).score < scoreBusiness({}).score);
});

test("website evidence recognizes social subdomains and prefers a dedicated site across tags", () => {
  assert.equal(scoreBusiness({ "contact:facebook": "https://m.facebook.com/salon" }).websiteStatus, "social");
  const combined = scoreBusiness({ website: "https://instagram.com/salon", "contact:website": "salon.example" });
  assert.equal(combined.websiteStatus, "website");
  assert.equal(combined.website, "https://salon.example/");
  assert.equal(scoreBusiness({ website: "https://instagram.com?profile=salon" }).websiteStatus, "social");
  assert.equal(scoreBusiness({ website: "https://instagram.com.evil.example/salon" }).websiteStatus, "website");
  assert.equal(scoreBusiness({ website: "  " }).websiteStatus, "missing");
  for (const value of ["javascript:alert(1)", "https://user:pass@example.com", "not a URL"]) {
    const result = scoreBusiness({ website: value });
    assert.equal(result.website, "");
    assert.equal(result.websiteStatus, "website");
    assert.match(result.reasons[0], /could not be parsed; verify independently/);
    assert.ok(result.score < scoreBusiness({}).score);
  }
});

test("noncommercial offices are excluded while professional businesses remain eligible", () => {
  for (const office of ["government", "political_party", "diplomatic", "association", "ngo", "religion", "educational_institution", "research"])
    assert.equal(isNoncommercial({ office }), true);
  for (const office of ["lawyer", "accountant", "estate_agent", "company"])
    assert.equal(isNoncommercial({ office }), false);
});
test("closed businesses are excluded and automotive services use meaningful categories", () => {
  assert.equal(categoryFor({ shop: "car_repair" }), "trades");
  assert.equal(kindLabel({ shop: "car_repair" }), "Auto repair");
  assert.equal(isClosed({ shop: "vacant" }), true);
  assert.equal(isClosed({ shop: "hairdresser", disused: "yes" }), true);
  assert.equal(
    isClosed({ shop: "hairdresser", opening_hours: "Mo-Fr 09:00-18:00" }),
    false,
  );
});
test("saved business collection is unique across days and keeps latest details and notes", () => {
  const first = mergeEncounters([], [business], now).leads[0];
  const saved = uniqueSaved([
    { ...first, saved: true, notes: "Old" },
    {
      ...first,
      saved: true,
      dayKey: "2026-10-10",
      lastSeenAt: now + 86400000,
      notes: "Updated",
    },
  ]);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].notes, "Updated");
});
