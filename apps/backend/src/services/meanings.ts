/**
 * Name-meaning dictionary: the Arabic phrase for what a FIRST NAME means
 * (e.g. Peter -> صخرة, John -> الله رحيم). A separate calculation from the
 * pronunciation dictionary in names.ts. Only approved rows are used.
 */

import { prisma } from "@tennis-prediction/database";
import {
  calculateAbjadValue,
  firstNameKey,
  normalizeName,
} from "@tennis-prediction/shared";
import {
  NameDictionary,
  rankNameSearch,
  requireFirstNameKey,
  todaysPlayerNames,
} from "./names";

/** Type-ahead: saved meanings (approved or pending) + today's first names without one */
export async function searchNameMeanings(query: string) {
  const q = normalizeName(query);
  if (!q) return [];
  const [rows, players] = await Promise.all([
    prisma.nameMeaning.findMany({ where: { playerName: { contains: q } }, take: 200 }),
    todaysPlayerNames(),
  ]);
  return rankNameSearch(q, rows, players);
}

export async function loadMeaningDictionary(): Promise<NameDictionary> {
  const rows = await prisma.nameMeaning.findMany({
    where: { approved: true },
    select: { playerName: true, arabicMeaning: true },
  });
  return new Map(
    rows
      .filter((r) => r.arabicMeaning.trim())
      .map((r) => [r.playerName, r.arabicMeaning]),
  );
}

function requireAbjad(arabicMeaning: string): number {
  const abjadValue = calculateAbjadValue(arabicMeaning);
  if (abjadValue === 0) throw new Error("Arabic meaning has no Abjad letters");
  return abjadValue;
}

/** Manually add or correct a name meaning (approved immediately) */
export async function upsertNameMeaning(
  name: string,
  arabicMeaning: string,
  meaning?: string,
) {
  const playerName = requireFirstNameKey(name);
  const data = {
    arabicMeaning: arabicMeaning.trim(),
    abjadValue: requireAbjad(arabicMeaning),
    approved: true,
    source: "MANUAL",
    ...(meaning ? { meaning } : {}),
  };
  return prisma.nameMeaning.upsert({
    where: { playerName },
    update: data,
    create: { playerName, ...data },
  });
}

/** Approve a pending suggestion, optionally correcting the Arabic phrase */
export async function approveNameMeaning(key: string, arabicMeaning?: string) {
  const existing = await prisma.nameMeaning.findUnique({
    where: { playerName: key },
  });
  if (!existing) throw new Error("Name not found");
  const finalArabic = arabicMeaning?.trim() || existing.arabicMeaning;
  return prisma.nameMeaning.update({
    where: { playerName: key },
    data: {
      arabicMeaning: finalArabic,
      abjadValue: requireAbjad(finalArabic),
      approved: true,
    },
  });
}

export async function rejectNameMeaning(key: string) {
  await prisma.nameMeaning.delete({ where: { playerName: key } });
}

export async function listPendingMeanings() {
  return prisma.nameMeaning.findMany({
    where: { approved: false },
    orderBy: { playerName: "asc" },
  });
}

/** First names in today's matches without an approved meaning */
export async function findMissingMeanings() {
  const [names, rows] = await Promise.all([
    todaysPlayerNames(),
    prisma.nameMeaning.findMany(),
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
