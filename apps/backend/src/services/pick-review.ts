/**
 * Re-check failed picks: a pick whose player lost may have used an inaccurate
 * Arabic first name. Ask the AI for alternative Arabic spellings (pronunciation
 * method) or alternative Arabic wordings of the meaning (meaning method) of both
 * players' first names, taking their nationality into account. Re-run the
 * calculation with each variant (one name swapped at a time) and record whether
 * it changes the remainder and would have picked the actual winner.
 */

import type { PickReview } from "@prisma/client";
import { prisma } from "@tennis-prediction/database";
import { calculateAbjadValue, firstNameKey } from "@tennis-prediction/shared";
import {
  CALCULATION_METHODS,
  calculatePrediction,
  CalculationMethod,
  CalculationResult,
  loadDictionaryFor,
} from "./calculation";
import { loadPlaceDictionary } from "./places";
import { describePlayers, NameDictionary, playerCountries } from "./names";
import {
  callModel,
  isSuggestionEnabled,
  NO_PROVIDER_ERROR,
  parseResults,
} from "./ai-client";

const AI_BATCH = 15;
const MAX_VARIANTS = 4;
/** Failed picks re-checked per scheduler cycle (AI cost control) */
const REVIEW_BATCH = Number(process.env.REVIEW_BATCH) || 20;

type Side = "player1" | "player2";
type Pair = { player1Remainder: number; player2Remainder: number };

const PROMPTS: Record<CalculationMethod, string> = {
  PRONUNCIATION: `You check ARABIC spellings of personal first names for an Abjad numerology tool. A prediction using the CURRENT spelling failed, so list other plausible ways an Arabic writer could spell the same name.

Rules:
1. Use each player's NATIONALITY (3-letter IOC/ISO code) and full name to decide the language of the name and how it is actually pronounced in that country.
2. Give up to ${MAX_VARIANTS} alternative spellings that differ in LETTERS (not diacritics), e.g. long vowels written or omitted (ا و ي), ة vs ه, ى vs ي, hamza forms (أ إ ء), ك vs ق, ت vs ط, س vs ص, د vs ض, ج vs غ for a hard g, with or without ال, and the traditional Arabic equivalent vs a phonetic spelling (Joseph -> يوسف vs جوزيف).
3. Never repeat the current spelling. Plain Arabic letters only, no diacritics. One word normally.
4. Set "best" to the single most accurate spelling for this player's nationality and pronunciation (it may be the current spelling).

Respond with JSON only, in this exact shape:
{"results":[{"firstName":"...","best":"...","variants":[{"arabic":"...","note":"short reason"}]}]}`,

  MEANING: `You check the ARABIC MEANING of personal first names for an Abjad numerology tool. A prediction using the CURRENT Arabic meaning failed, so list other plausible ways to express what the name means.

Rules:
1. Use each player's NATIONALITY (3-letter IOC/ISO code) and full name to decide the language/culture the name comes from; the same spelling can mean different things in different languages.
2. Give up to ${MAX_VARIANTS} alternatives: other accepted etymologies of the name, and closer or more standard Arabic wordings of the same meaning (e.g. الله رحيم vs الله حنان vs نعمة الله), with or without ال, a single word vs a short phrase.
3. Never repeat the current meaning. Plain Arabic letters only, no diacritics, 1-3 words.
4. Set "best" to the single most accurate Arabic meaning for this player's nationality (it may be the current meaning).

Respond with JSON only, in this exact shape:
{"results":[{"firstName":"...","best":"...","variants":[{"arabic":"...","note":"short reason"}]}]}`,
};

interface VariantReply {
  firstName: string;
  best: string | null;
  variants: { arabic: string | null; note?: string | null }[];
}

export interface ReviewVariant {
  side: Side;
  player: string;
  firstName: string;
  current: string;
  arabic: string;
  abjadValue: number;
  /** AI considers this the most accurate form for the player's nationality */
  best: boolean;
  note: string | null;
  remainderPair: Pair | null;
  /** Variant gives the same remainder as the current name (Abjad difference is a multiple of 9) */
  sameRemainder: boolean;
  predictedWinner: string | null;
  strength: string | null;
  reason: string | null;
  wouldWin: boolean;
}

