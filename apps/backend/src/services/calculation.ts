/**
 * Calculation service - implements the tennis prediction formula
 */

import {
  calculateSimilarityScore,
  calculateTimeDistance,
  classifyStructural,
  RemainderPair,
  StructuralClass,
  calculatePredictionStrength,
  PredictionStrength,
  analyzeTrend,
  TrendOutcome,
  TREND_SWITCH_THRESHOLD,
  calculatePlayerRemainder,
  EnvironmentBase,
  getHijriDate,
  getLocalDateString,
  getLocalWeekday,
} from "@tennis-prediction/shared";
import { prisma } from "@tennis-prediction/database";
import { loadNameDictionary, NameDictionary, resolveName } from "./names";
import { loadMeaningDictionary } from "./meanings";
import {
  loadPlaceDictionary,
  PlaceDictionary,
  resolveEnvironment,
} from "./places";

const EXACT_PAIR_WEIGHT = 1.0;
const STRUCTURAL_WEIGHT = 0.6;
const MIN_TOURNAMENT_EVIDENCE = 3;
const CANDIDATE_WINDOW_MS = 36 * 60 * 60 * 1000;

/** Which first-name dictionary feeds the formula: Arabic pronunciation or Arabic meaning */
export type CalculationMethod = "PRONUNCIATION" | "MEANING";
export const CALCULATION_METHODS: CalculationMethod[] = [
  "PRONUNCIATION",
  "MEANING",
];

export const loadDictionaryFor = (method: CalculationMethod) =>
  method === "MEANING" ? loadMeaningDictionary() : loadNameDictionary();

export interface CalculationInput {
  /** Defaults to PRONUNCIATION */
  method?: CalculationMethod;
  player1Name: string;
  player2Name: string;
  /** 3-letter country code as returned by the tennis API (e.g. "USA") */
  country: string;
  /** Tournament name; its city is part of the environmental base */
  tournament?: string;
  /** City override (defaults to the city in the tournament name) */
  city?: string;
  /** Match time; defaults to now. Only results before this time are used. */
  scheduledTime?: Date;
  /** Preloaded first-name dictionary (e.g. with one name swapped for a variant) */
  dictionary?: NameDictionary;
  /** Preloaded place dictionary */
  places?: PlaceDictionary;
}

export interface EvidenceItem {
  matchId: string;
  scheduledTime: string;
  tournament: string;
  biggerRemainderPlayer: string;
  smallerRemainderPlayer: string;
  winner: string;
  outcome: TrendOutcome;
  matchType: "EXACT_PAIR" | "STRUCTURAL";
  similarity: {
    sameCity: boolean;
    sameWeekday: boolean;
    sameHijriMonth: boolean;
    hoursApart: number;
    score: number;
  };
  weight: number;
}

export interface CalculationResult {
  player1: {
    name: string;
    arabicMeaning?: string;
    abjadValue?: number;
    remainder?: number;
    firstName?: string;
  };
  player2: {
    name: string;
    arabicMeaning?: string;
    abjadValue?: number;
    remainder?: number;
    firstName?: string;
  };
  remainderPair?: RemainderPair;
  structuralClass?: StructuralClass;
  environment?: EnvironmentBase & { cityName: string };
  context?: {
    country: string;
    timeZone: string;
    localDate: string;
    weekday: number;
    hijriYear: number;
    hijriMonth: number;
    hijriDay: number;
    scope: "TOURNAMENT" | "COUNTRY";
    tournament?: string;
  };
  trend?: {
    direction: TrendOutcome | null;
    switches: number;
    pendingOpposite: number;
    switchThreshold: number;
    segmentSize: number;
    support: number;
  };
  prediction?: {
    winner: "player1" | "player2" | null;
    winnerName: string | null;
    strength: PredictionStrength;
    agreement: number;
    evidenceCount: number;
    reason?: string;
  };
  evidence?: EvidenceItem[];
  error?: string;
}

interface Pattern {
  bigger: number;
  smaller: number;
  biggerOdd: boolean;
  smallerOdd: boolean;
}

/**
 * Orientation-free remainder pattern (independent of API player order)
 */
function toPattern(r1: number, r2: number): Pattern {
  const bigger = Math.max(r1, r2);
  const smaller = Math.min(r1, r2);
  return {
    bigger,
    smaller,
    biggerOdd: bigger % 2 !== 0,
    smallerOdd: smaller % 2 !== 0,
  };
}

function noPrediction(
  evidenceCount: number,
  reason: string,
): NonNullable<CalculationResult["prediction"]> {
  return {
    winner: null,
    winnerName: null,
    strength: "NO_PREDICTION",
    agreement: 0,
    evidenceCount,
    reason,
  };
}

