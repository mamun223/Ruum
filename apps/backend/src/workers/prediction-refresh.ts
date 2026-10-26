/**
 * Re-predict today's upcoming matches with the latest same-day evidence,
 * once per calculation method (pronunciation and meaning).
 * A prediction is frozen once its match starts, so it is never changed afterwards.
 */

import { prisma } from "@tennis-prediction/database";
import {
  CALCULATION_METHODS,
  calculatePrediction,
} from "../services/calculation";
import { tournamentLocalDate } from "./match-ingestion";

export async function refreshPredictions() {
  const now = new Date();

  // Freeze predictions for matches that have started or finished
  const frozen = await prisma.prediction.updateMany({
    where: {
      frozenAt: null,
      match: {
        OR: [{ scheduledTime: { lte: now } }, { status: { not: "SCHEDULED" } }],
      },
    },
    data: { frozenAt: now },
  });

  const upcoming = await prisma.match.findMany({
    where: { status: "SCHEDULED", scheduledTime: { gt: now } },
    include: {
      player1: true,
      player2: true,
      predictions: { select: { method: true, frozenAt: true } },
    },
    orderBy: { scheduledTime: "asc" },
  });

  const stats = Object.fromEntries(
    CALCULATION_METHODS.map((m) => [m, { updated: 0, skipped: 0 }]),
  ) as Record<(typeof CALCULATION_METHODS)[number], { updated: number; skipped: number }>;

  for (const match of upcoming) {
    // Same-day evidence only exists for tournament-local today; later days wait
    if (
      match.timeTbd ||
      tournamentLocalDate(match.scheduledTime, match.country, match.tournament) !==
        tournamentLocalDate(now, match.country, match.tournament)
    )
      continue;

    for (const method of CALCULATION_METHODS) {
      if (match.predictions.some((p) => p.method === method && p.frozenAt))
        continue;

      const result = await calculatePrediction({
        method,
        player1Name: match.player1.name,
        player2Name: match.player2.name,
        country: match.country,
        tournament: match.tournament,
        scheduledTime: match.scheduledTime,
      });

      if (
        result.error ||
        !result.remainderPair ||
        !result.structuralClass ||
        !result.prediction
      ) {
        await prisma.prediction.deleteMany({
          where: { matchId: match.id, method, frozenAt: null },
        });
        stats[method].skipped++;
        continue;
      }

      const winnerId =
        result.prediction.winner === "player1"
          ? match.player1Id
          : result.prediction.winner === "player2"
            ? match.player2Id
            : null;

      const data = {
        remainderPair: result.remainderPair as object,
        structuralClass: result.structuralClass as object,
        predictedWinner: winnerId,
        strength: result.prediction.strength,
        reason: result.prediction.reason ?? null,
        evidence: (result.evidence ?? []) as object[],
      };

      await prisma.prediction.upsert({
        where: { matchId_method: { matchId: match.id, method } },
        update: data,
        create: { matchId: match.id, method, ...data },
      });
      stats[method].updated++;
    }
  }

  const { PRONUNCIATION: p, MEANING: m } = stats;
  console.log(
    `Predictions: pronunciation ${p.updated} refreshed / ${p.skipped} skipped, meaning ${m.updated} refreshed / ${m.skipped} skipped (missing names), ${frozen.count} frozen at match start`,
  );
  return {
    updated: p.updated,
    skipped: p.skipped,
    meaning: m,
    frozen: frozen.count,
  };
}
