// TypeScript type definitions for Tennis Prediction App

export interface Player {
  id: string;
  name: string;
}

export interface Match {
  id: string;
  player1Id: string;
  player2Id: string;
  tournament: string;
  city: string;
  country: string;
  scheduledTime: Date;
  actualStartTime?: Date;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
  winnerId?: string;
}

export interface RemainderPair {
  player1Remainder: number;
  player2Remainder: number;
}

export interface StructuralClass {
  player1Odd: boolean;
  player2Odd: boolean;
  biggerRemainder: "player1" | "player2" | "equal";
}

export interface Prediction {
  id: string;
  matchId: string;
  remainderPair: RemainderPair;
  structuralClass: StructuralClass;
  predictedWinner: string;
  strength: "strong" | "moderate" | "weak" | "no_prediction";
  evidence: HistoricalEvidence[];
  formulaVersion: string;
  engineVersion: string;
  frozenAt?: Date;
  createdAt: Date;
}

export interface HistoricalEvidence {
  matchId: string;
  winner: string;
  remainderPair: RemainderPair;
  structuralClass: StructuralClass;
  city: string;
  weekday: number;
  hijriMonth?: number;
  hijriDate?: number;
  timeDistance?: number;
  similarityScore: number;
}

export interface NameMapping {
  playerName: string;
  arabicMeaning: string;
  abjadValue: number;
  approved: boolean;
}
