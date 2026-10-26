"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowRight, Lock, Search, Trophy, X } from "lucide-react";
import clsx from "clsx";
import type {
  EnvironmentBase,
  MatchRow,
  Method,
  Side,
  Strength,
} from "@/lib/api";
import { dayLabel, easternTime, localTime, splitScore } from "@/lib/time";
import { BaseBreakdown, PickModal } from "./PickExplanation";

const STRENGTH_STYLE: Record<Strength, string> = {
  STRONG: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  MODERATE: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  WEAK: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  NO_PREDICTION: "bg-slate-500/15 text-slate-300 ring-slate-500/30",
};

type Section = "live" | "upcoming" | "completed";

const SECTION_LABEL: Record<Section, string> = {
  live: "Live",
  upcoming: "Upcoming",
  completed: "Completed",
};

const AWAIT_AFTER_START_MS = 3 * 3600_000;
const LIVE_STALE_MS = 5 * 60_000;

/**
 * Finished but the results feed has not published it yet: either it started
 * hours ago and never showed up live, or it dropped out of the live feed.
 */
const awaitingResult = (m: MatchRow) =>
  (m.status === "SCHEDULED" &&
    !m.timeTbd &&
    Date.parse(m.scheduledTime) < Date.now() - AWAIT_AFTER_START_MS) ||
  (m.status === "IN_PROGRESS" &&
    m.liveUpdatedAt != null &&
    Date.parse(m.liveUpdatedAt) < Date.now() - LIVE_STALE_MS);

const sectionOf = (m: MatchRow): Section | null =>
  m.status === "COMPLETED" || awaitingResult(m)
    ? "completed"
    : m.status === "IN_PROGRESS"
      ? "live"
      : m.status === "SCHEDULED"
        ? "upcoming"
        : null;

const isDoubles = (m: MatchRow) => m.player1.name.includes("/");

const SECTIONS: Section[] = ["live", "upcoming", "completed"];

const tournamentKey = (m: MatchRow) => `${m.tournament} · ${m.country}`;

const emptyCounts = (): Record<Section, number> => ({
  live: 0,
  upcoming: 0,
  completed: 0,
});

/** Two tiny buttons on a tournament card: jump to the same tournament in the other sections */
function JumpButtons({
  current,
  counts,
  onJump,
}: {
  current: Section;
  counts: Record<Section, number>;
  onJump: (s: Section) => void;
}) {
  return (
    <div className="flex shrink-0 gap-1.5">
      {SECTIONS.filter((s) => s !== current).map((s) => (
        <button
          key={s}
          disabled={!counts[s]}
          onClick={() => onJump(s)}
          title={
            counts[s]
              ? `Show ${SECTION_LABEL[s].toLowerCase()} matches of this tournament`
              : `No ${SECTION_LABEL[s].toLowerCase()} matches`
          }
          className={clsx(
            "flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium normal-case tracking-normal ring-1 transition",
            counts[s]
              ? s === "live"
                ? "text-rose-200 ring-rose-500/40 hover:bg-rose-500/15"
                : "text-slate-200 ring-slate-600 hover:bg-slate-700"
              : "cursor-default text-slate-600 ring-slate-800",
          )}
        >
          {s === "live" && counts.live > 0 && (
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
          )}
          {SECTION_LABEL[s]} {counts[s]}
          {counts[s] > 0 && <ArrowRight className="h-3 w-3" />}
        </button>
      ))}
    </div>
  );
}

/** The match as seen by one calculation method (pronunciation or meaning) */
const forMethod = (m: MatchRow, method: Method): MatchRow =>
  method === "MEANING" ? { ...m, ...m.meaning } : m;