/**
 * Calculate prediction for a match
 */
export async function calculatePrediction(
  input: CalculationInput,
): Promise<CalculationResult> {
  const result: CalculationResult = {
    player1: { name: input.player1Name },
    player2: { name: input.player2Name },
  };

  try {
    // Step 1: Name resolution - get Arabic meanings and Abjad values
    const method = input.method ?? "PRONUNCIATION";
    const dictionary = input.dictionary ?? (await loadDictionaryFor(method));
    const player1Data = resolveName(input.player1Name, dictionary);
    const player2Data = resolveName(input.player2Name, dictionary);

    if (!player1Data || !player2Data) {
      const missing = [
        !player1Data && input.player1Name,
        !player2Data && input.player2Name,
      ].filter(Boolean);
      const what = method === "MEANING" ? "name meaning" : "Arabic first name";
      result.error = `No approved ${what} for: ${missing.join(", ")}`;
      return result;
    }

    result.player1.arabicMeaning = player1Data.arabicMeaning;
    result.player1.abjadValue = player1Data.abjadValue;
    result.player1.firstName = player1Data.firstName;
    result.player2.arabicMeaning = player2Data.arabicMeaning;
    result.player2.abjadValue = player2Data.abjadValue;
    result.player2.firstName = player2Data.firstName;

    // Step 2: Environmental base (country, city, local day, Hijri month/year)
    const country = input.country.toUpperCase();
    const referenceTime = input.scheduledTime ?? new Date();
    const places = input.places ?? (await loadPlaceDictionary());
    const placeSource = input.city ?? input.tournament;
    if (!placeSource) {
      result.error = "Provide a tournament or city for the environmental base";
      return result;
    }
    const env = resolveEnvironment(country, placeSource, referenceTime, places);
    if ("missing" in env) {
      result.error = `No approved Arabic name for: ${env.missing.join(", ")}`;
      return result;
    }
    result.environment = { ...env.base, cityName: env.city };

    // Step 3: Remainders = (name value + base) mod 9
    const remainder1 = calculatePlayerRemainder(
      player1Data.abjadValue,
      env.base.total,
    );
    const remainder2 = calculatePlayerRemainder(
      player2Data.abjadValue,
      env.base.total,
    );

    result.player1.remainder = remainder1;
    result.player2.remainder = remainder2;

    const remainderPair: RemainderPair = {
      player1Remainder: remainder1,
      player2Remainder: remainder2,
    };
    result.remainderPair = remainderPair;

    // Step 4: Structural classification
    const structuralClass = classifyStructural(remainder1, remainder2);
    result.structuralClass = structuralClass;

    // Step 5: Same-day evidence (same country, tournament-local day)
    const timeZone = env.timeZone;
    const localDate = getLocalDateString(referenceTime, timeZone);
    const weekday = getLocalWeekday(referenceTime, timeZone);
    const hijri = getHijriDate(referenceTime, timeZone);
    const pattern = toPattern(remainder1, remainder2);

    const countryEvidence = await findSameDayEvidence(
      pattern,
      country,
      timeZone,
      localDate,
      referenceTime,
      input.tournament,
      dictionary,
      places,
    );

    // Narrow to the same tournament (city) when it has enough evidence
    const tournamentEvidence = input.tournament
      ? countryEvidence.filter((e) => e.tournament === input.tournament)
      : [];
    const useTournament = tournamentEvidence.length >= MIN_TOURNAMENT_EVIDENCE;
    const evidence = useTournament ? tournamentEvidence : countryEvidence;

    result.context = {
      country,
      timeZone,
      localDate,
      weekday,
      hijriYear: hijri.year,
      hijriMonth: hijri.month,
      hijriDay: hijri.day,
      scope: useTournament ? "TOURNAMENT" : "COUNTRY",
      tournament: input.tournament,
    };
    result.evidence = evidence;

    // Step 6: Trend + switch detection
    const trend = analyzeTrend(evidence);
    result.trend = {
      direction: trend.direction,
      switches: trend.switches,
      pendingOpposite: trend.pendingOpposite,
      switchThreshold: TREND_SWITCH_THRESHOLD,
      segmentSize: trend.segment.length,
      support: trend.support,
    };

    // Step 7: Prediction
    if (remainder1 === remainder2) {
      result.prediction = noPrediction(
        evidence.length,
        "Equal remainders: no bigger/smaller side to follow the trend",
      );
      return result;
    }

    if (!trend.direction) {
      result.prediction = noPrediction(
        evidence.length,
        "No matching completed matches yet today",
      );
      return result;
    }

    if (trend.support <= 50) {
      result.prediction = noPrediction(
        evidence.length,
        "Current trend is contested",
      );
      return result;
    }

    const strength = calculatePredictionStrength(
      trend.segment.map((e) => ({
        winner: e.outcome === trend.direction ? "player1" : "player2",
        similarityScore: e.weight,
      })),
    );

    const biggerSide = remainder1 > remainder2 ? "player1" : "player2";
    const smallerSide = biggerSide === "player1" ? "player2" : "player1";
    const winner = trend.direction === "BIGGER" ? biggerSide : smallerSide;

    result.prediction = {
      winner,
      winnerName: winner === "player1" ? input.player1Name : input.player2Name,
      strength,
      agreement: trend.support,
      evidenceCount: trend.segment.length,
      reason:
        strength === "NO_PREDICTION"
          ? "Not enough same-day evidence in the current trend"
          : undefined,
    };

    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : "Unknown error";
    return result;
  }
}

