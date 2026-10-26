import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeName, firstNameKey, lookupArabicMeaning } from "./names";
import { getHijriDate, getLocalWeekday } from "./timezone";

test("normalizeName strips accents, case and punctuation", () => {
  assert.equal(normalizeName("Rodríguez"), "rodriguez");
  assert.equal(normalizeName("Jan-Lennard  Struff"), "jan lennard struff");
  assert.equal(normalizeName("Carlos María"), "carlos maria");
});

test("firstNameKey uses the first name only", () => {
  assert.equal(firstNameKey("Santiago Rodriguez Taverna"), "santiago");
  assert.equal(firstNameKey("Álex de Miñaur"), "alex");
  assert.equal(firstNameKey("Astra"), "astra");
});

test("firstNameKey ignores compound first names joined together", () => {
  assert.equal(firstNameKey("Jan-Lennard Struff"), null);
  assert.equal(firstNameKey("Hong-Lin Fu"), null);
});

test("firstNameKey ignores doubles teams", () => {
  assert.equal(firstNameKey("Lucas Miedler/Neil Oberleitner"), null);
  assert.equal(firstNameKey("Miedler / Oberleitner"), null);
});

test("lookupArabicMeaning never falls back to surnames", () => {
  const dict = new Map([
    ["talia", "ندى الله"],
    ["lorenzo", "متوج بالغار"],
    ["rodriguez", "x"],
  ]);
  assert.deepEqual(lookupArabicMeaning("Talia Gibson", dict), {
    key: "talia",
    arabicMeaning: "ندى الله",
  });
  assert.deepEqual(lookupArabicMeaning("Lorenzo Musetti", dict), {
    key: "lorenzo",
    arabicMeaning: "متوج بالغار",
  });
  assert.equal(lookupArabicMeaning("Santiago Rodriguez", dict), null);
  assert.equal(lookupArabicMeaning("Jan-Lennard Struff", dict), null);
});

test("local weekday and Hijri date use the given time zone", () => {
  // 2026-10-23T02:00Z is still Thursday Oct 22 in New York, Friday in Tokyo
  const instant = new Date("2026-10-23T02:00:00Z");
  assert.equal(getLocalWeekday(instant, "America/New_York"), 4);
  assert.equal(getLocalWeekday(instant, "Asia/Tokyo"), 5);
  const ny = getHijriDate(instant, "America/New_York");
  const tokyo = getHijriDate(instant, "Asia/Tokyo");
  assert.ok(ny.month >= 1 && ny.month <= 12);
  assert.ok(tokyo.day >= 1 && tokyo.day <= 30);
  assert.notDeepEqual(ny, tokyo);
});