/** Local time at the venue, plus US Eastern Time */
function TimeCell({ m }: { m: MatchRow }) {
  if (awaitingResult(m)) {
    const local = localTime(m.scheduledTime, m.timeZone);
    return (
      <div className="leading-tight">
        <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-300">
          Awaiting result
        </div>
        <div className="text-xs text-slate-400">
          {local.time} {local.zone} · {local.date}
        </div>
        <div className="text-[11px] text-sky-300/80">
          {easternTime(m.scheduledTime).time} ET
        </div>
      </div>
    );
  }
  if (m.status === "IN_PROGRESS") {
    return (
      <div>
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-rose-400">
          <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
          Live
        </div>
        <div className="mt-0.5 text-[11px] text-slate-500">
          started {localTime(m.scheduledTime, m.timeZone).time} local
        </div>
      </div>
    );
  }
  if (m.timeTbd && m.status === "COMPLETED") {
    return (
      <div className="leading-tight">
        <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
          Final
        </div>
        <div className="text-[11px] text-slate-500">
          {localTime(m.scheduledTime, m.timeZone).date} · local
        </div>
      </div>
    );
  }
  if (m.timeTbd) {
    return (
      <div>
        <div className="text-sm font-medium text-slate-300">Time TBD</div>
        <div className="text-[11px] text-slate-500">Order of play not out</div>
      </div>
    );
  }
  const local = localTime(m.scheduledTime, m.timeZone);
  const et = easternTime(m.scheduledTime);
  return (
    <div className="leading-tight">
      {m.status === "COMPLETED" && (
        <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
          Final
        </div>
      )}
      <div className="text-sm font-medium text-slate-100">
        {local.time}
        <span className="ml-1 text-[11px] font-normal text-slate-500">
          {local.zone}
        </span>
      </div>
      <div className="text-[11px] text-slate-500">{local.date} · local</div>
      <div className="mt-1 text-xs text-sky-300/90">
        {et.time} ET
        {et.date !== local.date && (
          <span className="text-sky-300/60"> · {et.date}</span>
        )}
      </div>
    </div>
  );
}

function ScoreBoxes({
  games,
  points,
  bold,
}: {
  games: string[];
  points?: string;
  bold: boolean;
}) {
  if (!games.length && !points) return null;
  return (
    <div className="flex shrink-0 items-center gap-1">
      {games.map((g, i) => (
        <span
          key={i}
          className={clsx(
            "w-7 text-center text-sm tabular-nums",
            bold ? "font-semibold text-white" : "text-slate-400",
          )}
        >
          {g}
        </span>
      ))}
      {points && (
        <span className="ml-1 w-8 rounded bg-rose-500/15 text-center text-xs font-semibold tabular-nums text-rose-200">
          {points}
        </span>
      )}
    </div>
  );
}