export interface ReviewOriginal {
  storedRemainderPair: Pair | null;
  storedStrength: string;
  /** Same calculation with today's dictionary; may differ from the stored pick because more same-day results are known now */
  baseline: {
    remainderPair: Pair | null;
    predictedWinner: string | null;
    strength: string | null;
    reason: string | null;
  };
  current: Record<Side, { firstName: string | null; arabic: string | null; best: string | null; country: string | null }>;
}

const sideOf = (pair: Pair | null | undefined, side: Side) =>
  pair ? (side === "player1" ? pair.player1Remainder : pair.player2Remainder) : null;

async function askVariants(
  method: CalculationMethod,
  items: { firstName: string; current: string; players: string[] }[],
  countries: Map<string, string>,
) {
  const replies = new Map<string, VariantReply>();
  const label = method === "MEANING" ? "Arabic meaning" : "Arabic spelling";
  for (let i = 0; i < items.length; i += AI_BATCH) {
    const batch = items.slice(i, i + AI_BATCH);
    const prompt =
      `First names with their CURRENT ${label} (and example players with nationality):\n` +
      batch
        .map(
          (m) =>
            `- ${m.firstName}: current "${m.current}" (e.g. ${describePlayers(m.players, countries)})`,
        )
        .join("\n");
    const results = parseResults<VariantReply>(
      await callModel(PROMPTS[method], prompt),
    );
    for (const r of results) {
      if (r.firstName) replies.set(r.firstName.toLowerCase(), r);
    }
  }
  return replies;
}

async function findFailedPicks(matchId?: string, includeReviewed = false) {
  const predictions = await prisma.prediction.findMany({
    where: {
      predictedWinner: { not: null },
      ...(matchId ? { matchId } : {}),
      match: { status: "COMPLETED", winnerId: { not: null } },
    },
    include: {
      match: { include: { player1: true, player2: true, winner: true } },
      predictedWinnerPlayer: true,
    },
    orderBy: { match: { scheduledTime: "desc" } },
  });
  const failed = predictions.filter(
    (p) => p.predictedWinner !== p.match.winnerId,
  );
  if (includeReviewed || !failed.length) return failed;

  const reviewed = await prisma.pickReview.findMany({
    where: { matchId: { in: failed.map((f) => f.matchId) } },
    select: { matchId: true, method: true },
  });
  const done = new Set(reviewed.map((r) => `${r.matchId}:${r.method}`));
  return failed.filter((p) => !done.has(`${p.matchId}:${p.method}`));
}

type FailedPick = Awaited<ReturnType<typeof findFailedPicks>>[number];

async function reviewOne(
  pick: FailedPick,
  dictionary: NameDictionary,
  places: Awaited<ReturnType<typeof loadPlaceDictionary>>,
  replies: Map<string, VariantReply>,
  countries: Map<string, string>,
) {
  const m = pick.match;
  const method = pick.method as CalculationMethod;
  const winnerName = m.winner?.name ?? "";
  const input = {
    method,
    player1Name: m.player1.name,
    player2Name: m.player2.name,
    country: m.country,
    tournament: m.tournament,
    scheduledTime: m.scheduledTime,
    places,
  };
  const pickName = (r: CalculationResult) =>
    r.prediction?.winner === "player1"
      ? m.player1.name
      : r.prediction?.winner === "player2"
        ? m.player2.name
        : null;

  const baseline = await calculatePrediction({ ...input, dictionary });
  const variants: ReviewVariant[] = [];
  const current = {} as ReviewOriginal["current"];

  for (const [side, player] of [
    ["player1", m.player1],
    ["player2", m.player2],
  ] as const) {
    const key = firstNameKey(player.name);
    const currentArabic = key ? (dictionary.get(key) ?? null) : null;
    const reply = key ? replies.get(key) : undefined;
    current[side] = {
      firstName: key,
      arabic: currentArabic,
      best: reply?.best?.trim() || null,
      country: player.country ?? countries.get(player.name) ?? null,
    };
    if (!key || !currentArabic || !reply) continue;

    const currentAbjad = calculateAbjadValue(currentArabic);
    const seen = new Set([currentArabic.trim()]);
    const best = current[side].best;
    const candidates = [
      ...(best ? [{ arabic: best, note: "AI's most accurate form for this nationality" }] : []),
      ...(reply.variants ?? []),
    ];
    for (const v of candidates) {
      const arabic = v.arabic?.trim() ?? "";
      const abjadValue = arabic ? calculateAbjadValue(arabic) : 0;
      if (!abjadValue || seen.has(arabic)) continue;
      seen.add(arabic);
      if (variants.filter((x) => x.side === side).length > MAX_VARIANTS) break;

      const swapped = new Map(dictionary);
      swapped.set(key, arabic);
      const r = await calculatePrediction({ ...input, dictionary: swapped });
      const winner = pickName(r);
      variants.push({
        side,
        player: player.name,
        firstName: key,
        current: currentArabic,
        arabic,
        abjadValue,
        best: current[side].best === arabic,
        note: v.note ?? null,
        remainderPair: r.remainderPair ?? null,
        sameRemainder: (abjadValue - currentAbjad) % 9 === 0,
        predictedWinner: winner,
        strength: r.prediction?.strength ?? null,
        reason: r.prediction?.reason ?? r.error ?? null,
        wouldWin: winner !== null && winner === winnerName,
      });
    }
  }

  const original: ReviewOriginal = {
    storedRemainderPair: (pick.remainderPair as Pair | null) ?? null,
    storedStrength: pick.strength,
    baseline: {
      remainderPair: baseline.remainderPair ?? null,
      predictedWinner: pickName(baseline),
      strength: baseline.prediction?.strength ?? null,
      reason: baseline.prediction?.reason ?? baseline.error ?? null,
    },
    current,
  };

  const data = {
    matchTime: m.scheduledTime,
    tournament: m.tournament,
    country: m.country,
    player1: m.player1.name,
    player2: m.player2.name,
    pickedName: pick.predictedWinnerPlayer?.name ?? "",
    winnerName,
    original: original as object,
    variants: variants as object[],
    flipped: variants.some((v) => v.wouldWin),
    error: null,
  };
  return prisma.pickReview.upsert({
    where: { matchId_method: { matchId: m.id, method } },
    update: { ...data, createdAt: new Date() },
    create: { matchId: m.id, method, ...data },
  });
}

