/**
 * Arabic country/city names and the environmental base of the formula.
 * Only approved PlaceMapping rows are used in calculations.
 */

import { prisma } from "@tennis-prediction/database";
import {
  calculateAbjadValue,
  calculateEnvironmentBase,
  cityFromTournament,
  EnvironmentBase,
  getCountryTimezone,
  getHijriDate,
  getLocalWeekday,
  placeKey,
} from "@tennis-prediction/shared";

export type PlaceKind = "COUNTRY" | "CITY";

export interface PlaceDictionary {
  countries: Map<string, string>;
  cities: Map<string, string>;
}

export interface MatchEnvironment {
  city: string;
  timeZone: string;
  base: EnvironmentBase;
}

export async function loadPlaceDictionary(): Promise<PlaceDictionary> {
  const rows = await prisma.placeMapping.findMany({
    where: { approved: true },
    select: { kind: true, key: true, arabicName: true },
  });
  const dict: PlaceDictionary = { countries: new Map(), cities: new Map() };
  for (const r of rows) {
    if (!r.arabicName.trim()) continue;
    (r.kind === "COUNTRY" ? dict.countries : dict.cities).set(r.key, r.arabicName);
  }
  return dict;
}

function normalizeKey(kind: PlaceKind, name: string): string {
  return kind === "COUNTRY" ? name.trim().toUpperCase() : placeKey(name);
}

/**
 * Environmental base for a match: 4064 + country + city + local day + Hijri month + Hijri year.
 * Returns the missing place(s) when a country/city has no approved Arabic name.
 */
export function resolveEnvironment(
  country: string,
  tournamentOrCity: string,
  time: Date,
  dict: PlaceDictionary,
): MatchEnvironment | { missing: string[] } {
  const code = country.trim().toUpperCase();
  const city = cityFromTournament(tournamentOrCity);
  const countryArabic = dict.countries.get(code);
  const cityArabic = dict.cities.get(placeKey(city));

  const missing = [
    !countryArabic && `country ${code}`,
    !cityArabic && `city ${city}`,
  ].filter(Boolean) as string[];
  if (missing.length) return { missing };

  const timeZone = getCountryTimezone(code, city);
  const hijri = getHijriDate(time, timeZone);
  return {
    city,
    timeZone,
    base: calculateEnvironmentBase({
      countryArabic: countryArabic!,
      cityArabic: cityArabic!,
      weekday: getLocalWeekday(time, timeZone),
      hijriMonth: hijri.month,
      hijriYear: hijri.year,
    }),
  };
}

function requireAbjad(arabicName: string): number {
  const abjadValue = calculateAbjadValue(arabicName);
  if (abjadValue === 0) throw new Error("Arabic name has no Abjad letters");
  return abjadValue;
}

/** Add or correct a place name (approved immediately) */
export async function upsertPlace(kind: PlaceKind, name: string, arabicName: string) {
  const key = normalizeKey(kind, name);
  if (!key) throw new Error("Provide a place name");
  const data = {
    name: name.trim(),
    arabicName: arabicName.trim(),
    abjadValue: requireAbjad(arabicName),
    approved: true,
    source: "MANUAL",
  };
  return prisma.placeMapping.upsert({
    where: { kind_key: { kind, key } },
    update: data,
    create: { kind, key, ...data },
  });
}

export async function approvePlace(kind: PlaceKind, key: string, arabicName?: string) {
  const existing = await prisma.placeMapping.findUnique({
    where: { kind_key: { kind, key } },
  });
  if (!existing) throw new Error("Place not found");
  const finalArabic = arabicName?.trim() || existing.arabicName;
  return prisma.placeMapping.update({
    where: { kind_key: { kind, key } },
    data: { arabicName: finalArabic, abjadValue: requireAbjad(finalArabic), approved: true },
  });
}

export async function rejectPlace(kind: PlaceKind, key: string) {
  await prisma.placeMapping.delete({ where: { kind_key: { kind, key } } });
}

export async function listPendingPlaces() {
  return prisma.placeMapping.findMany({
    where: { approved: false },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });
}

/** Countries and cities in today's matches without an approved Arabic name */
export async function findMissingPlaces() {
  const [matches, rows] = await Promise.all([
    prisma.match.findMany({ select: { country: true, tournament: true } }),
    prisma.placeMapping.findMany(),
  ]);
  const byKey = new Map(rows.map((r) => [`${r.kind}:${r.key}`, r]));
  const missing = new Map<
    string,
    { kind: PlaceKind; key: string; name: string; pending: boolean; country: string; tournaments: string[] }
  >();

  for (const m of matches) {
    const candidates: [PlaceKind, string][] = [
      ["COUNTRY", m.country],
      ["CITY", cityFromTournament(m.tournament)],
    ];
    for (const [kind, name] of candidates) {
      const key = normalizeKey(kind, name);
      const row = byKey.get(`${kind}:${key}`);
      if (row?.approved) continue;
      const entry = missing.get(`${kind}:${key}`);
      if (entry) {
        if (!entry.tournaments.includes(m.tournament)) entry.tournaments.push(m.tournament);
        continue;
      }
      missing.set(`${kind}:${key}`, {
        kind,
        key,
        name,
        pending: Boolean(row),
        country: m.country,
        tournaments: [m.tournament],
      });
    }
  }
  return [...missing.values()];
}
