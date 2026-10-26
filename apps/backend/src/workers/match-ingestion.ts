/**
 * Match ingestion worker - fetches upcoming, live and completed matches.
 *
 * - Upcoming: dated fixtures for tournament-local today .. today + UPCOMING_DAYS,
 *   plus drawn matches whose order of play is not published yet (time TBD).
 * - Live: in-play set score and game points (polled every minute by the scheduler).
 * - Completed: today's results with the final score (same-day evidence).
 */

import {
  fetchFixturesRange,
  fetchLiveEvents,
  fetchMatchLive,
  fetchResults,
  fetchUpcomingFixtures,
} from "../services/tennis-api";
import { prisma } from "@tennis-prediction/database";
import {
  cityFromTournament,
  getCountryLocalDate,
} from "@tennis-prediction/shared";
import { TennisAPIFixture } from "../types/tennis-api";
import {
  isSuggestionEnabled,
  suggestMissingNames,
} from "../services/name-suggestions";
import { suggestMissingMeanings } from "../services/meaning-suggestions";
import { suggestMissingPlaces } from "../services/place-suggestions";

type Tour = "atp" | "wta";
const TOURS: Tour[] = ["atp", "wta"];

/** How many days after tournament-local today to keep upcoming fixtures for */
const UPCOMING_DAYS = Number(process.env.UPCOMING_DAYS) || 3;

/**
 * UTC calendar date (YYYY-MM-DD) offset from today
 */
function utcDateString(offsetDays: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().split("T")[0];
}

/** YYYY-MM-DD plus n days */
function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

/** Tournament-local calendar date of an instant (time zone from country + city) */
export function tournamentLocalDate(
  time: Date,
  country: string | null | undefined,
  tournament: string,
): string {
  return getCountryLocalDate(time, country, cityFromTournament(tournament));
}

const fixtureTournament = (f: TennisAPIFixture) =>
  f.tournament?.name ?? `Tournament ${f.tournamentId}`;

/**
 * Days from tournament-local today to the fixture's local date (0 = today)
 */
