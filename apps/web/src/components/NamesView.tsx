"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Pencil, Plus, Sparkles, X } from "lucide-react";
import clsx from "clsx";
import { api, type MissingName, type PendingName } from "@/lib/api";

export interface NamesViewLabels {
  pendingTitle: string;
  missingTitle: string;
  arabicPlaceholder: string;
  emptyArabic: string;
  /** Placeholder for the optional English note saved with a manual entry */
  glossPlaceholder: string;
}

const DEFAULT_LABELS: NamesViewLabels = {
  pendingTitle: "Pending approval",
  missingTitle: "Missing first names today",
  arabicPlaceholder: "الاسم بالعربية",
  emptyArabic: "no Arabic yet",
  glossPlaceholder: "Note (optional)",
};

interface SearchResult {
  firstName: string;
  arabicMeaning: string;
  abjadValue: number | null;
  meaning: string | null;
  note: string | null;
  source: string | null;
  status: "APPROVED" | "PENDING" | "MISSING";
  players: string[];
}

const STATUS_CHIP: Record<SearchResult["status"], string> = {
  APPROVED: "bg-emerald-500/15 text-emerald-300",
  PENDING: "bg-amber-500/15 text-amber-300",
  MISSING: "bg-rose-500/15 text-rose-300",
};

const STATUS_TEXT: Record<SearchResult["status"], string> = {
  APPROVED: "approved",
  PENDING: "pending",
  MISSING: "not added",
};

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/**
 * Type a first name: matching saved entries (approved / pending) and today's
 * names without one appear as you type. Pick one to edit it, or add a new one.
 * Saving always stores the entry as approved (manual).
 */
