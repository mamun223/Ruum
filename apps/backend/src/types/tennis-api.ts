/**
 * Tennis API response types (SportsAPI365 / tennis-api.com)
 */

export interface TennisAPIPlayer {
  id: number;
  name: string;
  countryAcr?: string;
}

export interface TennisAPITournament {
  id: number;
  name: string;
  countryAcr?: string;
  courtId?: number | null;
  date?: string;
  rankId?: number | null;
}

/** Row from /extend/api/events/live */
export interface TennisAPILiveEvent {
  id: string;
  name: string;
  participant1: string;
  participant2: string;
  league: string;
  /** Sets so far, comma-separated, participant1 first, e.g. "6-2,4-1" */
  score: string;
  status: string;
  /** Current game points, participant1 first, e.g. "30-15" */
  points: string;
  tourType: "atp" | "wta";
  startTimestamp: number;
  matchId: string;
  dateOnly: string;
  updatedAt: number;
}

/** Response of /matches/{matchId}/live */
export interface TennisAPIMatchLive {
  matchId: number;
  type: "atp" | "wta";
  eventId: string;
  /** e.g. "InPlay", "Ended" */
  status: string;
  /** Sets, comma-separated, player1 first, e.g. "6-7,6-2,3-6" */
  score: string;
  points: string;
  startTimestamp: number;
  player1: { id: number; name: string };
  player2: { id: number; name: string };
}

export interface TennisAPIFixture {
  id: number | string;
  matchId: number | string;
  /** null when the order of play is not published yet */
  date: string | null;
  startTime?: string;
  roundId?: number;
  player1Id: number;
  player2Id: number;
  tournamentId: number;
  seed1?: string | null;
  seed2?: string | null;
  match_winner?: number;
  result?: string;
  result_type?: string;
  player1: TennisAPIPlayer;
  player2: TennisAPIPlayer;
  tournament?: TennisAPITournament;
}

export interface TennisAPIResponse {
  data: TennisAPIFixture[];
  page?: number;
  pageNo?: number;
  pageSize?: number;
  limit?: number;
  hasNextPage?: boolean;
}