/**
 * Completed matches from the same country on the same tournament-local day,
 * finished before the reference time, matching the target's remainder pattern.
 * Returned oldest first.
 */
async function findSameDayEvidence(
  target: Pattern,
  country: string,
  timeZone: string,
  localDate: string,
  referenceTime: Date,
  targetTournament: string | undefined,
  dictionary: NameDictionary,
  places: PlaceDictionary,
): Promise<EvidenceItem[]> {
  const targetFactors = {
    city: targetTournament ?? "",
    weekday: getLocalWeekday(referenceTime, timeZone),
    hijriMonth: getHijriDate(referenceTime, timeZone).month,
    timeDistance: 0,
  };
  const now = new Date();
  const upperBound = referenceTime < now ? referenceTime : now;

  const matches = await prisma.match.findMany({
    where: {
      country,
      status: "COMPLETED",
      winnerId: { not: null },
      scheduledTime: {
        gte: new Date(referenceTime.getTime() - CANDIDATE_WINDOW_MS),
        lte: upperBound,
      },
    },
    include: { player1: true, player2: true },
    orderBy: { scheduledTime: "asc" },
  });

  const evidence: EvidenceItem[] = [];

  for (const match of matches) {
    if (getLocalDateString(match.scheduledTime, timeZone) !== localDate)
      continue;

    const name1 = resolveName(match.player1.name, dictionary);
    const name2 = resolveName(match.player2.name, dictionary);
    if (!name1 || !name2) continue;

    // Each evidence match uses its own environmental base (its own city)
    const env = resolveEnvironment(
      country,
      match.tournament,
      match.scheduledTime,
      places,
    );
    if ("missing" in env) continue;

    const r1 = calculatePlayerRemainder(name1.abjadValue, env.base.total);
    const r2 = calculatePlayerRemainder(name2.abjadValue, env.base.total);
    if (r1 === r2) continue;

    const pattern = toPattern(r1, r2);
    const exact =
      pattern.bigger === target.bigger && pattern.smaller === target.smaller;
    const structural =
      pattern.biggerOdd === target.biggerOdd &&
      pattern.smallerOdd === target.smallerOdd;
    if (!exact && !structural) continue;

    const biggerPlayer = r1 > r2 ? match.player1 : match.player2;
    const smallerPlayer = r1 > r2 ? match.player2 : match.player1;
    const winner =
      match.winnerId === match.player1Id ? match.player1 : match.player2;

    const hoursApart = calculateTimeDistance(
      referenceTime,
      match.scheduledTime,
    );
    const matchFactors = {
      city: match.tournament,
      weekday: getLocalWeekday(match.scheduledTime, timeZone),
      hijriMonth: getHijriDate(match.scheduledTime, timeZone).month,
      timeDistance: hoursApart,
    };
    const score = calculateSimilarityScore(targetFactors, matchFactors);
    const typeWeight = exact ? EXACT_PAIR_WEIGHT : STRUCTURAL_WEIGHT;

    evidence.push({
      matchId: match.id,
      scheduledTime: match.scheduledTime.toISOString(),
      tournament: match.tournament,
      biggerRemainderPlayer: biggerPlayer.name,
      smallerRemainderPlayer: smallerPlayer.name,
      winner: winner.name,
      outcome: match.winnerId === biggerPlayer.id ? "BIGGER" : "SMALLER",
      matchType: exact ? "EXACT_PAIR" : "STRUCTURAL",
      similarity: {
        sameCity: targetFactors.city === matchFactors.city,
        sameWeekday: targetFactors.weekday === matchFactors.weekday,
        sameHijriMonth: targetFactors.hijriMonth === matchFactors.hijriMonth,
        hoursApart: Math.round(hoursApart * 10) / 10,
        score,
      },
      weight: typeWeight * score,
    });
  }

  return evidence;
}