function localDayOffset(fixture: TennisAPIFixture, now: Date): number {
  const country = fixture.tournament?.countryAcr;
  const tournament = fixtureTournament(fixture);
  const time = new Date(fixture.date!);
  // A bare date (00:00Z, no start time) is the venue's calendar date, not an instant
  const bareDate = time.getUTCHours() === 0 && time.getUTCMinutes() === 0;
  const day = bareDate
    ? fixture.date!.slice(0, 10)
    : tournamentLocalDate(time, country, tournament);
  const today = tournamentLocalDate(now, country, tournament);
  return Math.round(
    (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      86_400_000,
  );
}

/**
 * Ingest upcoming fixtures for both tours: local today .. today + UPCOMING_DAYS,
 * plus drawn matches without a published time.
 * Local today can start on yesterday's UTC date (Asia) or run into tomorrow's (Americas).
 */
export async function ingestUpcomingFixtures() {
  const now = new Date();
  const start = utcDateString(-1);
  const end = addDays(utcDateString(0), UPCOMING_DAYS + 1);
  let fetched = 0;
  let stored = 0;
  let tbd = 0;

  for (const tour of TOURS) {
    const [ranged, onward] = await Promise.all([
      fetchFixturesRange(tour, start, end),
      fetchUpcomingFixtures(tour),
    ]);
    const byId = new Map<string, TennisAPIFixture>();
    for (const f of [...ranged, ...onward]) byId.set(String(f.matchId), f);
    fetched += byId.size;

    for (const f of byId.values()) {
      if (f.date) {
        const offset = localDayOffset(f, now);
        if (offset < 0 || offset > UPCOMING_DAYS) continue;
      } else {
        tbd++;
      }
      await upsertMatch(f, tour);
      stored++;
    }
  }

  console.log(
    `Fixtures: fetched ${fetched} (UTC ${start}..${end} + today onward), stored ${stored} for local today..+${UPCOMING_DAYS}d (${tbd} time TBD)`,
  );
}

/**
 * Ingest today's completed results (same-day evidence) with final scores.
 * Local today can start on yesterday's UTC date (e.g. Asia / Australia).
 */
export async function ingestTodayResults() {
  const now = new Date();
  const dates = [utcDateString(-1), utcDateString(0)];
  let fetched = 0;
  let stored = 0;

  for (const tour of TOURS) {
    for (const date of dates) {
      const items = await fetchResults(tour, date);
      fetched += items.length;
      for (const item of items) {
        if (!item.date || localDayOffset(item, now) !== 0) continue;
        await upsertMatch(item, tour);
        stored++;
      }
    }
  }

  console.log(
    `Results: fetched ${fetched} (UTC ${dates.join(", ")}), stored ${stored} on tournament-local today`,
  );
}

/**
 * Delete matches (and dependent rows) whose tournament-local date has passed.
 * Players are kept because they hold the Arabic name dictionary.
 */
export async function purgeOldData() {
  const now = new Date();
  const matches = await prisma.match.findMany({
    select: { id: true, scheduledTime: true, country: true, tournament: true },
  });

  const staleIds = matches
    .filter(
      (m) =>
        tournamentLocalDate(m.scheduledTime, m.country, m.tournament) <
        tournamentLocalDate(now, m.country, m.tournament),
    )
    .map((m) => m.id);

  if (staleIds.length === 0) {
    console.log("Purge: nothing older than tournament-local today");
    return;
  }

  const [evidence, predictions, deleted] = await prisma.$transaction([
    prisma.historicalEvidence.deleteMany({
      where: { matchId: { in: staleIds } },
    }),
    prisma.prediction.deleteMany({ where: { matchId: { in: staleIds } } }),
    prisma.match.deleteMany({ where: { id: { in: staleIds } } }),
  ]);

  console.log(
    `Purge: ${deleted.count} matches, ${predictions.count} predictions, ${evidence.count} evidence rows`,
  );
}

/** 12:00 local time at the venue on a given calendar date (YYYY-MM-DD) */
function venueMidday(date: string, country: string, tournament: string): Date {
  let t = Date.parse(`${date}T12:00:00Z`);
  for (let i = 0; i < 2; i++) {
    const local = tournamentLocalDate(new Date(t), country, tournament);
    if (local === date) break;
    t += (local < date ? 1 : -1) * 12 * 3600_000;
  }
  return new Date(t);
}

/** Swap each "a-b" pair (keeping tiebreak notes), e.g. "6-3 7-6(5)" -> "3-6 6-7(5)" */
function flipScore(score: string): string {
  return score.replace(/(\d+)-(\d+)/g, "$2-$1");
}

/**
 * Upsert match to database
 */
async function upsertMatch(fixture: TennisAPIFixture, tour: Tour) {
  const [player1, player2] = await Promise.all(
    [fixture.player1, fixture.player2].map(({ name, countryAcr }) => {
      const country = countryAcr?.trim() || null;
      return prisma.player.upsert({
        where: { name },
        update: country ? { country } : {},
        create: { name, country },
      });
    }),
  );

  const tournamentName = fixtureTournament(fixture);
  const country = fixture.tournament?.countryAcr ?? "Unknown";

  // No date = order of play not published yet. Keep it on "now" so it is never
  // purged as stale and never predicted; the real time replaces it once published.
  // A bare date (00:00Z) has no start time: anchor it to midday at the venue so it
  // lands on the right local day.
  const apiTime = fixture.date ? new Date(fixture.date) : null;
  const bareDate =
    apiTime !== null &&
    apiTime.getUTCHours() === 0 &&
    apiTime.getUTCMinutes() === 0;
  const timeTbd = !apiTime || bareDate;
  const scheduledTime = !apiTime
    ? new Date()
    : bareDate
      ? venueMidday(fixture.date!.slice(0, 10), country, tournamentName)
      : apiTime;
  const matchId = `${tour}-${fixture.matchId}`;

  const isCompleted =
    fixture.result_type === "completed" || Boolean(fixture.match_winner);
  const winnerId = fixture.match_winner
    ? Number(fixture.match_winner) === Number(fixture.player1Id)
      ? player1.id
      : player2.id
    : null;

  // API does not provide city - store tournament name as fallback
  const city = fixture.tournament?.name ?? "Unknown";

  // Fixtures and results use different ids for the same match: also match on tournament + players
  const existing =
    (await prisma.match.findUnique({ where: { id: matchId } })) ??
    (await prisma.match.findFirst({
      where: {
        tournament: tournamentName,
        OR: [
          { player1Id: player1.id, player2Id: player2.id },
          { player1Id: player2.id, player2Id: player1.id },
        ],
      },
    }));

  // Score is given in API player order; store it in our player order
  const flipped = existing ? existing.player1Id !== player1.id : false;
  const score = fixture.result
    ? flipped
      ? flipScore(fixture.result)
      : fixture.result
    : null;

  if (existing) {
    // A bare or missing date is a placeholder; never let it replace a real start time
    const keepTime = timeTbd && !existing.timeTbd;
    const time = keepTime ? existing.scheduledTime : scheduledTime;
    const stillTbd = keepTime ? existing.timeTbd : timeTbd;

    // Never move a live or finished match back to SCHEDULED
    if (!isCompleted && existing.status !== "SCHEDULED") {
      await prisma.match.update({
        where: { id: existing.id },
        data: { scheduledTime: time, timeTbd: stillTbd },
      });
      return;
    }

    await prisma.match.update({
      where: { id: existing.id },
      data: {
        scheduledTime: time,
        timeTbd: stillTbd,
        status: isCompleted ? "COMPLETED" : "SCHEDULED",
        winnerId,
        actualStartTime: isCompleted ? time : null,
        ...(isCompleted ? { score: score ?? existing.score, points: null } : {}),
      },
    });
    return;
  }

  await prisma.match.create({
    data: {
      id: matchId,
      player1Id: player1.id,
      player2Id: player2.id,
      tournament: tournamentName,
      city,
      country,
      scheduledTime,
      timeTbd,
      status: isCompleted ? "COMPLETED" : "SCHEDULED",
      winnerId,
      score,
      actualStartTime: isCompleted ? scheduledTime : null,
    },
  });
}

/**
 * Pull in-play matches and update live score / game points on stored matches.
 * Live rows are linked by player names (the live feed uses its own ids).
 */
export async function ingestLiveScores() {
  const events = await fetchLiveEvents();
  const now = new Date();
  const seen = new Set<string>();
  let unmatched = 0;

  for (const e of events) {
    const names = [e.participant1, e.participant2];
    const match = await prisma.match.findFirst({
      where: {
        status: { in: ["SCHEDULED", "IN_PROGRESS"] },
        player1: { name: { in: names } },
        player2: { name: { in: names } },
        scheduledTime: {
          gte: new Date(now.getTime() - 24 * 3600_000),
          lte: new Date(now.getTime() + 24 * 3600_000),
        },
      },
      include: { player1: true },
      orderBy: { scheduledTime: "asc" },
    });
    if (!match) {
      unmatched++;
      continue;
    }
    seen.add(match.id);

    const flipped = match.player1.name !== e.participant1;
    const score = e.score ? e.score.split(",").join(" ") : null;
    const started = e.startTimestamp ? new Date(e.startTimestamp * 1000) : null;

    await prisma.match.update({
      where: { id: match.id },
      data: {
        status: "IN_PROGRESS",
        score: score && flipped ? flipScore(score) : score,
        points: e.points && flipped ? flipScore(e.points) : e.points || null,
        liveUpdatedAt: now,
        actualStartTime: match.actualStartTime ?? started,
        ...(match.timeTbd && started
          ? { scheduledTime: started, timeTbd: false }
          : {}),
      },
    });
  }

  // Matches that dropped out of the live feed: game points no longer apply
  await prisma.match.updateMany({
    where: { status: "IN_PROGRESS", id: { notIn: [...seen] }, points: { not: null } },
    data: { points: null },
  });

  const finalized = await finalizeEndedMatches(seen);
  return { live: events.length, matched: seen.size, unmatched, finalized };
}

/**
 * Sets won by each side from "6-7 6-2 3-6" (player1 first).
 * Null if any set is unfinished (e.g. a retirement), so the results feed decides.
 */
function setsWon(score: string): [number, number] | null {
  let a = 0;
  let b = 0;
  for (const set of score.trim().split(/[\s,]+/).filter(Boolean)) {
    const m = set.match(/^(\d+)-(\d+)/);
    if (!m) return null;
    const [x, y] = [Number(m[1]), Number(m[2])];
    const hi = Math.max(x, y);
    const lo = Math.min(x, y);
    const finished =
      (hi === 6 && lo <= 4) || // regular set
      (hi === 7 && (lo === 5 || lo === 6)) || // 7-5 or tiebreak
      (hi >= 10 && hi - lo >= 2); // match tiebreak / long final set
    if (!finished) return null;
    if (x > y) a++;
    else b++;
  }
  return a + b ? [a, b] : null;
}

const FINALIZE_AFTER_START_MS = 2 * 3600_000;
const FINALIZE_BATCH = 15;

/**
 * The results feed publishes finished matches hours late. Ask the per-match live
 * endpoint for matches that should be over (started 2h+ ago, or dropped out of
 * the live feed) and complete the ones it reports as "Ended", deciding the winner
 * by sets won. Only fixture-created matches (`atp-123` / `wta-123`) can be looked up.
 */
async function finalizeEndedMatches(stillLive: Set<string>) {
  const now = Date.now();
  const candidates = await prisma.match.findMany({
    where: {
      OR: [
        {
          status: "SCHEDULED",
          timeTbd: false,
          scheduledTime: { lt: new Date(now - FINALIZE_AFTER_START_MS) },
        },
        { status: "IN_PROGRESS", id: { notIn: [...stillLive] } },
      ],
    },
    include: { player1: true, player2: true },
    orderBy: { liveUpdatedAt: { sort: "asc", nulls: "first" } },
    take: FINALIZE_BATCH,
  });

  let completed = 0;
  for (const match of candidates) {
    const [tour, apiId] = match.id.split("-");
    if ((tour !== "atp" && tour !== "wta") || !/^\d+$/.test(apiId ?? "")) continue;

    try {
      const live = await fetchMatchLive(tour, apiId);
      if (!live) continue;
      const flipped = live.player1?.name !== match.player1.name;
      const raw = live.score ? live.score.split(",").join(" ") : null;
      const score = raw && flipped ? flipScore(raw) : raw;

      if (live.status !== "Ended" || !score) {
        await prisma.match.update({
          where: { id: match.id },
          data: { liveUpdatedAt: new Date() },
        });
        continue;
      }

      const sets = setsWon(score);
      if (!sets || sets[0] === sets[1]) continue;
      await prisma.match.update({
        where: { id: match.id },
        data: {
          status: "COMPLETED",
          score,
          points: null,
          winnerId: sets[0] > sets[1] ? match.player1Id : match.player2Id,
          liveUpdatedAt: new Date(),
          actualStartTime:
            match.actualStartTime ??
            (live.startTimestamp ? new Date(live.startTimestamp * 1000) : null),
        },
      });
      completed++;
    } catch (error) {
      console.error(`Finalize ${match.id} failed:`, error instanceof Error ? error.message : error);
    }
  }
  return completed;
}

/**
 * Run full ingestion: purge old data, then load upcoming fixtures, today's results and live scores
 */
export async function runFullIngestion() {
  console.log("Starting match ingestion...");
  await purgeOldData();
  await ingestUpcomingFixtures();
  await ingestTodayResults();
  const live = await ingestLiveScores();
  console.log(
    `Live: ${live.live} in play, ${live.matched} linked, ${live.unmatched} not in stored fixtures, ${live.finalized} finished matches completed from the live endpoint`,
  );
  console.log("Ingestion complete");

  if (isSuggestionEnabled()) {
    try {
      const s = await suggestMissingNames();
      console.log(
        `Name suggestions: ${s.requested} new first names, ${s.suggested} suggested, ${s.uncertain} uncertain (auto-approved)`,
      );
    } catch (error) {
      console.error("Name suggestions failed:", error);
    }
    try {
      const s = await suggestMissingMeanings();
      console.log(
        `Meaning suggestions: ${s.requested} new first names, ${s.suggested} suggested, ${s.uncertain} uncertain (auto-approved)`,
      );
    } catch (error) {
      console.error("Meaning suggestions failed:", error);
    }
    try {
      const s = await suggestMissingPlaces();
      console.log(
        `Place suggestions: ${s.requested} new places, ${s.suggested} suggested, ${s.uncertain.length} uncertain (auto-approved)`,
      );
    } catch (error) {
      console.error("Place suggestions failed:", error);
    }
  } else {
    console.log("Name suggestions: skipped (no AI key configured)");
  }
}
