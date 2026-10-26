/**
 * Name dictionary service: resolves players to Arabic meanings by FIRST NAME only.
 * Only approved NameMapping rows are used in predictions.
 */

import { prisma } from "@tennis-prediction/database";
import {
  calculateAbjadValue,
  firstNameKey,
  lookupArabicMeaning,
  normalizeName,
} from "@tennis-prediction/shared";

export type NameDictionary = Map<string, string>;

export interface ResolvedName {
  arabicMeaning: string;
  abjadValue: number;
  firstName: string;
}

export async function loadNameDictionary(): Promise<NameDictionary> {
  const rows = await prisma.nameMapping.findMany({
    where: { approved: true },
    select: { playerName: true, arabicMeaning: true },
  });
  return new Map(
    rows
      .filter((r) => r.arabicMeaning.trim())
      .map((r) => [r.playerName, r.arabicMeaning]),
  );
}

/**
 * Resolve a player by first name. Abjad is computed from the letter skeleton
 * of the Arabic text (diacritics ignored).
 */
export function resolveName(
  playerName: string,
  dictionary: NameDictionary,
): ResolvedName | null {
  const found = lookupArabicMeaning(playerName, dictionary);
  if (!found) return null;

  const abjadValue = calculateAbjadValue(found.arabicMeaning);
  if (abjadValue === 0) return null;

  return {
    arabicMeaning: found.arabicMeaning,
    abjadValue,
    firstName: found.key,
  };
}

export function requireFirstNameKey(name: string): string {
  const key = firstNameKey(name);
  if (!key || name.trim().split(/\s+/).length > 1) {
    throw new Error(
      "Provide a single first name (no surname, no compound names)",
    );
  }
  return key;
}

function requireAbjad(arabicMeaning: string): number {
  const abjadValue = calculateAbjadValue(arabicMeaning);
  if (abjadValue === 0) throw new Error("Arabic meaning has no Abjad letters");
  return abjadValue;
}

/**
 * Manually add or correct a first-name meaning (approved immediately)
 */
export async function upsertNameMapping(
  name: string,
  arabicMeaning: string,
  meaning?: string,
) {
  const playerName = requireFirstNameKey(name);
  const abjadValue = requireAbjad(arabicMeaning);
  const data = {
    arabicMeaning,
    abjadValue,
    approved: true,
    source: "MANUAL",
    ...(meaning ? { meaning } : {}),
  };

  return prisma.nameMapping.upsert({
    where: { playerName },
    update: data,
    create: { playerName, ...data },
  });
}

/**
 * Approve a pending suggestion, optionally correcting the Arabic meaning
 */
export async function approveNameMapping(key: string, arabicMeaning?: string) {
  const existing = await prisma.nameMapping.findUnique({
    where: { playerName: key },
  });
  if (!existing) throw new Error("Name not found");

  const finalArabic = arabicMeaning?.trim() || existing.arabicMeaning;
  const abjadValue = requireAbjad(finalArabic);

  return prisma.nameMapping.update({
    where: { playerName: key },
    data: { arabicMeaning: finalArabic, abjadValue, approved: true },
  });
}

export async function rejectNameMapping(key: string) {
  await prisma.nameMapping.delete({ where: { playerName: key } });
}

export async function listPendingNames() {
  return prisma.nameMapping.findMany({
    where: { approved: false },
    orderBy: { playerName: "asc" },
  });
}

export type SearchStatus = "APPROVED" | "PENDING" | "MISSING";

export interface NameSearchResult {
  firstName: string;
  arabicMeaning: string;
  abjadValue: number | null;
  meaning: string | null;
  note: string | null;
  source: string | null;
  status: SearchStatus;
  /** Players in stored matches with this first name */
  players: string[];
}

const SEARCH_LIMIT = 12;

/**
 * Type-ahead over a first-name dictionary: saved rows (approved or pending)
 * plus first names from stored matches that have no row yet.
 * Prefix matches rank before substring matches.
 */
