"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Languages,
  Loader2,
  RefreshCw,
  Target,
} from "lucide-react";
import clsx from "clsx";
import {
  api,
  type MatchRow,
  type MissingName,
  type MissingPlace,
  type PendingName,
  type PendingPlace,
  type SchedulerStatus,
} from "@/lib/api";
import { MatchesView } from "@/components/MatchesView";
import { NamesView } from "@/components/NamesView";
import { PlacesView } from "@/components/PlacesView";
import { MeaningsView } from "@/components/MeaningsView";

type Tab = "matches" | "meanings" | "names" | "places";

const TAB_LABELS: Record<Tab, string> = {
  matches: "Matches",
  meanings: "Name meanings",
  names: "Arabic names",
  places: "Places",
};

function ago(iso?: string) {
  if (!iso) return "—";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return mins < 1 ? "just now" : `${mins} min ago`;
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Target;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl bg-slate-900/60 p-4 ring-1 ring-slate-800">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("matches");
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [missing, setMissing] = useState<MissingName[]>([]);
  const [ignoredCompound, setIgnoredCompound] = useState<string[]>([]);
  const [pending, setPending] = useState<PendingName[]>([]);
  const [missingPlaces, setMissingPlaces] = useState<MissingPlace[]>([]);
  const [pendingPlaces, setPendingPlaces] = useState<PendingPlace[]>([]);
  const [missingMeanings, setMissingMeanings] = useState<MissingName[]>([]);
  const [meaningCompound, setMeaningCompound] = useState<string[]>([]);
  const [pendingMeanings, setPendingMeanings] = useState<PendingName[]>([]);
  const [status, setStatus] = useState<SchedulerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [m, miss, pend, st, pl, mMiss, mPend] = await Promise.all([
        api<{ matches: MatchRow[] }>("/matches"),
        api<{ missing: MissingName[]; ignoredCompound: string[] }>(
          "/names/missing",
        ),
        api<{ pending: PendingName[] }>("/names/pending"),
        api<SchedulerStatus>("/refresh/status"),
        api<{ missing: MissingPlace[]; pending: PendingPlace[] }>("/places"),
        api<{ missing: MissingName[]; ignoredCompound: string[] }>(
          "/meanings/missing",
        ),
        api<{ pending: PendingName[] }>("/meanings/pending"),
      ]);
      setMissingMeanings(mMiss.missing);
      setMeaningCompound(mMiss.ignoredCompound);
      setPendingMeanings(mPend.pending);
      setMissingPlaces(pl.missing);
      setPendingPlaces(pl.pending);
      setMatches(m.matches);
      setMissing(miss.missing);
      setIgnoredCompound(miss.ignoredCompound);
      setPending(pend.pending);
      setStatus(st);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not reach the backend",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const refreshNow = async () => {
    setRefreshing(true);
    try {
      await api("/refresh", { method: "POST" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      await load();
      setRefreshing(false);
    }
  };

  const singles = matches.filter((m) => !m.player1.name.includes("/"));
  const calculable = singles.filter(
    (m) => m.player1.remainder != null && m.player2.remainder != null,
  );
  const predicted = matches.filter(
    (m) => m.prediction && m.prediction.strength !== "NO_PREDICTION",
  );
  const completed = matches.filter((m) => m.status === "COMPLETED");
  const live = matches.filter((m) => m.status === "IN_PROGRESS");
  const today = matches.filter((m) => m.dayOffset === 0 && !m.timeTbd);
  const later = matches.length - today.length;
  const running = status?.running || refreshing;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
            Tennis Predictions
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Live, upcoming &amp; completed matches · venue-local time + ET ·
            first-name Abjad remainders · same-day evidence
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-xs text-slate-500">
            <div className="flex items-center justify-end gap-1.5">
              <span
                className={clsx(
                  "h-2 w-2 rounded-full",
                  running
                    ? "animate-pulse bg-amber-400"
                    : status?.lastRun?.error
                      ? "bg-rose-500"
                      : "bg-emerald-500",
                )}
              />
              {running
                ? "Refreshing…"
                : `Last refresh ${ago(status?.lastRun?.finishedAt)}`}
            </div>
            <div>Every {status?.intervalMinutes ?? 15} min</div>
          </div>
          <button
            onClick={refreshNow}
            disabled={running}
            className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-violet-900/40 hover:bg-violet-500 disabled:opacity-50"
          >
            <RefreshCw className={clsx("h-4 w-4", running && "animate-spin")} />
            Refresh now
          </button>
        </div>
      </header>

      {(error || status?.lastRun?.error) && (
        <div className="mb-6 flex items-start gap-2 rounded-lg bg-rose-500/10 px-4 py-3 text-sm text-rose-200 ring-1 ring-rose-500/30">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error ?? `Last refresh failed: ${status?.lastRun?.error}`}
        </div>
      )}

      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          icon={CalendarDays}
          label="Matches today"
          value={today.length}
          hint={`${live.length} live · ${completed.length} completed · ${later} later/TBD`}
        />
        <Stat
          icon={Languages}
          label="Both names known"
          value={calculable.length}
          hint={`of ${singles.length} singles`}
        />
        <Stat
          icon={Target}
          label="Predictions"
          value={predicted.length}
          hint="with a pick"
        />
        <Stat
          icon={Languages}
          label="Names to review"
          value={pending.length}
          hint={`${missing.filter((m) => !m.pending).length} missing`}
        />
      </div>

      <nav className="mb-6 flex gap-6 border-b border-slate-800">
        {(["matches", "meanings", "names", "places"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              "-mb-px border-b-2 pb-3 text-sm font-medium capitalize transition",
              tab === t
                ? "border-violet-500 text-white"
                : "border-transparent text-slate-500 hover:text-slate-300",
            )}
          >
            {TAB_LABELS[t]}
            {t === "places" && pendingPlaces.length > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500/15 px-1.5 text-[10px] text-amber-300">
                {pendingPlaces.length}
              </span>
            )}
            {t === "meanings" && pendingMeanings.length > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500/15 px-1.5 text-[10px] text-amber-300">
                {pendingMeanings.length}
              </span>
            )}
          </button>
        ))}
      </nav>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : tab === "matches" ? (
        <MatchesView matches={matches} />
      ) : tab === "meanings" ? (
        <MeaningsView
          matches={matches}
          missing={missingMeanings}
          ignoredCompound={meaningCompound}
          pending={pendingMeanings}
          onChange={load}
        />
      ) : tab === "places" ? (
        <PlacesView
          missing={missingPlaces}
          pending={pendingPlaces}
          onChange={load}
        />
      ) : (
        <NamesView
          missing={missing}
          ignoredCompound={ignoredCompound}
          pending={pending}
          onChange={load}
        />
      )}
    </main>
  );
}