/**
 * Re-check failed picks that have no review yet (up to REVIEW_BATCH), or every
 * failed pick of one match when `matchId` is given (re-runs existing reviews).
 */
export async function reviewFailedPicks(matchId?: string) {
  if (!isSuggestionEnabled()) throw new Error(NO_PROVIDER_ERROR);

  const todo = (await findFailedPicks(matchId, Boolean(matchId))).slice(
    0,
    matchId ? undefined : REVIEW_BATCH,
  );
  const reviews: PickReview[] = [];
  if (!todo.length) return { reviewed: 0, flipped: 0, reviews };

  const [places, countries] = await Promise.all([
    loadPlaceDictionary(),
    playerCountries(),
  ]);

  for (const method of CALCULATION_METHODS) {
    const picks = todo.filter((p) => p.method === method);
    if (!picks.length) continue;
    const dictionary = await loadDictionaryFor(method);

    const items = new Map<string, { firstName: string; current: string; players: string[] }>();
    for (const p of picks) {
      for (const player of [p.match.player1, p.match.player2]) {
        const key = firstNameKey(player.name);
        const currentArabic = key ? dictionary.get(key) : undefined;
        if (!key || !currentArabic) continue;
        const item = items.get(key) ?? { firstName: key, current: currentArabic, players: [] };
        if (!item.players.includes(player.name)) item.players.push(player.name);
        items.set(key, item);
      }
    }

    const replies = await askVariants(method, [...items.values()], countries);
    for (const p of picks) {
      try {
        reviews.push(await reviewOne(p, dictionary, places, replies, countries));
      } catch (error) {
        console.error(
          `Review ${p.matchId} (${method}) failed:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  return {
    reviewed: reviews.length,
    flipped: reviews.filter((r) => r.flipped).length,
    reviews,
  };
}

export const reviewView = (r: PickReview) => ({
  matchId: r.matchId,
  method: r.method,
  matchTime: r.matchTime,
  tournament: r.tournament,
  country: r.country,
  player1: r.player1,
  player2: r.player2,
  pickedName: r.pickedName,
  winnerName: r.winnerName,
  original: r.original as unknown as ReviewOriginal,
  variants: r.variants as unknown as ReviewVariant[],
  flipped: r.flipped,
  error: r.error,
  createdAt: r.createdAt,
});

export async function listReviews(limit = 200) {
  const rows = await prisma.pickReview.findMany({
    orderBy: { matchTime: "desc" },
    take: limit,
  });
  return rows.map(reviewView);
}
