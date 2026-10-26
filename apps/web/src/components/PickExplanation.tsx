"use client";

import { useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  Loader2,
  Lock,
  RefreshCw,
  Trophy,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import type { PickReview, ReviewVariant } from "@/lib/api";
import clsx from "clsx";
import type {
  EnvironmentBase,
  EvidenceItem,
  MatchRow,
  Method,
  Strength,
} from "@/lib/api";
import { localTime } from "@/lib/time";

const STRENGTH_STYLE: Record<Strength, string> = {
  STRONG: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  MODERATE: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  WEAK: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  NO_PREDICTION: "bg-slate-500/15 text-slate-300 ring-slate-500/30",
};

function BaseBreakdown({ env, label }: { env: EnvironmentBase; label: string }) {
  const parts: [string, number][] = [
    [env.countryArabic, env.country],
    [env.cityArabic, env.city],
    [env.dayArabic, env.day],
    [env.monthArabic, env.month],
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-400">
      <span className="font-medium text-slate-300">
        Base {env.total.toLocaleString()}
      </span>
      <span className="text-slate-600">=</span>
      <span>{env.constant}</span>
      {parts.map(([label, value], i) => (
        <span key={i} className="flex items-center gap-1">
          <span className="text-slate-600">+</span>
          <span dir="rtl" className="font-arabic text-sm text-slate-200">
            {label}
          </span>
          <span>{value}</span>
        </span>
      ))}
      <span className="text-slate-600">+</span>
      <span>{env.year} هـ</span>
      <span className="ml-2 text-slate-600">
        · remainder = ({label} + base) mod 9
      </span>
    </div>
  );
}

export { BaseBreakdown };

type Outcome = "BIGGER" | "SMALLER";

/** Mirrors shared/trend.ts analyzeTrend over the stored evidence (oldest first) */
function replayTrend(evidence: EvidenceItem[]) {
  const SWITCH = 3;
  let direction: Outcome | null = null;
  let switches = 0;
  let segmentStart = 0;
  let opposite: EvidenceItem[] = [];
  let pendingOpposite = 0;

  evidence.forEach((item, i) => {
    if (direction === null) {
      direction = item.outcome;
      return;
    }
    if (item.outcome === direction) {
      opposite = [];
      pendingOpposite = 0;
      return;
    }
    opposite.push(item);
    pendingOpposite = opposite.length;
    if (opposite.length >= SWITCH) {
      direction = item.outcome;
      switches++;
      segmentStart = i - opposite.length + 1;
      opposite = [];
      pendingOpposite = 0;
    }
  });

  const segment = evidence.slice(segmentStart);
  const total = segment.reduce((s, e) => s + e.weight, 0);
  const agreeing = segment
    .filter((e) => e.outcome === direction)
    .reduce((s, e) => s + e.weight, 0);
  return {
    direction,
    switches,
    pendingOpposite,
    segmentStart,
    support: total === 0 ? 0 : (agreeing / total) * 100,
  };
}

const PATTERN_RULES: { title: string; detail: string }[] = [
  {
    title: "Remainder",
    detail:
      "(Abjad value of the Arabic first name + environmental base) mod 9, with 0 counted as 9. Base = 4064 + country + city + local weekday + Hijri month + Hijri year, all in Arabic Abjad values.",
  },
  {
    title: "Pattern match",
    detail:
      "The remainder pair is compared orientation-free as {bigger, smaller}. EXACT_PAIR = same bigger & smaller values (weight 1.0). STRUCTURAL = same odd/even parity on both sides (weight 0.6).",
  },
  {
    title: "Evidence window",
    detail:
      "Only completed matches from the same country on the same tournament-local day, finished before this match starts. With ≥3 matches in the same tournament, only that tournament counts.",
  },
  {
    title: "Similarity weight",
    detail:
      "Each evidence match's weight is multiplied by a similarity score: same city, same weekday, same Hijri month, and how close in time it finished.",
  },
  {
    title: "Trend rule",
    detail:
      "Reading today's outcomes in order, the first result sets the trend (bigger-remainder side wins, or smaller side). Three consecutive opposite results switch the trend.",
  },
  {
    title: "Support threshold",
    detail:
      "Support = weighted share of the current trend segment that agrees with the trend. A pick requires support above 50%.",
  },
  {
    title: "The pick",
    detail:
      "The player on the side the trend favors (bigger or smaller remainder) is the pick. Strength is derived from the agreeing evidence weights.",
  },
  {
    title: "No pick when",
    detail:
      "A name or place lacks an approved Arabic value, both remainders are equal, there is no matching evidence yet, or the trend is contested.",
  },
];

function OutcomeStrip({
  evidence,
  segmentStart,
}: {
  evidence: EvidenceItem[];
  segmentStart: number;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {evidence.map((e, i) => (
        <span
          key={e.matchId + i}
          title={`${e.winner} won · ${e.outcome} side · weight ${e.weight.toFixed(2)}`}
          className={clsx(
            "h-2.5 w-5 rounded-sm",
            i < segmentStart && "opacity-30",
            e.outcome === "BIGGER" ? "bg-violet-400" : "bg-teal-400",
          )}
        />
      ))}
    </div>
  );
}

function VariantRow({
  v,
  method,
}: {
  v: ReviewVariant;
  method: Method;
}) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | string>(
    "idle",
  );
  const apply = async () => {
    setState("saving");
    try {
      await api(method === "MEANING" ? "/meanings" : "/names", {
        method: "PUT",
        body: JSON.stringify({ name: v.firstName, arabicMeaning: v.arabic }),
      });
      setState("saved");
    } catch (e) {
      setState(e instanceof Error ? e.message : "Failed");
    }
  };
  const pair = v.remainderPair;
  return (
    <div
      className={clsx(
        "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-2 py-1.5 text-xs ring-1",
        v.wouldWin
          ? "bg-emerald-500/10 ring-emerald-500/30"
          : "bg-slate-950/40 ring-slate-800",
      )}
    >
      <span dir="rtl" className="font-arabic text-sm text-slate-400 line-through">
        {v.current}
      </span>
      <span className="text-slate-600">→</span>
      <span dir="rtl" className="font-arabic text-sm text-slate-100">
        {v.arabic}
      </span>
      <span className="text-slate-500">Abjad {v.abjadValue}</span>
      {v.best && (
        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-200">
          AI best
        </span>
      )}
      <span className="text-slate-400">
        {v.sameRemainder || !pair
          ? "same remainder"
          : `remainders ${pair.player1Remainder}–${pair.player2Remainder}`}
      </span>
      <span
        className={clsx(
          "ml-auto",
          v.wouldWin ? "font-semibold text-emerald-300" : "text-slate-500",
        )}
      >
        {v.wouldWin
          ? `would pick ${v.predictedWinner} ✓`
          : v.predictedWinner
            ? `still picks ${v.predictedWinner}`
            : "no pick"}
      </span>
      {state === "saved" ? (
        <span className="flex items-center gap-1 text-emerald-300">
          <Check className="h-3 w-3" /> saved
        </span>
      ) : (
        <button
          onClick={apply}
          disabled={state === "saving"}
          title={`Save as the ${method === "MEANING" ? "meaning" : "Arabic spelling"} of "${v.firstName}" for future predictions`}
          className="rounded px-1.5 py-0.5 text-[11px] text-violet-200 ring-1 ring-violet-500/40 hover:bg-violet-500/15"
        >
          {state === "saving" ? "…" : "Use this"}
        </button>
      )}
      {v.note && <div className="w-full text-[11px] text-slate-500">{v.note}</div>}
      {state !== "idle" && state !== "saving" && state !== "saved" && (
        <div className="w-full text-[11px] text-rose-300">{state}</div>
      )}
    </div>
  );
}

