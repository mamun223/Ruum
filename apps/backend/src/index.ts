/**
 * Backend server entry point
 */

import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import {
  calculatePrediction,
  CalculationMethod,
} from "./services/calculation";
import {
  approveNameMeaning,
  findMissingMeanings,
  listPendingMeanings,
  loadMeaningDictionary,
  rejectNameMeaning,
  searchNameMeanings,
  upsertNameMeaning,
} from "./services/meanings";
import { suggestMissingMeanings } from "./services/meaning-suggestions";
import {
  approveNameMapping,
  findMissingNames,
  listPendingNames,
  loadNameDictionary,
  resolveName,
  rejectNameMapping,
  searchNameMappings,
  upsertNameMapping,
} from "./services/names";
import { suggestMissingNames } from "./services/name-suggestions";
import { suggestMissingPlaces } from "./services/place-suggestions";
import {
  approvePlace,
  findMissingPlaces,
  listPendingPlaces,
  loadPlaceDictionary,
  PlaceKind,
  rejectPlace,
  resolveEnvironment,
  upsertPlace,
} from "./services/places";
import {
  calculatePlayerRemainder,
  cityFromTournament,
  getCountryTimezone,
  getLocalDateString,
} from "@tennis-prediction/shared";
import {
  runRefreshCycle,
  schedulerStatus,
  startScheduler,
} from "./workers/scheduler";
import { prisma } from "@tennis-prediction/database";
import {
  listReviews,
  reviewFailedPicks,
  reviewView,
} from "./services/pick-review";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Internal server error";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Prediction calculation endpoint
app.post("/api/predict", async (req: Request, res: Response) => {
  try {
    const {
      player1Name,
      player2Name,
      country,
      tournament,
      city,
      scheduledTime,
      method,
    } = req.body;

    if (!player1Name || !player2Name || !country) {
      return res.status(400).json({
        error: "Missing required fields: player1Name, player2Name, country",
      });
    }
    if (method && method !== "PRONUNCIATION" && method !== "MEANING") {
      return res
        .status(400)
        .json({ error: "method must be PRONUNCIATION or MEANING" });
    }

    const parsedTime = scheduledTime ? new Date(scheduledTime) : undefined;
    if (parsedTime && isNaN(parsedTime.getTime())) {
      return res.status(400).json({ error: "Invalid scheduledTime" });
    }

    const result = await calculatePrediction({
      method: method as CalculationMethod | undefined,
      player1Name,
      player2Name,
      country,
      tournament,
      city,
      scheduledTime: parsedTime,
    });

    res.json(result);
  } catch (error) {
    console.error("Prediction error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

// Type-ahead search: ?q=jan -> saved Arabic names + today's first names without one
app.get("/api/names/search", async (req: Request, res: Response) => {
  try {
    res.json({ results: await searchNameMappings(String(req.query.q ?? "")) });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

// First names in today's matches without an approved meaning
app.get("/api/names/missing", async (_req: Request, res: Response) => {
  try {
    const { missing, ignoredCompound } = await findMissingNames();
    res.json({ count: missing.length, missing, ignoredCompound });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

// Add or correct a first-name meaning (approved immediately)
app.put("/api/names", async (req: Request, res: Response) => {
  const { name, arabicMeaning, meaning } = req.body ?? {};
  if (!name || !arabicMeaning) {
    return res
      .status(400)
      .json({ error: "Missing required fields: name, arabicMeaning" });
  }
  try {
    res.json(await upsertNameMapping(name, arabicMeaning, meaning));
  } catch (error) {
    res.status(400).json({ error: errorMessage(error) });
  }
});

// Ask the AI to suggest meanings for missing first names (saved unapproved)
app.post("/api/names/suggest", async (_req: Request, res: Response) => {
  try {
    res.json(await suggestMissingNames());
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

// Suggestions waiting for approval
app.get("/api/names/pending", async (_req: Request, res: Response) => {
  try {
    const pending = await listPendingNames();
    res.json({ count: pending.length, pending });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

// Approve a suggestion, optionally correcting it: { arabicMeaning? }
app.post("/api/names/:key/approve", async (req: Request, res: Response) => {
  try {
    res.json(await approveNameMapping(req.params.key, req.body?.arabicMeaning));
  } catch (error) {
    res.status(400).json({ error: errorMessage(error) });
  }
});

// Reject (delete) a suggestion
app.delete("/api/names/:key", async (req: Request, res: Response) => {
  try {
    await rejectNameMapping(req.params.key);
    res.json({ deleted: req.params.key });
  } catch {
    res.status(404).json({ error: "Name not found" });
  }
});

// --- Name meanings (separate calculation from the pronunciation names above) ---

// Type-ahead search: ?q=jan -> saved meanings + today's first names without one
app.get("/api/meanings/search", async (req: Request, res: Response) => {
  try {
    res.json({ results: await searchNameMeanings(String(req.query.q ?? "")) });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

app.get("/api/meanings/missing", async (_req: Request, res: Response) => {
  try {
    const { missing, ignoredCompound } = await findMissingMeanings();
    res.json({ count: missing.length, missing, ignoredCompound });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

// Add or correct a meaning: { name, arabicMeaning, meaning? } (approved immediately)
app.put("/api/meanings", async (req: Request, res: Response) => {
  const { name, arabicMeaning, meaning } = req.body ?? {};
  if (!name || !arabicMeaning) {
    return res
      .status(400)
      .json({ error: "Missing required fields: name, arabicMeaning" });
  }
  try {
    res.json(await upsertNameMeaning(name, arabicMeaning, meaning));
  } catch (error) {
    res.status(400).json({ error: errorMessage(error) });
  }
});

app.post("/api/meanings/suggest", async (_req: Request, res: Response) => {
  try {
    res.json(await suggestMissingMeanings());
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

app.get("/api/meanings/pending", async (_req: Request, res: Response) => {
  try {
    const pending = await listPendingMeanings();
    res.json({ count: pending.length, pending });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

app.post("/api/meanings/:key/approve", async (req: Request, res: Response) => {
  try {
    res.json(await approveNameMeaning(req.params.key, req.body?.arabicMeaning));
  } catch (error) {
    res.status(400).json({ error: errorMessage(error) });
  }
});

app.delete("/api/meanings/:key", async (req: Request, res: Response) => {
  try {
    await rejectNameMeaning(req.params.key);
    res.json({ deleted: req.params.key });
  } catch {
    res.status(404).json({ error: "Name not found" });
  }
});

// Today's stored predictions (refreshed by the scheduler)
app.get("/api/predictions", async (_req: Request, res: Response) => {
  try {
    const predictions = await prisma.prediction.findMany({
      include: {
        match: { include: { player1: true, player2: true } },
        predictedWinnerPlayer: true,
      },
      orderBy: { match: { scheduledTime: "asc" } },
    });
    res.json({
      count: predictions.length,
      predictions: predictions.map((p) => ({
        matchId: p.matchId,
        method: p.method,
        scheduledTime: p.match.scheduledTime,
        tournament: p.match.tournament,
        country: p.match.country,
        player1: p.match.player1.name,
        player2: p.match.player2.name,
        predictedWinner: p.predictedWinnerPlayer?.name ?? null,
        strength: p.strength,
        reason: p.reason,
        evidenceCount: p.evidence.length,
        frozen: Boolean(p.frozenAt),
        updatedAt: p.updatedAt,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

// Today's stored matches with first-name resolution and any prediction
app.get("/api/matches", async (_req: Request, res: Response) => {
  try {
    const [matches, dictionary, meaningDictionary, places, reviews] =
      await Promise.all([
        prisma.match.findMany({
          include: {
            player1: true,
            player2: true,
            winner: true,
            predictions: true,
          },
          orderBy: { scheduledTime: "asc" },
        }),
        loadNameDictionary(),
        loadMeaningDictionary(),
        loadPlaceDictionary(),
        prisma.pickReview.findMany(),
      ]);
    const reviewFor = new Map(
      reviews.map((r) => [`${r.matchId}:${r.method}`, reviewView(r)]),
    );
    const side = (
      name: string,
      baseTotal: number | null,
      dict = dictionary,
    ) => {
      const r = resolveName(name, dict);
      return {
        name,
        firstName: r?.firstName ?? null,
        arabicMeaning: r?.arabicMeaning ?? null,
        abjadValue: r?.abjadValue ?? null,
        remainder:
          r && baseTotal != null
            ? calculatePlayerRemainder(r.abjadValue, baseTotal)
            : null,
      };
    };
    res.json({
      count: matches.length,
      matches: matches.map((m) => {
        const view = (method: CalculationMethod) => {
          const p = m.predictions.find((x) => x.method === method);
          return p
            ? {
                predictedWinner:
                  p.predictedWinner === m.player1Id
                    ? m.player1.name
                    : p.predictedWinner === m.player2Id
                      ? m.player2.name
                      : null,
                strength: p.strength,
                reason: p.reason,
                evidenceCount: p.evidence.length,
                frozen: Boolean(p.frozenAt),
                remainderPair: p.remainderPair,
                structuralClass: p.structuralClass,
                evidence: p.evidence,
                review: reviewFor.get(`${m.id}:${method}`) ?? null,
              }
            : null;
        };
        const env = resolveEnvironment(
          m.country,
          m.tournament,
          m.scheduledTime,
          places,
        );
        const base = "missing" in env ? null : env.base;
        const timeZone = getCountryTimezone(
          m.country,
          cityFromTournament(m.tournament),
        );
        const localDate = getLocalDateString(m.scheduledTime, timeZone);
        return {
          id: m.id,
          scheduledTime: m.scheduledTime,
          timeTbd: m.timeTbd,
          timeZone,
          localDate,
          dayOffset: Math.round(
            (Date.parse(localDate) -
              Date.parse(getLocalDateString(new Date(), timeZone))) /
              86_400_000,
          ),
          score: m.score,
          points: m.points,
          liveUpdatedAt: m.liveUpdatedAt,
          status: m.status,
          tournament: m.tournament,
          country: m.country,
          environment: base,
          missingPlaces: "missing" in env ? env.missing : [],
          player1: side(m.player1.name, base?.total ?? null),
          player2: side(m.player2.name, base?.total ?? null),
          winner: m.winner?.name ?? null,
          prediction: view("PRONUNCIATION"),
          meaning: {
            player1: side(m.player1.name, base?.total ?? null, meaningDictionary),
            player2: side(m.player2.name, base?.total ?? null, meaningDictionary),
            prediction: view("MEANING"),
          },
        };
      }),
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

const placeKind = (value: unknown): PlaceKind | null =>
  value === "COUNTRY" || value === "CITY" ? value : null;

// Countries/cities in today's matches without an approved Arabic name, plus pending suggestions
app.get("/api/places", async (_req: Request, res: Response) => {
  try {
    const [missing, pending] = await Promise.all([
      findMissingPlaces(),
      listPendingPlaces(),
    ]);
    res.json({ missing, pending });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

// Add or correct a place: { kind: COUNTRY|CITY, name, arabicName } (approved immediately)
app.put("/api/places", async (req: Request, res: Response) => {
  const { kind, name, arabicName } = req.body ?? {};
  const k = placeKind(kind);
  if (!k || !name || !arabicName) {
    return res
      .status(400)
      .json({ error: "Required: kind (COUNTRY|CITY), name, arabicName" });
  }
  try {
    res.json(await upsertPlace(k, name, arabicName));
  } catch (error) {
    res.status(400).json({ error: errorMessage(error) });
  }
});

// Ask the AI to suggest Arabic names for missing countries/cities (saved unapproved)
app.post("/api/places/suggest", async (_req: Request, res: Response) => {
  try {
    res.json(await suggestMissingPlaces());
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

app.post(
  "/api/places/:kind/:key/approve",
  async (req: Request, res: Response) => {
    const k = placeKind(req.params.kind);
    if (!k)
      return res.status(400).json({ error: "kind must be COUNTRY or CITY" });
    try {
      res.json(await approvePlace(k, req.params.key, req.body?.arabicName));
    } catch (error) {
      res.status(400).json({ error: errorMessage(error) });
    }
  },
);

app.delete("/api/places/:kind/:key", async (req: Request, res: Response) => {
  const k = placeKind(req.params.kind);
  if (!k)
    return res.status(400).json({ error: "kind must be COUNTRY or CITY" });
  try {
    await rejectPlace(k, req.params.key);
    res.json({ deleted: req.params.key });
  } catch {
    res.status(404).json({ error: "Place not found" });
  }
});

// Trigger a refresh cycle now (ingest + re-predict)
// Re-checks of failed picks with alternative name spellings / meanings (newest first)
app.get("/api/reviews", async (_req: Request, res: Response) => {
  try {
    const reviews = await listReviews();
    res.json({
      count: reviews.length,
      flipped: reviews.filter((r) => r.flipped).length,
      reviews,
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

// Re-check failed picks that have no review yet
app.post("/api/reviews/run", async (_req: Request, res: Response) => {
  try {
    const r = await reviewFailedPicks();
    res.json({ ...r, reviews: r.reviews.map(reviewView) });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

// Re-check (or re-run) the failed picks of one match
app.post("/api/reviews/:matchId", async (req: Request, res: Response) => {
  try {
    const r = await reviewFailedPicks(req.params.matchId);
    res.json({ ...r, reviews: r.reviews.map(reviewView) });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
});

app.post("/api/refresh", async (_req: Request, res: Response) => {
  res.json(await runRefreshCycle());
});

app.get("/api/refresh/status", (_req: Request, res: Response) => {
  res.json(schedulerStatus());
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startScheduler();
});
