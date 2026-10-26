'use client'

import { useState } from 'react'
import { Check, Loader2, Pencil, Sparkles, X } from 'lucide-react'
import { api, type MissingPlace, type PendingPlace, type PlaceKind } from '@/lib/api'

function ArabicInput({
  initial = '',
  onSubmit,
  onCancel,
  label,
}: {
  initial?: string
  onSubmit: (arabic: string) => Promise<void>
  onCancel?: () => void
  label: string
}) {
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setError(null)
        try {
          await onSubmit(value.trim())
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed')
        } finally {
          setBusy(false)
        }
      }}
    >
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        dir="rtl"
        placeholder="الاسم بالعربية"
        className="w-48 rounded-md bg-slate-950 px-2.5 py-1.5 font-arabic text-sm text-slate-200 ring-1 ring-slate-700 focus:outline-none focus:ring-violet-500"
      />
      <button
        disabled={busy || !value.trim()}
        className="flex items-center gap-1 rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-40"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        {label}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} className="text-sm text-slate-400 hover:text-slate-200">
          Cancel
        </button>
      )}
      {error && <span className="w-full text-xs text-rose-300">{error}</span>}
    </form>
  )
}

const kindLabel = (k: PlaceKind) => (k === 'COUNTRY' ? 'Country' : 'City')

export function PlacesView({
  missing,
  pending,
  onChange,
}: {
  missing: MissingPlace[]
  pending: PendingPlace[]
  onChange: () => Promise<void>
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [suggesting, setSuggesting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const unhandled = missing.filter((m) => !m.pending)

  const suggest = async () => {
    setSuggesting(true)
    setNotice(null)
    try {
      const r = await api<{
        requested: number
        suggested: number
        uncertain: { kind: PlaceKind; name: string; note: string | null }[]
      }>('/places/suggest', { method: 'POST' })
      const unsure = r.uncertain.map((u) => `${u.name}${u.note ? ` (${u.note})` : ''}`).join(', ')
      setNotice(
        `AI suggested ${r.suggested} of ${r.requested} — review them in "Suggested place names".` +
          (unsure ? ` Not sure about: ${unsure}` : ''),
      )
      await onChange()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Suggestion failed')
    } finally {
      setSuggesting(false)
    }
  }

  const approve = async (p: PendingPlace, arabicName?: string) => {
    await api(`/places/${p.kind}/${encodeURIComponent(p.key)}/approve`, {
      method: 'POST',
      body: JSON.stringify(arabicName ? { arabicName } : {}),
    })
    setEditing(null)
    await onChange()
  }

  const reject = async (p: PendingPlace) => {
    await api(`/places/${p.kind}/${encodeURIComponent(p.key)}`, { method: 'DELETE' })
    await onChange()
  }

  const save = async (m: MissingPlace, arabicName: string) => {
    await api('/places', { method: 'PUT', body: JSON.stringify({ kind: m.kind, name: m.name, arabicName }) })
    setEditing(null)
    await onChange()
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-xl bg-slate-900/60 ring-1 ring-slate-800">
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div>
            <h3 className="font-semibold text-slate-100">Suggested place names</h3>
            <p className="text-xs text-slate-500">Check the Arabic spelling; only approved names are used in the base</p>
          </div>
          <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-300">
            {pending.length}
          </span>
        </header>
        <div className="max-h-[620px] divide-y divide-slate-800/70 overflow-y-auto">
          {pending.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Nothing waiting for review.</p>}
          {pending.map((p) => {
            const id = `pending:${p.kind}:${p.key}`
            return (
              <div key={id} className="px-4 py-2.5">
                {editing === id ? (
                  <ArabicInput
                    initial={p.arabicName}
                    label="Approve"
                    onSubmit={(a) => approve(p, a)}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm text-slate-100">
                        {p.name}
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-500">{kindLabel(p.kind)}</span>
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-600">{p.source}</span>
                      </div>
                      <div className="text-sm">
                        <span dir="rtl" className="font-arabic text-base text-slate-200">{p.arabicName}</span>
                        <span className="ml-2 text-xs text-slate-500">{p.abjadValue}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button title="Approve" onClick={() => approve(p)} className="rounded-md p-1.5 text-emerald-300 hover:bg-emerald-500/15">
                        <Check className="h-4 w-4" />
                      </button>
                      <button title="Correct and approve" onClick={() => setEditing(id)} className="rounded-md p-1.5 text-sky-300 hover:bg-sky-500/15">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button title="Reject" onClick={() => reject(p)} className="rounded-md p-1.5 text-rose-300 hover:bg-rose-500/15">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <section className="rounded-xl bg-slate-900/60 ring-1 ring-slate-800">
        <header className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <div>
            <h3 className="font-semibold text-slate-100">Missing in today&apos;s matches</h3>
            <p className="text-xs text-slate-500">Countries and cities with no Arabic name yet</p>
          </div>
          <button
            onClick={suggest}
            disabled={suggesting || unhandled.length === 0}
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
        {notice && <p className="border-b border-slate-800 px-4 py-2 text-xs text-slate-400">{notice}</p>}
        <div className="max-h-[620px] divide-y divide-slate-800/70 overflow-y-auto">
          {unhandled.length === 0 && <p className="p-6 text-center text-sm text-slate-500">All places covered.</p>}
          {unhandled.map((m) => {
            const id = `missing:${m.kind}:${m.key}`
            return (
              <div key={id} className="px-4 py-2.5">
                <div className="mb-1 text-sm text-slate-200">
                  {m.name}
                  <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-500">{kindLabel(m.kind)}</span>
                </div>
                {editing === id ? (
                  <ArabicInput label="Save" onSubmit={(a) => save(m, a)} onCancel={() => setEditing(null)} />
                ) : (
                  <button onClick={() => setEditing(id)} className="text-xs text-violet-300 hover:text-violet-200">
                    Add Arabic name
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
