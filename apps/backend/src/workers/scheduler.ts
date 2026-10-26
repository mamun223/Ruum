/**
 * In-process scheduler: re-ingest today's matches and refresh predictions
 * every REFRESH_INTERVAL_MINUTES (default 15). Cycles never overlap.
 */

import { ingestLiveScores, runFullIngestion } from "./match-ingestion";
import { refreshPredictions } from "./prediction-refresh";
import { isSuggestionEnabled } from "../services/ai-client";
import { reviewFailedPicks } from "../services/pick-review";

const DEFAULT_INTERVAL_MINUTES = 15;
const DEFAULT_LIVE_POLL_SECONDS = 60;

let livePolling = false;
let lastLive: { at: string; live: number; matched: number; error?: string } | null =
  null;

/** Refresh live scores; skipped while a full cycle runs (it ingests live scores too) */
async function pollLive() {
  if (livePolling || running) return;
  livePolling = true;
  try {
    const r = await ingestLiveScores();
    lastLive = { at: new Date().toISOString(), live: r.live, matched: r.matched };
  } catch (error) {
    lastLive = {
      at: new Date().toISOString(),
      live: 0,
      matched: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    livePolling = false;
  }
}

let running = false;
let lastRun: {
  startedAt: string;
  finishedAt?: string;
  error?: string;
  predictions?: Awaited<ReturnType<typeof refreshPredictions>>;
} | null = null;

export async function runRefreshCycle() {
  if (running) {
    console.log("Refresh: previous cycle still running, skipping");
    return { skipped: true };
  }

  running = true;
  lastRun = { startedAt: new Date().toISOString() };
  try {
    await runFullIngestion();
    const predictions = await refreshPredictions();
    lastRun.predictions = predictions;
    if (isSuggestionEnabled()) {
      try {
        const r = await reviewFailedPicks();
        console.log(
          `Pick re-check: ${r.reviewed} failed picks re-checked, ${r.flipped} would have won with a different name variant`,
        );
      } catch (error) {
        console.error("Pick re-check failed:", error);
      }
    }
    return { skipped: false, predictions };
  } catch (error) {
    lastRun.error = error instanceof Error ? error.message : String(error);
    console.error("Refresh cycle failed:", error);
    return { skipped: false, error: lastRun.error };
  } finally {
    lastRun.finishedAt = new Date().toISOString();
    running = false;
  }
}

export function startScheduler() {
  if (process.env.ENABLE_SCHEDULER === "false") {
    console.log("Scheduler: disabled (ENABLE_SCHEDULER=false)");
    return;
  }

  const minutes =
    Number(process.env.REFRESH_INTERVAL_MINUTES) || DEFAULT_INTERVAL_MINUTES;
  console.log(`Scheduler: refreshing every ${minutes} minutes`);

  void runRefreshCycle();
  setInterval(() => void runRefreshCycle(), minutes * 60 * 1000);

  const liveSeconds =
    Number(process.env.LIVE_POLL_SECONDS) || DEFAULT_LIVE_POLL_SECONDS;
  console.log(`Scheduler: live scores every ${liveSeconds}s`);
  setInterval(() => void pollLive(), liveSeconds * 1000);
}

export function schedulerStatus() {
  return {
    running,
    lastRun,
    lastLive,
    intervalMinutes:
      Number(process.env.REFRESH_INTERVAL_MINUTES) || DEFAULT_INTERVAL_MINUTES,
  };
}
