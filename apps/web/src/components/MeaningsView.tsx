"use client";

import { useState } from "react";
import clsx from "clsx";
import type { MatchRow, MissingName, PendingName } from "@/lib/api";
import { MatchesView } from "@/components/MatchesView";
import { NamesView } from "@/components/NamesView";

type Sub = "matches" | "dictionary";

const hasPick = (p: MatchRow["prediction"]) =>
  Boolean(p && p.strength !== "NO_PREDICTION" && p.predictedWinner);

/**
 * Separate calculation from the Arabic MEANING of first names:
 * same base, same remainder rule and same-day trend, different name values.
 */
export function MeaningsView({
  matches,
  missing,
  ignoredCompound,
  pending,
  onChange,
}: {
  matches: MatchRow[];
  missing: MissingName[];
  ignoredCompound: string[];
  pending: PendingName[];
  onChange: () => Promise<void>;
}) {
  const [sub, setSub] = useState<Sub>("matches");

  const singles = matches.filter((m) => !m.player1.name.includes("/"));
  const calculable = singles.filter(
    (m) => m.meaning.player1.remainder != null && m.meaning.player2.remainder != null,
  );
  const picks = matches.filter((m) => hasPick(m.meaning.prediction));
  const both = picks.filter((m) => hasPick(m.prediction));
  const agree = both.filter(
    (m) => m.prediction!.predictedWinner === m.meaning.prediction!.predictedWinner,
  );

  const stats: [string, string | number, string][] = [
    ["Both meanings known", calculable.length, `of ${singles.length} singles`],
    ["Meaning picks", picks.length, "with a pick"],
    [
      "Agrees with pronunciation",
      both.length ? `${agree.length}/${both.length}` : "—",
      "where both methods pick",
    ],
    ["Meanings to review", pending.length, `${missing.filter((m) => !m.pending).length} missing`],
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map(([label, value, hint]) => (
          <div key={label} className="rounded-xl bg-slate-900/60 p-3 ring-1 ring-slate-800">
            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              {label}
            </div>
            <div className="mt-1 text-xl font-semibold text-white">{value}</div>
            <div className="text-xs text-slate-500">{hint}</div>
          </div>
        ))}
      </div>

      <div className="flex w-fit rounded-lg bg-slate-900 p-1 ring-1 ring-slate-800">
        {(
          [
            ["matches", "Meaning calculation"],
            ["dictionary", "Meaning dictionary"],
          ] as [Sub, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setSub(id)}
            className={clsx(
              "rounded-md px-3 py-1.5 text-sm transition",
              sub === id ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200",
            )}
          >
            {label}
            {id === "dictionary" && pending.length > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500/15 px-1.5 text-[10px] text-amber-300">
                {pending.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {sub === "matches" ? (
        <MatchesView matches={matches} method="MEANING" />
      ) : (
        <NamesView
          endpoint="/meanings"
          missing={missing}
          ignoredCompound={ignoredCompound}
          pending={pending}
          onChange={onChange}
          labels={{
            pendingTitle: "Meanings pending approval",
            missingTitle: "First names without a meaning",
            arabicPlaceholder: "معنى الاسم بالعربية",
            emptyArabic: "no meaning yet",
            glossPlaceholder: "English meaning (optional)",
          }}
        />
      )}
    </div>
  );
}