export function rankNameSearch(
  query: string,
  rows: {
    playerName: string;
    arabicMeaning: string;
    abjadValue: number;
    meaning: string | null;
    note: string | null;
    source: string;
    approved: boolean;
  }[],
  players: string[],
): NameSearchResult[] {
  const q = normalizeName(query);
  if (!q) return [];

  const playersByKey = new Map<string, string[]>();
  for (const name of players) {
    const key = firstNameKey(name);
    if (key?.includes(q)) playersByKey.set(key, [...(playersByKey.get(key) ?? []), name]);
  }

  const results: NameSearchResult[] = rows
    .filter((r) => r.playerName.includes(q))
    .map((r) => ({
      firstName: r.playerName,
      arabicMeaning: r.arabicMeaning,
      abjadValue: r.abjadValue || null,
      meaning: r.meaning,
      note: r.note,
      source: r.source,
      status: r.approved && r.arabicMeaning.trim() ? "APPROVED" : "PENDING",
      players: playersByKey.get(r.playerName) ?? [],
    }));

  const saved = new Set(rows.map((r) => r.playerName));
  for (const [key, names] of playersByKey) {
    if (saved.has(key)) continue;
    results.push({
      firstName: key,
      arabicMeaning: "",
      abjadValue: null,
      meaning: null,
      note: null,
      source: null,
      status: "MISSING",
      players: names,
    });
  }

  const rank = (r: NameSearchResult) =>
    (r.firstName === q ? 0 : r.firstName.startsWith(q) ? 1 : 2) * 10 +
    (r.players.length ? 0 : 1);
  return results
    .sort((a, b) => rank(a) - rank(b) || a.firstName.localeCompare(b.firstName))
    .slice(0, SEARCH_LIMIT);
}

export async function searchNameMappings(query: string) {
  const q = normalizeName(query);
  if (!q) return [];
  const [rows, players] = await Promise.all([
    prisma.nameMapping.findMany({ where: { playerName: { contains: q } }, take: 200 }),
    todaysPlayerNames(),
  ]);
  return rankNameSearch(q, rows, players);
}

/** Nationality (3-letter code) of every stored player that has one */
export async function playerCountries(): Promise<Map<string, string>> {
  const rows = await prisma.player.findMany({
    where: { country: { not: null } },
    select: { name: true, country: true },
  });
  return new Map(rows.map((r) => [r.name, r.country as string]));
}

/**
 * Example players with nationality for AI prompts, one per nationality first,
 * e.g. "Jan Choinski (nationality GBR), Jan Zielinski (nationality POL)"
 */
export function describePlayers(
  players: string[],
  countries: Map<string, string>,
  limit = 3,
): string {
  const seen = new Set<string>();
  const distinct = players.filter((p) => {
    const c = countries.get(p) ?? "";
    if (seen.has(c)) return false;
    seen.add(c);
    return true;
  });
  const ordered = [...distinct, ...players.filter((p) => !distinct.includes(p))];
  return ordered
    .slice(0, limit)
    .map((p) => (countries.has(p) ? `${p} (nationality ${countries.get(p)})` : p))
    .join(", ");
}

/**
 * Players appearing in stored (today's) matches
 */
export async function todaysPlayerNames(): Promise<string[]> {
  const players = await prisma.player.findMany({
    where: {
      OR: [
        { matchesAsPlayer1: { some: {} } },
        { matchesAsPlayer2: { some: {} } },
      ],
    },
    select: { name: true },
    orderBy: { name: "asc" },
  });
  return players.map((p) => p.name);
}

/**
 * First names in today's matches without an approved meaning.
 * Compound first names (e.g. "Jan-Lennard") are ignored by rule.
 */
export async function findMissingNames() {
  const [names, rows] = await Promise.all([
    todaysPlayerNames(),
    prisma.nameMapping.findMany(),
  ]);
  const byKey = new Map(rows.map((r) => [r.playerName, r]));

  const missing = new Map<
    string,
    { firstName: string; players: string[]; pending: boolean }
  >();
  const ignoredCompound: string[] = [];

  for (const name of names) {
    const key = firstNameKey(name);
    if (!key) {
      ignoredCompound.push(name);
      continue;
    }
    const row = byKey.get(key);
    if (row?.approved && row.arabicMeaning.trim()) continue;

    const entry = missing.get(key) ?? {
      firstName: key,
      players: [],
      pending: Boolean(row),
    };
    entry.players.push(name);
    missing.set(key, entry);
  }

  return { missing: [...missing.values()], ignoredCompound };
}