function PlayerCell({
  side,
  isWinner,
  isPicked,
  missingLabel,
  games,
  points,
}: {
  side: Side;
  isWinner: boolean;
  isPicked: boolean;
  missingLabel: string;
  games: string[];
  points?: string;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 py-1">
      <div className="min-w-0">
        <div
          className={clsx(
            "truncate text-sm",
            isWinner ? "font-semibold text-white" : "text-slate-200",
          )}
        >
          {isWinner && (
            <Trophy className="mr-1 inline h-3.5 w-3.5 text-amber-300" />
          )}
          {side.name}
          {isPicked && (
            <span className="ml-2 rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-violet-200">
              Pick
            </span>
          )}
        </div>
        {side.arabicMeaning ? (
          <div className="text-xs text-slate-400">
            <span dir="rtl" className="font-arabic text-sm text-slate-200">
              {side.arabicMeaning}
            </span>
            <span className="mx-1.5 text-slate-600">·</span>
            {side.abjadValue}
          </div>
        ) : (
          <div className="text-xs text-rose-300/70">{missingLabel}</div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <ScoreBoxes games={games} points={points} bold={isWinner} />
        <div
          className={clsx(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold",
            side.remainder == null
              ? "bg-slate-800 text-slate-600"
              : "bg-violet-500/20 text-violet-100",
          )}
          title="Remainder"
        >
          {side.remainder ?? "–"}
        </div>
      </div>
    </div>
  );
}

export function MatchesView({
  matches: allMatches,
  method = "PRONUNCIATION",
}: {
  matches: MatchRow[];
  method?: Method;
}) {
  const [section, setSection] = useState<Section | null>(null);
  const [onlyCalculable, setOnlyCalculable] = useState(false);
  const [query, setQuery] = useState("");
  const [hideDoubles, setHideDoubles] = useState(true);
  const [tournament, setTournament] = useState<string | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [scrollTo, setScrollTo] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [selected, setSelected] = useState<MatchRow | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  /** Topmost visible match row (and its tournament) with its offset from the viewport top */
  const anchorRef = useRef<{
    mid: string | null;
    tkey: string | null;
    top: number;
  } | null>(null);
  const lastDataRef = useRef(allMatches);

  const captureAnchor = useCallback(() => {
    const rows = containerRef.current?.querySelectorAll<HTMLElement>("[data-mid]");
    anchorRef.current = null;
    for (const el of rows ?? []) {
      const r = el.getBoundingClientRect();
      if (r.bottom <= 0) continue;
      anchorRef.current = {
        mid: el.dataset.mid ?? null,
        tkey: el.closest<HTMLElement>("[data-tkey]")?.dataset.tkey ?? null,
        top: r.top,
      };
      return;
    }
  }, []);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(captureAnchor);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [captureAnchor]);
  const isMeaning = method === "MEANING";
  const missingLabel = isMeaning
    ? "No approved name meaning"
    : "No approved Arabic name";

  const matches = useMemo(
    () => allMatches.map((m) => forMethod(m, method)),
    [allMatches, method],
  );

  /** Every tournament with its per-section counts (respects doubles / names filters) */
  const tournaments = useMemo(() => {
    const map = new Map<string, Record<Section, number>>();
    for (const m of matches) {
      if (hideDoubles && isDoubles(m)) continue;
      if (
        onlyCalculable &&
        (m.player1.remainder == null || m.player2.remainder == null)
      )
        continue;
      const s = sectionOf(m);
      if (!s) continue;
      const counts = map.get(tournamentKey(m)) ?? emptyCounts();
      counts[s]++;
      map.set(tournamentKey(m), counts);
    }
    return map;
  }, [matches, hideDoubles, onlyCalculable]);

  // Tournament / league suggestions while typing (e.g. "ithaca", "W35", "JPN")
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return [...tournaments.entries()]
      .filter(([key]) => key.toLowerCase().includes(q))
      .sort(
        ([a], [b]) =>
          Number(!a.toLowerCase().startsWith(q)) -
            Number(!b.toLowerCase().startsWith(q)) || a.localeCompare(b),
      )
      .slice(0, 8);
  }, [query, tournaments]);

  const pickTournament = (key: string) => {
    setTournament(key);
    setQuery("");
    setSuggestOpen(false);
    const c = tournaments.get(key);
    // Land on the section that has matches, preferring the one already open
    if (c && !c[active]) setSection(SECTIONS.find((s) => c[s] > 0) ?? active);
  };

  const jump = (target: Section, key: string) => {
    setSection(target);
    setScrollTo(key);
  };

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!searchRef.current?.contains(e.target as Node)) setSuggestOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return matches.filter((m) => {
      if (tournament && tournamentKey(m) !== tournament) return false;
      if (hideDoubles && isDoubles(m)) return false;
      if (
        onlyCalculable &&
        (m.player1.remainder == null || m.player2.remainder == null)
      )
        return false;
      if (!q) return true;
      return [m.tournament, m.player1.name, m.player2.name].some((s) =>
        s.toLowerCase().includes(q),
      );
    });
  }, [matches, query, hideDoubles, onlyCalculable, tournament]);

  const counts = useMemo(() => {
    const c: Record<Section, number> = { live: 0, upcoming: 0, completed: 0 };
    for (const m of filtered) {
      const s = sectionOf(m);
      if (s) c[s]++;
    }
    return c;
  }, [filtered]);

  // Default to Live when anything is in play, otherwise Upcoming
  const active: Section = section ?? (counts.live > 0 ? "live" : "upcoming");

  /** [day heading, [tournament, rows][]][] — days only matter for upcoming */
  const groups = useMemo(() => {
    const rows = filtered
      .filter((m) => sectionOf(m) === active)
      .sort((a, b) =>
        active === "completed"
          ? b.scheduledTime.localeCompare(a.scheduledTime)
          : Number(a.timeTbd) - Number(b.timeTbd) ||
            a.scheduledTime.localeCompare(b.scheduledTime),
      );
    const days = new Map<string, Map<string, MatchRow[]>>();
    for (const m of rows) {
      const day =
        active !== "upcoming"
          ? ""
          : m.timeTbd
            ? "Time TBD"
            : dayLabel(m.dayOffset, m.localDate);
      const tournaments = days.get(day) ?? new Map<string, MatchRow[]>();
      const key = `${m.tournament} · ${m.country}`;
      tournaments.set(key, [...(tournaments.get(key) ?? []), m]);
      days.set(day, tournaments);
    }
    return [...days.entries()].map(
      ([day, t]) => [day, [...t.entries()]] as const,
    );
  }, [filtered, active]);

  // When new data arrives (30s poll), keep the row you were reading at the same
  // spot on screen even if matches were added or moved above it
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const dataChanged = lastDataRef.current !== allMatches;
    lastDataRef.current = allMatches;
    const root = containerRef.current;
    if (dataChanged && anchor && root && window.scrollY > 0) {
      const el =
        (anchor.mid &&
          root.querySelector<HTMLElement>(
            `[data-mid="${CSS.escape(anchor.mid)}"]`,
          )) ||
        (anchor.tkey &&
          root.querySelector<HTMLElement>(
            `[data-tkey="${CSS.escape(anchor.tkey)}"]`,
          )) ||
        null;
      if (el) {
        const delta = el.getBoundingClientRect().top - anchor.top;
        if (Math.abs(delta) > 1) window.scrollBy(0, delta);
      }
    }
    captureAnchor();
  }, [groups, allMatches, captureAnchor]);

  // After a jump, scroll to the first card of that tournament and highlight it briefly
  useEffect(() => {
    if (!scrollTo) return;
    const el = document.querySelector<HTMLElement>(
      `[data-tkey="${CSS.escape(scrollTo)}"]`,
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setFlash(scrollTo);
      setTimeout(() => setFlash(null), 1600);
    }
    setScrollTo(null);
  }, [scrollTo, groups]);

  return (
    <div
      ref={containerRef}
      className="space-y-5"
      style={{ overflowAnchor: "none" }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg bg-slate-900 p-1 ring-1 ring-slate-800">
          {(["live", "upcoming", "completed"] as Section[]).map((s) => (
            <button
              key={s}
              onClick={() => setSection(s)}
              className={clsx(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition",
                active === s
                  ? "bg-slate-700 text-white"
                  : "text-slate-400 hover:text-slate-200",
              )}
            >
              {s === "live" && (
                <span
                  className={clsx(
                    "h-2 w-2 rounded-full",
                    counts.live ? "animate-pulse bg-rose-500" : "bg-slate-600",
                  )}
                />
              )}
              {SECTION_LABEL[s]}
              <span className="text-xs text-slate-500">{counts[s]}</span>
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-400">
          <input
            type="checkbox"
            checked={onlyCalculable}
            onChange={(e) => setOnlyCalculable(e.target.checked)}
            className="accent-violet-500"
          />
          Both names known
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-400">
          <input
            type="checkbox"
            checked={hideDoubles}
            onChange={(e) => setHideDoubles(e.target.checked)}
            className="accent-violet-500"
          />
          Hide doubles
        </label>
        <div ref={searchRef} className="relative ml-auto">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSuggestOpen(true);
            }}
            onFocus={() => setSuggestOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && suggestions.length) {
                e.preventDefault();
                pickTournament(suggestions[0][0]);
              } else if (e.key === "Escape") setSuggestOpen(false);
            }}
            placeholder="Search league, city, country or player"
            className="w-72 rounded-lg bg-slate-900 py-2 pl-9 pr-3 text-sm text-slate-200 ring-1 ring-slate-800 placeholder:text-slate-500 focus:outline-none focus:ring-violet-500"
          />
          {suggestOpen && suggestions.length > 0 && (
            <div className="absolute right-0 z-30 mt-1 w-[26rem] overflow-hidden rounded-lg bg-slate-900 shadow-xl ring-1 ring-slate-700">
              <div className="px-3 pt-2 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Leagues / tournaments
              </div>
              {suggestions.map(([key, c]) => (
                <button
                  key={key}
                  onClick={() => pickTournament(key)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-800"
                >
                  <span className="truncate text-sm text-slate-100">{key}</span>
                  <span className="flex shrink-0 gap-2 text-[11px]">
                    {c.live > 0 && (
                      <span className="text-rose-300">● {c.live} live</span>
                    )}
                    <span className="text-slate-400">{c.upcoming} upcoming</span>
                    <span className="text-slate-500">{c.completed} done</span>
                  </span>
                </button>
              ))}
              <div className="border-t border-slate-800 px-3 py-1.5 text-[11px] text-slate-500">
                Enter picks the first league · keep typing to filter by player
              </div>
            </div>
          )}
        </div>
      </div>

      {tournament && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-500">League:</span>
          <span className="flex items-center gap-1.5 rounded-full bg-violet-500/15 px-3 py-1 text-violet-100 ring-1 ring-violet-500/30">
            {tournament}
            <button
              onClick={() => setTournament(null)}
              title="Show all leagues"
              className="rounded-full p-0.5 hover:bg-violet-500/30"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
          <span className="text-xs text-slate-500">
            Switch tabs to see its live, upcoming and completed matches
          </span>
        </div>
      )}

      {groups.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-800 p-10 text-center text-slate-500">
          {active === "live"
            ? "No matches in play right now."
            : "No matches for this filter."}
        </div>
      )}

      {groups.map(([day, cards]) => (
        <div key={day || "all"} className="space-y-4">
          {day && (
            <h2 className="pt-2 text-sm font-semibold text-slate-300">
              {day}
              <span className="ml-2 text-xs font-normal text-slate-500">
                {cards.reduce((n, [, r]) => n + r.length, 0)} matches
                {day !== "Time TBD" && " · date at the venue"}
              </span>
            </h2>
          )}
          {cards.map(([key, rows]) => (
            <section
              key={key}
              data-tkey={key}
              className={clsx(
                "scroll-mt-4 overflow-hidden rounded-xl bg-slate-900/60 ring-1 transition-shadow duration-500",
                flash === key
                  ? "shadow-lg shadow-violet-900/50 ring-violet-500"
                  : "ring-slate-800",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-2.5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <button
                    onClick={() => pickTournament(key)}
                    title="Show only this league"
                    className="uppercase hover:text-violet-200"
                  >
                    {key}
                  </button>{" "}
                  <span className="text-slate-600">({rows.length})</span>
                  <span className="ml-2 font-normal normal-case tracking-normal text-slate-600">
                    {rows[0].timeZone.replace(/_/g, " ")}
                  </span>
                </h3>
                <JumpButtons
                  current={active}
                  counts={tournaments.get(key) ?? emptyCounts()}
                  onJump={(s) => jump(s, key)}
                />
              </div>
              {active !== "completed" && (
                <div className="border-b border-slate-800 bg-slate-950/40 px-4 py-2">
                  {rows[0].environment ? (
                    <BaseBreakdown
                      env={rows[0].environment}
                      label={isMeaning ? "meaning" : "name"}
                    />
                  ) : (
                    <span className="text-xs text-rose-300/80">
                      No base yet: needs approved Arabic name for{" "}
                      {rows[0].missingPlaces.join(" and ")}
                    </span>
                  )}
                </div>
              )}
              <div className="divide-y divide-slate-800/70">
                {rows.map((m) => {
                  const p = m.prediction;
                  const [g1, g2] = splitScore(m.score);
                  const [pt1, pt2] = (m.points ?? "").split("-");
                  const live =
                    m.status === "IN_PROGRESS" && !awaitingResult(m);
                  return (
                    <div
                      key={m.id}
                      data-mid={m.id}
                      onClick={() => setSelected(m)}
                      title="Why this pick"
                      className="grid cursor-pointer grid-cols-1 gap-3 px-4 py-3 transition hover:bg-slate-800/40 md:grid-cols-[150px_1fr_240px] md:items-center"
                    >
                      <TimeCell m={m} />
                      <div className="min-w-0">
                        <PlayerCell
                          side={m.player1}
                          isWinner={m.winner === m.player1.name}
                          isPicked={p?.predictedWinner === m.player1.name}
                          missingLabel={missingLabel}
                          games={g1}
                          points={live && m.points ? pt1 : undefined}
                        />
                        <PlayerCell
                          side={m.player2}
                          isWinner={m.winner === m.player2.name}
                          isPicked={p?.predictedWinner === m.player2.name}
                          missingLabel={missingLabel}
                          games={g2}
                          points={live && m.points ? pt2 : undefined}
                        />
                      </div>
                      <div className="text-sm">
                        {p ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span
                                className={clsx(
                                  "rounded-md px-2 py-0.5 text-xs font-medium ring-1",
                                  STRENGTH_STYLE[p.strength],
                                )}
                              >
                                {p.strength.replace("_", " ")}
                              </span>
                              {p.frozen && (
                                <span className="flex items-center gap-1 text-xs text-slate-500">
                                  <Lock className="h-3 w-3" /> frozen
                                </span>
                              )}
                              <span className="text-xs text-slate-500">
                                {p.evidenceCount} evidence
                              </span>
                            </div>
                            {p.reason && (
                              <p className="text-xs leading-snug text-slate-400">
                                {p.reason}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-600">
                            {m.status !== "SCHEDULED"
                              ? "No prediction stored"
                              : isDoubles(m)
                                ? "Doubles: ignored"
                                : m.timeTbd
                                  ? "Predicted once the time is published"
                                  : m.dayOffset > 0
                                    ? "Predicted on match day (same-day evidence)"
                                    : m.missingPlaces.length
                                      ? "Waiting for place names"
                                      : isMeaning
                                        ? "Waiting for name meanings"
                                        : "Waiting for Arabic names"}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ))}
      {selected && (
        <PickModal
          m={selected}
          method={method}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
