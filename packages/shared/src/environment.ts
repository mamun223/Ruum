/**
 * Environmental base of the Abjad formula:
 * base = 4064 + country + city + local day name + Hijri month name + Hijri year
 * player remainder = (first-name meaning value + base) mod 9 (0 counts as 9)
 */

import { calculateAbjadValue, calculateRemainder } from "./abjad";
import { normalizeName } from "./names";

export const ENVIRONMENT_BASE_CONSTANT = 4064;

/** Index 0 = Sunday ... 6 = Saturday (matches getLocalWeekday) */
export const ARABIC_WEEKDAYS = [
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
];

/** Index 0 = Muharram ... 11 = Dhu al-Hijjah */
export const HIJRI_MONTHS_ARABIC = [
  "محرم",
  "صفر",
  "ربيع الأول",
  "ربيع الآخر",
  "جمادى الأولى",
  "جمادى الآخرة",
  "رجب",
  "شعبان",
  "رمضان",
  "شوال",
  "ذو القعدة",
  "ذو الحجة",
];

export interface EnvironmentInput {
  countryArabic: string;
  cityArabic: string;
  /** 0 = Sunday ... 6 = Saturday, tournament-local */
  weekday: number;
  /** 1-12 */
  hijriMonth: number;
  hijriYear: number;
}

export interface EnvironmentBase {
  constant: number;
  country: number;
  city: number;
  day: number;
  month: number;
  year: number;
  total: number;
  countryArabic: string;
  cityArabic: string;
  dayArabic: string;
  monthArabic: string;
}

export function calculateEnvironmentBase(input: EnvironmentInput): EnvironmentBase {
  const dayArabic = ARABIC_WEEKDAYS[input.weekday];
  const monthArabic = HIJRI_MONTHS_ARABIC[input.hijriMonth - 1];
  if (!dayArabic || !monthArabic) throw new Error("Invalid weekday or Hijri month");

  const country = calculateAbjadValue(input.countryArabic);
  const city = calculateAbjadValue(input.cityArabic);
  const day = calculateAbjadValue(dayArabic);
  const month = calculateAbjadValue(monthArabic);
  const year = input.hijriYear;

  return {
    constant: ENVIRONMENT_BASE_CONSTANT,
    country,
    city,
    day,
    month,
    year,
    total: ENVIRONMENT_BASE_CONSTANT + country + city + day + month + year,
    countryArabic: input.countryArabic,
    cityArabic: input.cityArabic,
    dayArabic,
    monthArabic,
  };
}

export function calculatePlayerRemainder(nameValue: number, baseTotal: number): number {
  return calculateRemainder(nameValue + baseTotal);
}

/**
 * City from a tournament name, e.g. "W15 Singapore" -> "Singapore",
 * "Almaty Open - Almaty" -> "Almaty", "Fort Worth Challenger" -> "Fort Worth"
 */
export function cityFromTournament(tournament: string): string {
  let city = tournament.includes(" - ")
    ? tournament.slice(tournament.lastIndexOf(" - ") + 3)
    : tournament;
  city = city
    .replace(/^(?:[MW]\d+|ATP|WTA|ITF)\s+/i, "")
    .replace(/\bChallenger\b/gi, "")
    .replace(/\s+\d+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return city || tournament.trim();
}

/** Lookup key for a country code or city name */
export function placeKey(name: string): string {
  return normalizeName(name);
}