function ReviewSection({
  m,
  method,
  initial,
}: {
  m: MatchRow;
  method: Method;
  initial: PickReview | null;
}) {
  const [review, setReview] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ reviews: PickReview[] }>(
        `/reviews/${encodeURIComponent(m.id)}`,
        { method: "POST" },
      );
      const mine = r.reviews.find((x) => x.method === method) ?? null;
      setReview(mine);
      if (!mine) setError("No failed pick found for this method");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Re-check failed");
    } finally {
      setLoading(false);
    }
  };

  const label = method === "MEANING" ? "meaning" : "spelling";
  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-rose-300">
          Failed pick: re-check with other name {label}s
        </h3>
        <button
          onClick={run}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-slate-200 ring-1 ring-slate-600 hover:bg-slate-800"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {review ? "Re-run" : "Re-check now"}
        </button>
      </div>
      {error && <p className="text-xs text-rose-300">{error}</p>}
      {!review && !loading && !error && (
        <p className="text-xs text-slate-500">
          Not re-checked yet. The AI suggests other Arabic {label}s for both
          first names (using each player&apos;s nationality) and the formula is
          re-run with each one.
        </p>
      )}
      {review && (
        <div className="space-y-3 rounded-lg bg-slate-950/60 p-3 ring-1 ring-slate-800">
          <p className="text-xs text-slate-300">
            {review.flipped ? (
              <span className="font-semibold text-emerald-300">
                {review.variants.filter((v) => v.wouldWin).length} of{" "}
                {review.variants.length} variants would have picked{" "}
                {review.winnerName}.
              </span>
            ) : (
              <span className="text-slate-300">
                No variant would have picked {review.winnerName}. The name{" "}
                {label}s are probably not why this pick failed.
              </span>
            )}{" "}
            {review.original.baseline.predictedWinner !== review.pickedName && (
              <span className="text-amber-300">
                Note: re-running with today&apos;s data and no name change
                already gives{" "}
                {review.original.baseline.predictedWinner ?? "no pick"} (more
                same-day results are known now).
              </span>
            )}
          </p>
          {(["player1", "player2"] as const).map((side) => {
            const c = review.original.current[side];
            const vs = review.variants.filter((v) => v.side === side);
            const name = side === "player1" ? review.player1 : review.player2;
            return (
              <div key={side} className="space-y-1">
                <div className="text-xs text-slate-400">
                  <span className="font-medium text-slate-200">{name}</span>
                  {c.country && <span> · {c.country}</span>}
                  {c.arabic && (
                    <>
                      {" "}
                      · current{" "}
                      <span dir="rtl" className="font-arabic text-slate-200">
                        {c.arabic}
                      </span>
                    </>
                  )}
                  {c.best && c.best === c.arabic && (
                    <span className="ml-1 text-amber-200">
                      (AI agrees it is the best form)
                    </span>
                  )}
                </div>
                {vs.length ? (
                  vs.map((v, i) => <VariantRow key={i} v={v} method={method} />)
                ) : (
                  <div className="text-[11px] text-slate-600">
                    No alternative {label}s
                  </div>
                )}
              </div>
            );
          })}
          <p className="text-[11px] leading-snug text-slate-500">
            Hindsight check: with several variants, one may flip the pick by
            chance alone. It is most meaningful when the AI-best form flips it.
            &quot;Use this&quot; saves the variant for all future predictions.
          </p>
        </div>
      )}
    </div>
  );
}