function NameLookupForm({
  endpoint,
  labels,
  onSaved,
}: {
  endpoint: string;
  labels: NamesViewLabels;
  onSaved: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [arabic, setArabic] = useState("");
  const [gloss, setGloss] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const q = normalize(name);
  const existing = results.find((r) => r.firstName === q);

  useEffect(() => {
    if (!q) {
      setResults([]);
      return;
    }
    let stale = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await api<{ results: SearchResult[] }>(
          `${endpoint}/search?q=${encodeURIComponent(q)}`,
        );
        if (!stale) {
          setResults(r.results);
          setHighlight(0);
        }
      } catch {
        if (!stale) setResults([]);
      } finally {
        if (!stale) setSearching(false);
      }
    }, 200);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [q, endpoint]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pick = (r: SearchResult) => {
    setName(r.firstName);
    setArabic(r.arabicMeaning);
    setGloss(r.meaning ?? "");
    setOpen(false);
    setError(null);
  };

  const reset = () => {
    setName("");
    setArabic("");
    setGloss("");
    setResults([]);
    setError(null);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(endpoint, {
        method: "PUT",
        body: JSON.stringify({
          name: name.trim(),
          arabicMeaning: arabic.trim(),
          ...(gloss.trim() ? { meaning: gloss.trim() } : {}),
        }),
      });
      setSavedMsg(`Saved “${q}”`);
      reset();
      await onSaved(q);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={boxRef} className="space-y-2">
      <div className="relative">
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setOpen(true);
            setSavedMsg(null);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!open || !results.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              pick(results[highlight]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="Start typing a first name…"
          className="w-full rounded-md bg-slate-950 px-3 py-2 text-sm text-slate-200 ring-1 ring-slate-700 focus:outline-none focus:ring-violet-500"
        />
        {searching && (
          <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-slate-500" />
        )}
        {open && q && !searching && (
          <div className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-lg bg-slate-900 shadow-xl ring-1 ring-slate-700">
            {results.map((r, i) => (
              <button
                key={r.firstName}
                type="button"
                onMouseEnter={() => setHighlight(i)}
                onClick={() => pick(r)}
                className={clsx(
                  "flex w-full items-start justify-between gap-3 px-3 py-2 text-left",
                  i === highlight ? "bg-slate-800" : "hover:bg-slate-800/60",
                )}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium capitalize text-slate-100">
                    {r.firstName}
                    <span
                      className={clsx(
                        "ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                        STATUS_CHIP[r.status],
                      )}
                    >
                      {STATUS_TEXT[r.status]}
                    </span>
                  </div>
                  {r.meaning && (
                    <div className="truncate text-xs text-slate-400">{r.meaning}</div>
                  )}
                  {r.players.length > 0 && (
                    <div className="truncate text-xs text-slate-500">
                      {r.players.slice(0, 3).join(", ")}
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  {r.arabicMeaning ? (
                    <>
                      <div dir="rtl" className="font-arabic text-sm text-slate-200">
                        {r.arabicMeaning}
                      </div>
                      <div className="text-[11px] text-slate-500">{r.abjadValue}</div>
                    </>
                  ) : (
                    <span className="text-xs text-slate-500">{labels.emptyArabic}</span>
                  )}
                </div>
              </button>
            ))}
            {!existing && (
              <div className="border-t border-slate-800 px-3 py-2 text-xs text-slate-400">
                <Plus className="mr-1 inline h-3.5 w-3.5" />
                “{q}” is new — fill in the Arabic below to add it
              </div>
            )}
          </div>
        )}
      </div>

      {q && (
        <div className="text-xs">
          {existing ? (
            <span className="text-slate-400">
              Editing <span className="font-medium capitalize text-slate-200">{q}</span>
              <span
                className={clsx(
                  "ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
                  STATUS_CHIP[existing.status],
                )}
              >
                {STATUS_TEXT[existing.status]}
              </span>
              {existing.status !== "MISSING" && " · saving overwrites it and marks it approved"}
            </span>
          ) : (
            !searching && (
              <span className="text-slate-400">
                Adding new name <span className="font-medium capitalize text-slate-200">{q}</span>
              </span>
            )
          )}
        </div>
      )}

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          value={arabic}
          onChange={(e) => setArabic(e.target.value)}
          dir="rtl"
          placeholder={labels.arabicPlaceholder}
          className="w-56 flex-1 rounded-md bg-slate-950 px-2.5 py-1.5 font-arabic text-sm text-slate-200 ring-1 ring-slate-700 focus:outline-none focus:ring-violet-500"
        />
        <input
          value={gloss}
          onChange={(e) => setGloss(e.target.value)}
          placeholder={labels.glossPlaceholder}
          className="w-48 flex-1 rounded-md bg-slate-950 px-2.5 py-1.5 text-sm text-slate-200 ring-1 ring-slate-700 focus:outline-none focus:ring-violet-500"
        />
        <button
          disabled={busy || !q || !arabic.trim()}
          className="flex items-center gap-1 rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          {existing && existing.status !== "MISSING" ? "Update" : "Add"}
        </button>
        {(name || arabic || gloss) && (
          <button type="button" onClick={reset} className="text-sm text-slate-400 hover:text-slate-200">
            Clear
          </button>
        )}
      </form>
      {error && <p className="text-xs text-rose-300">{error}</p>}
      {savedMsg && <p className="text-xs text-emerald-300">{savedMsg}</p>}
    </div>
  );
}

function NameForm({
  initialName = "",
  initialArabic = "",
  lockName = false,
  submitLabel,
  arabicPlaceholder,
  onSubmit,
  onCancel,
}: {
  initialName?: string;
  initialArabic?: string;
  lockName?: boolean;
  submitLabel: string;
  arabicPlaceholder: string;
  onSubmit: (name: string, arabic: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [arabic, setArabic] = useState(initialArabic);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await onSubmit(name.trim(), arabic.trim());
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed");
        } finally {
          setBusy(false);
        }
      }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={lockName}
        placeholder="First name"
        className="w-36 rounded-md bg-slate-950 px-2.5 py-1.5 text-sm text-slate-200 ring-1 ring-slate-700 focus:outline-none focus:ring-violet-500 disabled:opacity-60"
      />
      <input
        value={arabic}
        onChange={(e) => setArabic(e.target.value)}
        dir="rtl"
        placeholder={arabicPlaceholder}
        className="w-56 rounded-md bg-slate-950 px-2.5 py-1.5 font-arabic text-sm text-slate-200 ring-1 ring-slate-700 focus:outline-none focus:ring-violet-500"
      />
      <button
        disabled={busy || !name || !arabic}
        className="flex items-center gap-1 rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-40"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Check className="h-3.5 w-3.5" />
        )}
        {submitLabel}
      </button>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-slate-400 hover:text-slate-200"
        >
          Cancel
        </button>
      )}
      {error && <span className="w-full text-xs text-rose-300">{error}</span>}
    </form>
  );
}

