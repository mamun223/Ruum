import { test } from "node:test";
import assert from "node:assert/strict";
import { getCountryLocalDate, getCountryTimezone } from "./timezone";

test("country default zone", () => {
  assert.equal(getCountryTimezone("USA"), "America/New_York");
  assert.equal(getCountryTimezone("XXX"), "UTC");
});

test("city overrides for multi-zone countries", () => {
  assert.equal(getCountryTimezone("USA", "Austin"), "America/Chicago");
  assert.equal(getCountryTimezone("USA", "Bakersfield"), "America/Los_Angeles");
  assert.equal(getCountryTimezone("AUS", "Perth"), "Australia/Perth");
  assert.equal(getCountryTimezone("USA", "Ithaca"), "America/New_York");
});

test("local date uses the city zone", () => {
  // 03:30 UTC Oct 24 = Oct 23 evening on the US West Coast, Oct 23 night in New York
  const t = new Date("2026-10-24T03:30:00Z");
  assert.equal(getCountryLocalDate(t, "USA", "Bakersfield"), "2026-10-23");
  assert.equal(getCountryLocalDate(t, "USA"), "2026-10-23");
  assert.equal(getCountryLocalDate(new Date("2026-10-24T04:30:00Z"), "USA"), "2026-10-24");
  assert.equal(getCountryLocalDate(new Date("2026-10-24T04:30:00Z"), "USA", "Bakersfield"), "2026-10-23");
});