export function PickModal({
  m,
  method,
  onClose,
}: {
  m: MatchRow;
  method: Method;
  onClose: () => void;
}) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const p = m.prediction;

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const evidence = p?.evidence ?? [];
  const trend = replayTrend(evidence);
  const biggerName =
    p?.remainderPair == null
      ? null
      : p.remainderPair.player1Remainder > p.remainderPair.player2Remainder
        ? m.player1.name
        : p.remainderPair.player2Remainder > p.remainderPair.player1Remainder
          ? m.player2.name
          : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-slate-900 p-5 shadow-2xl ring-1 ring-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-white">
              {m.player1.name} <span className="text-slate-500">vs</span>{" "}
              {m.player2.name}
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              {m.tournament} · {m.country} ·{" "}
              {method === "MEANING" ? "Meaning method" : "Pronunciation method"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* The pick */}
        <div className="mt-4 rounded-lg bg-slate-950/60 p-3 ring-1 ring-slate-800">
          {p ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {p.predictedWinner ? (
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-white">
                    <Trophy className="h-4 w-4 text-amber-300" />
                    Pick: {p.predictedWinner}
                  </span>
                ) : (
                  <span className="text-sm font-medium text-slate-300">
                    No pick
                  </span>
                )}
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
                    <Lock className="h-3 w-3" /> frozen at match start
                  </span>
                )}
              </div>
              {p.reason && (
                <p className="text-xs leading-snug text-slate-400">{p.reason}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              No prediction stored for this match yet.
            </p>
          )}
        </div>

        {/* The numbers */}
        {p?.remainderPair && (
          <div className="mt-4 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              The numbers
            </h3>
            {m.environment && (
              <BaseBreakdown
                env={m.environment}
                label={method === "MEANING" ? "meaning" : "name"}
              />
            )}
            <div className="grid grid-cols-2 gap-2">
              {[
                { side: m.player1, r: p.remainderPair.player1Remainder },
                { side: m.player2, r: p.remainderPair.player2Remainder },
              ].map(({ side, r }, i) => {
                const other = i === 0 ? p.remainderPair!.player2Remainder : p.remainderPair!.player1Remainder;
                const role =
                  r > other ? "bigger" : r < other ? "smaller" : "equal";
                return (
                  <div
                    key={i}
                    className="rounded-lg bg-slate-950/60 px-3 py-2 ring-1 ring-slate-800"
                  >
                    <div className="truncate text-sm font-medium text-slate-200">
                      {side.name}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-400">
                      <span dir="rtl" className="font-arabic text-slate-200">
                        {side.arabicMeaning ?? "?"}
                      </span>{" "}
                      · Abjad {side.abjadValue ?? "?"}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs">
                      <span className="text-slate-500">remainder</span>
                      <span className="text-base font-semibold text-violet-200">
                        {r}
                      </span>
                      <span
                        className={clsx(
                          "rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide",
                          role === "bigger" && "bg-violet-500/20 text-violet-200",
                          role === "smaller" && "bg-teal-500/20 text-teal-200",
                          role === "equal" && "bg-slate-700/40 text-slate-300",
                        )}
                      >
                        {role} · {r % 2 ? "odd" : "even"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Today's trend */}
        {evidence.length > 0 && (
          <div className="mt-4 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Same-day trend
            </h3>
            <div className="rounded-lg bg-slate-950/60 px-3 py-2 ring-1 ring-slate-800">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-300">
                <span>
                  Trend:{" "}
                  <span className="font-semibold text-white">
                    {trend.direction === "BIGGER"
                      ? "bigger remainder wins"
                      : trend.direction === "SMALLER"
                        ? "smaller remainder wins"
                        : "none"}
                  </span>
                </span>
                <span className="text-slate-500">
                  support {trend.support.toFixed(0)}%
                </span>
                <span className="text-slate-500">
                  {trend.switches} switch{trend.switches === 1 ? "" : "es"}
                </span>
                {trend.pendingOpposite > 0 && (
                  <span className="text-amber-300">
                    {trend.pendingOpposite}/3 against
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <OutcomeStrip
                  evidence={evidence}
                  segmentStart={trend.segmentStart}
                />
                <span className="text-[10px] text-slate-500">
                  <span className="text-violet-300">■</span> bigger won{" "}
                  <span className="ml-1 text-teal-300">■</span> smaller won ·
                  faded = before current trend
                </span>
              </div>
              {biggerName && trend.direction && (
                <p className="mt-2 text-xs text-slate-400">
                  {trend.direction === "BIGGER" ? "Bigger" : "Smaller"} side in
                  this match is{" "}
                  <span className="font-medium text-slate-200">
                    {trend.direction === "BIGGER"
                      ? biggerName
                      : biggerName === m.player1.name
                        ? m.player2.name
                        : m.player1.name}
                  </span>{" "}
                  — that is the pick.
                </p>
              )}
            </div>

            <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
              {evidence.map((e, i) => (
                <div
                  key={e.matchId + i}
                  className={clsx(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ring-1",
                    i < trend.segmentStart
                      ? "opacity-50 ring-slate-800/60"
                      : "bg-slate-950/40 ring-slate-800",
                  )}
                >
                  <span
                    className={clsx(
                      "w-14 shrink-0 rounded px-1 py-0.5 text-center text-[10px] font-semibold uppercase",
                      e.outcome === "BIGGER"
                        ? "bg-violet-500/20 text-violet-200"
                        : "bg-teal-500/20 text-teal-200",
                    )}
                  >
                    {e.outcome}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-slate-200">
                    {e.winner}
                    <span className="text-slate-500"> won</span>
                  </span>
                  <span className="shrink-0 text-slate-500">
                    {localTime(e.scheduledTime, m.timeZone).time}
                  </span>
                  <span
                    className={clsx(
                      "shrink-0 rounded px-1 py-0.5 text-[10px]",
                      e.matchType === "EXACT_PAIR"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-sky-500/15 text-sky-300",
                    )}
                  >
                    {e.matchType === "EXACT_PAIR" ? "exact" : "structural"}
                  </span>
                  <span className="shrink-0 text-slate-500">
                    ×{e.weight.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {p?.predictedWinner &&
          m.winner &&
          p.predictedWinner !== m.winner && (
            <ReviewSection
              m={m}
              method={method}
              initial={p.review ?? null}
            />
          )}

        {/* Patterns list */}
        <div className="mt-4 rounded-lg ring-1 ring-slate-800">
          <button
            onClick={() => setRulesOpen(!rulesOpen)}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200"
          >
            How picks work — the patterns we use
            <ChevronDown
              className={clsx(
                "h-4 w-4 transition-transform",
                rulesOpen && "rotate-180",
              )}
            />
          </button>
          {rulesOpen && (
            <ol className="space-y-2 border-t border-slate-800 px-3 py-3">
              {PATTERN_RULES.map((r, i) => (
                <li key={i} className="flex gap-2 text-xs">
                  <span className="shrink-0 font-semibold text-violet-300">
                    {i + 1}.
                  </span>
                  <span>
                    <span className="font-medium text-slate-200">
                      {r.title}:
                    </span>{" "}
                    <span className="text-slate-400">{r.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
