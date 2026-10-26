export type Strength = "STRONG" | "MODERATE" | "WEAK" | "NO_PREDICTION";

export interface Side {
  name: string;
  firstName: string | null;
  arabicMeaning: string | null;
  abjadValue: number | null;
  remainder: number | null;
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

export type Method = "PRONUNCIATION" | "MEANING";

export interface RemainderPair {
  player1Remainder: number;
  player2Remainder: number;
}

export interface EvidenceItem {
  matchId: string;
  scheduledTime: string;
  tournament: string;
  biggerRemainderPlayer: string;
  smallerRemainderPlayer: string;
  winner: string;
  outcome: "BIGGER" | "SMALLER";
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

export interface MatchPrediction {
  predictedWinner: string | null;
  strength: Strength;
  reason: string | null;
  evidenceCount: number;
  frozen: boolean;
  remainderPair?: RemainderPair;
  structuralClass?: unknown;
  evidence?: EvidenceItem[];
  review?: PickReview | null;
}

export type ReviewSide = "player1" | "player2";

export interface ReviewVariant {
  side: ReviewSide;
  player: string;
  firstName: string;
  current: string;
  arabic: string;
  abjadValue: number;
  best: boolean;
  note: string | null;
  remainderPair: RemainderPair | null;
  sameRemainder: boolean;
  predictedWinner: string | null;
  strength: Strength | null;
  reason: string | null;
  wouldWin: boolean;
}

/** Re-check of a failed pick with alternative Arabic spellings / meanings */
export interface PickReview {
  matchId: string;
  method: Method;
  matchTime: string;
  tournament: string;
  country: string;
  player1: string;
  player2: string;
  pickedName: string;
  winnerName: string;
  original: {
    storedRemainderPair: RemainderPair | null;
    storedStrength: Strength;
    baseline: {
      remainderPair: RemainderPair | null;
      predictedWinner: string | null;
      strength: Strength | null;
      reason: string | null;
    };
    current: Record<
      ReviewSide,
      {
        firstName: string | null;
        arabic: string | null;
        best: string | null;
        country: string | null;
      }
    >;
  };
  variants: ReviewVariant[];
  flipped: boolean;
  error: string | null;
  createdAt: string;
}

export interface MatchRow {
  id: string;
  scheduledTime: string;
  /** Order of play not published yet */
  timeTbd: boolean;
  /** IANA zone of the match location (country, refined by city) */
  timeZone: string;
  /** Match date at the location (YYYY-MM-DD) */
  localDate: string;
  /** 0 = today at the location, 1 = tomorrow, ... */
  dayOffset: number;
  /** Live set score while in progress, final score when completed (player1 first) */
  score: string | null;
  /** Current game points while in progress (player1 first) */
  points: string | null;
  liveUpdatedAt: string | null;
  status: string;
  tournament: string;
  country: string;
  environment: EnvironmentBase | null;
  missingPlaces: string[];
  /** Pronunciation calculation */
  player1: Side;
  player2: Side;
  winner: string | null;
  prediction: MatchPrediction | null;
  /** Separate calculation from the Arabic MEANING of the first names */
  meaning: {
    player1: Side;
    player2: Side;
    prediction: MatchPrediction | null;
  };
}

export interface SchedulerStatus {
  running: boolean;
  intervalMinutes: number;
  lastLive?: { at: string; live: number; matched: number; error?: string } | null;
  lastRun: {
    startedAt: string;
    finishedAt?: string;
    error?: string;
    predictions?: {
      updated: number;
      skipped: number;
      frozen: number;
      meaning?: { updated: number; skipped: number };
    };
  } | null;
}

export interface MissingName {
  firstName: string;
  players: string[];
  pending: boolean;
}

export interface PendingName {
  playerName: string;
  arabicMeaning: string;
  meaning: string | null;
  note: string | null;
  source: string;
  abjadValue: number | null;
}

export type PlaceKind = "COUNTRY" | "CITY";

export interface MissingPlace {
  kind: PlaceKind;
  key: string;
  name: string;
  pending: boolean;
}

export interface PendingPlace {
  kind: PlaceKind;
  key: string;
  name: string;
  arabicName: string;
  abjadValue: number;
  source: string;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body as T;
}