export function NamesView({
  missing,
  ignoredCompound,
  pending,
  onChange,
  endpoint = "/names",
  labels = DEFAULT_LABELS,
}: {
  missing: MissingName[];
  ignoredCompound: string[];
  pending: PendingName[];
  onChange: () => Promise<void>;
  /** API base: "/names" (pronunciation) or "/meanings" */
  endpoint?: string;
  labels?: NamesViewLabels;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const save = async (name: string, arabicMeaning: string) => {
    await api(endpoint, {
      method: "PUT",
      body: JSON.stringify({ name, arabicMeaning }),
    });
    setEditing(null);
    await onChange();
  };

  const approve = async (key: string, arabicMeaning?: string) => {
    await api(`${endpoint}/${encodeURIComponent(key)}/approve`, {
      method: "POST",
      body: JSON.stringify(arabicMeaning ? { arabicMeaning } : {}),
    });
    setEditing(null);
    await onChange();
  };

  const reject = async (key: string) => {
    await api(`${endpoint}/${encodeURIComponent(key)}`, { method: "DELETE" });
    await onChange();
  };

  const suggest = async () => {
    setSuggesting(true);
    setNotice(null);
    try {
      const result = await api<Record<string, unknown>>(`${endpoint}/suggest`, {
        method: "POST",
      });
      setNotice(`AI suggestions: ${JSON.stringify(result)}`);
      await onChange();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Suggestion failed");
    } finally {
      setSuggesting(false);
    }
  };

  const unhandled = missing.filter((m) => !m.pending);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-xl bg-slate-900/60 ring-1 ring-slate-800">
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div>
            <h3 className="font-semibold text-slate-100">
              {labels.pendingTitle}
            </h3>
            <p className="text-xs text-slate-500">
              AI suggestions are not used until you approve them
            </p>
          </div>
          <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-300">
            {pending.length}
          </span>
        </header>
        <div className="divide-y divide-slate-800/70">
          {pending.length === 0 && (
            <p className="p-6 text-center text-sm text-slate-500">
              Nothing waiting for review.
            </p>
          )}
          {pending.map((p) => (
            <div key={p.playerName} className="space-y-2 px-4 py-3">
              {editing === `pending:${p.playerName}` ? (
                <NameForm
                  initialName={p.playerName}
                  initialArabic={p.arabicMeaning}
                  lockName
                  submitLabel="Approve"
                  arabicPlaceholder={labels.arabicPlaceholder}
                  onSubmit={(_, arabic) => approve(p.playerName, arabic)}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium capitalize text-slate-100">
                      {p.playerName}
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-500">
                        {p.source}
                      </span>
                    </div>
                    <div className="text-sm">
                      {p.arabicMeaning ? (
                        <span
                          dir="rtl"
                          className="font-arabic text-base text-slate-200"
                        >
                          {p.arabicMeaning}
                        </span>
                      ) : (
                        <span className="text-slate-500">
                          {labels.emptyArabic}
                        </span>
                      )}
                      {p.abjadValue != null && (
                        <span className="ml-2 text-xs text-slate-500">
                          {p.abjadValue}
                        </span>
                      )}
                    </div>
                    {p.meaning && (
                      <div className="text-xs text-slate-400">{p.meaning}</div>
                    )}
                    {p.note && (
                      <div className="mt-1 text-xs text-amber-300/80">
                        {p.note}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      title="Approve"
                      disabled={!p.arabicMeaning}
                      onClick={() => approve(p.playerName)}
                      className="rounded-md p-1.5 text-emerald-300 hover:bg-emerald-500/15 disabled:opacity-30"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      title="Correct and approve"
                      onClick={() => setEditing(`pending:${p.playerName}`)}
                      className="rounded-md p-1.5 text-sky-300 hover:bg-sky-500/15"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      title="Reject"
                      onClick={() => reject(p.playerName)}
                      className="rounded-md p-1.5 text-rose-300 hover:bg-rose-500/15"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl bg-slate-900/60 ring-1 ring-slate-800">
        <header className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <div>
            <h3 className="font-semibold text-slate-100">
              {labels.missingTitle}
            </h3>
            <p className="text-xs text-slate-500">
              {unhandled.length} without an Arabic name ·{" "}
              {ignoredCompound.length} ignored (compound / doubles)
            </p>
          </div>
          <button
            onClick={suggest}
            disabled={suggesting}
            className="flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-sm text-slate-200 ring-1 ring-slate-700 hover:bg-slate-700 disabled:opacity-50"
          >
            {suggesting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 text-violet-300" />
            )}
            Ask AI
          </button>
        </header>
        {notice && (
          <p className="border-b border-slate-800 px-4 py-2 text-xs text-slate-400">
            {notice}
          </p>
        )}
        <div className="border-b border-slate-800 px-4 py-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
            <Plus className="h-3.5 w-3.5" /> Add or edit any first name
          </div>
          <NameLookupForm
            endpoint={endpoint}
            labels={labels}
            onSaved={async () => {
              setEditing(null);
              await onChange();
            }}
          />
        </div>
        <div className="max-h-[560px] divide-y divide-slate-800/70 overflow-y-auto">
          {unhandled.map((m) => (
            <div key={m.firstName} className="px-4 py-2.5">
              {editing === `missing:${m.firstName}` ? (
                <NameForm
                  initialName={m.firstName}
                  lockName
                  submitLabel="Save"
                  arabicPlaceholder={labels.arabicPlaceholder}
                  onSubmit={(_, arabic) => save(m.firstName, arabic)}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <button
                  onClick={() => setEditing(`missing:${m.firstName}`)}
                  className="group flex w-full items-center justify-between text-left"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium capitalize text-slate-200">
                      {m.firstName}
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      {m.players.join(", ")}
                    </div>
                  </div>
                  <Pencil
                    className={clsx(
                      "h-3.5 w-3.5 text-slate-600 group-hover:text-violet-300",
                    )}
                  />
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
