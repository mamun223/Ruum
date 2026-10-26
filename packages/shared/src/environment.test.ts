import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ARABIC_WEEKDAYS,
  ENVIRONMENT_BASE_CONSTANT,
  HIJRI_MONTHS_ARABIC,
  calculateEnvironmentBase,
  calculatePlayerRemainder,
  cityFromTournament,
  placeKey,
} from "./environment";
import { calculateAbjadValue } from "./abjad";
import { getHijriDate, getLocalWeekday } from "./timezone";

test("environment parts use the user's Abjad values", () => {
  assert.equal(ENVIRONMENT_BASE_CONSTANT, 4064);
  assert.equal(calculateAbjadValue("سنغافورة"), 60 + 50 + 1000 + 1 + 80 + 6 + 200 + 400);
  assert.equal(calculateAbjadValue(ARABIC_WEEKDAYS[5]), 1 + 30 + 3 + 40 + 70 + 400);
  assert.equal(calculateAbjadValue(HIJRI_MONTHS_ARABIC[4]), 136);
});

test("Singapore, Friday 23 Oct 2026 = 12 Jumada al-Awwal 1448", () => {
  const instant = new Date("2026-10-23T05:00:00Z");
  assert.equal(getLocalWeekday(instant, "Asia/Singapore"), 5);
  assert.deepEqual(getHijriDate(instant, "Asia/Singapore"), { year: 1448, month: 5, day: 12 });
});

test("Aruzhan vs Fang at W15 Singapore (taa marbuta = 400)", () => {
  const base = calculateEnvironmentBase({
    countryArabic: "سنغافورة",
    cityArabic: "سنغافورة",
    weekday: 5,
    hijriMonth: 5,
    hijriYear: 1448,
  });
  assert.equal(base.country, 1797);
  assert.equal(base.city, 1797);
  assert.equal(base.day, 544);
  assert.equal(base.month, 136);
  assert.equal(base.year, 1448);
  assert.equal(base.total, 4064 + 1797 + 1797 + 544 + 136 + 1448);
  assert.equal(base.total, 9786);

  const aruzhan = calculateAbjadValue("روح جميلة");
  const fang = calculateAbjadValue("عطر");
  assert.equal(aruzhan, 697);
  assert.equal(fang, 279);
  assert.equal(calculatePlayerRemainder(aruzhan, base.total), 7); // 10483 mod 9
  assert.equal(calculatePlayerRemainder(fang, base.total), 3); // 10065 mod 9
});

test("user's original worked example reproduces with taa marbuta = 5 values", () => {
  // Base 8501 and names 302 / 279 from the user's hand calculation
  assert.equal(calculatePlayerRemainder(302, 8501), 1);
  assert.equal(calculatePlayerRemainder(279, 8501), 5);
});

test("an exact multiple of 9 gives remainder 9", () => {
  assert.equal(calculatePlayerRemainder(9, 9), 9);
});

test("city is extracted from the tournament name", () => {
  assert.equal(cityFromTournament("W15 Singapore"), "Singapore");
  assert.equal(cityFromTournament("M25 Santa Margherita di Pula"), "Santa Margherita di Pula");
  assert.equal(cityFromTournament("Almaty Open - Almaty"), "Almaty");
  assert.equal(cityFromTournament("Grand Prix Auvergne-Rhone-Alpes - Lyon"), "Lyon");
  assert.equal(cityFromTournament("Fort Worth Challenger"), "Fort Worth");
  assert.equal(cityFromTournament("W100 Wrexham"), "Wrexham");
  assert.equal(cityFromTournament("M15 Monastir 2"), "Monastir");
});

test("place keys are normalized", () => {
  assert.equal(placeKey("Sharm ElSheikh"), "sharm elsheikh");
  assert.equal(placeKey("Loulé"), "loule");
});
