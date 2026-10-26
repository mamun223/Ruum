/**
 * Tennis API client for fetching current match data
 * Provider: SportsAPI365 (tennis-api.com)
 * Auth: X-Gravitee-Api-Key header
 * Rate limit: 4 requests / second -> calls are spaced and 429s retried.
 */

import fetch from "node-fetch";
import {
  TennisAPIFixture,
  TennisAPILiveEvent,
  TennisAPIMatchLive,
  TennisAPIResponse,
} from "../types/tennis-api";

const BASE_URL = "https://api.sportsapi365.com/v1/tennis";
const API_KEY = process.env.TENNIS_API_KEY;

const headers = {
  "X-Gravitee-Api-Key": API_KEY || "",
  "Content-Type": "application/json",
};

const MAX_PAGES = 20;
const MIN_SPACING_MS = 300;
const MAX_RETRIES = 4;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Serialize all API calls so the live poller and the ingestion never burst together
let queue: Promise<unknown> = Promise.resolve();
let lastCall = 0;

function getJson<T>(path: string): Promise<T> {
  const run = async (): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      const wait = lastCall + MIN_SPACING_MS - Date.now();
      if (wait > 0) await sleep(wait);
      lastCall = Date.now();

      const response = await fetch(`${BASE_URL}${path}`, { headers });
      if (response.status === 429 && attempt < MAX_RETRIES) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      if (!response.ok) {
        throw new Error(
          `Tennis API error: ${response.status} ${response.statusText} (${path})`,
        );
      }
      return (await response.json()) as T;
    }
  };
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}

/**
 * Fetch every page of a list endpoint (API pages by `pageNo`, 100 per page)
 */
async function fetchAllPages(path: string): Promise<TennisAPIFixture[]> {
  const all: TennisAPIFixture[] = [];
  const sep = path.includes("?") ? "&" : "?";

  for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo++) {
    const data = await getJson<TennisAPIResponse>(
      `${path}${sep}include=tournament&pageNo=${pageNo}`,
    );
    all.push(...(data.data ?? []));
    if (!data.hasNextPage) break;
  }

  return all;
}

/**
 * Fetch fixtures for a specific date (YYYY-MM-DD) for ATP or WTA
 */
export async function fetchFixtures(
  type: "atp" | "wta",
  date: string,
): Promise<TennisAPIFixture[]> {
  return fetchAllPages(`/${type}/fixtures/${date}`);
}

/**
 * Fetch fixtures between two dates (YYYY-MM-DD, inclusive) for ATP or WTA
 */
export async function fetchFixturesRange(
  type: "atp" | "wta",
  startDate: string,
  endDate: string,
): Promise<TennisAPIFixture[]> {
  return fetchAllPages(`/${type}/fixtures/${startDate}/${endDate}`);
}

/**
 * Fixtures from today onward, including drawn matches whose order of play
 * is not published yet (date / startTime null)
 */
export async function fetchUpcomingFixtures(
  type: "atp" | "wta",
): Promise<TennisAPIFixture[]> {
  return fetchAllPages(`/${type}/fixtures`);
}

/**
 * Fetch results for a specific date (YYYY-MM-DD) for ATP or WTA
 */
export async function fetchResults(
  type: "atp" | "wta",
  date: string,
): Promise<TennisAPIFixture[]> {
  return fetchAllPages(`/${type}/results/${date}`);
}

/**
 * All in-play matches (both tours) with live set score and game points
 */
export async function fetchLiveEvents(): Promise<TennisAPILiveEvent[]> {
  const data = await getJson<{ results?: TennisAPILiveEvent[] }>(
    "/extend/api/events/live",
  );
  return data.results ?? [];
}

/**
 * Live/final state of one scheduled match (fixtures `matchId`).
 * `status` is e.g. "InPlay" or "Ended"; `{}` before the match reaches the live feed.
 */
export async function fetchMatchLive(
  type: "atp" | "wta",
  matchId: string | number,
): Promise<TennisAPIMatchLive | null> {
  const data = await getJson<Partial<TennisAPIMatchLive>>(
    `/matches/${matchId}/live?type=${type}&source=today`,
  );
  return data.status ? (data as TennisAPIMatchLive) : null;
}

/**
 * Fetch fixtures for a specific tournament
 */
export async function fetchTournamentFixtures(
  type: "atp" | "wta",
  tournamentId: string,
): Promise<TennisAPIFixture[]> {
  const data = await getJson<TennisAPIResponse>(
    `/${type}/fixtures/tournament/${tournamentId}`,
  );
  return data.data;
}
