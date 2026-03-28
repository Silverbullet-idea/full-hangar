"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { avionicsChipGroups, panelTypeOptions } from "../../../lib/dealCoach/avionicsOptions"
import { engineManufacturers, engineModelMap } from "../../../lib/dealCoach/engineModelMap"
import { coachMakes, modelMap } from "../../../lib/dealCoach/modelMap"
import { lookupTBO } from "../../../lib/dealCoach/tboReference"
import type { AircraftProfile } from "../types"
import type { StepProps } from "./types"

type SubView = "prepop" | "change" | "manual"
type ManualStep = 1 | 2 | 3 | 4 | 5

type FaaPrefillPayload = {
  registration: string
  serialNumber?: string
  year?: number
  make?: string
  model?: string
  engineMake?: string
  engineModel?: string
  engineCount?: number
  location?: string
}

type NLookupState = "idle" | "loading" | "found" | "not_found" | "error"

function faaPrefillToProfile(faa: FaaPrefillPayload): AircraftProfile {
  return {
    source: "manual",
    registration: faa.registration,
    serialNumber: faa.serialNumber,
    year: faa.year,
    make: faa.make,
    model: faa.model,
    engineMake: faa.engineMake,
    engineModel: faa.engineModel,
    engineCount: faa.engineCount ?? 1,
    location: faa.location,
    flipScore: null,
    dealTier: null,
    valueScore: null,
  }
}

const barlow = { fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" } as const

function fmtMoney(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
}

function EngineLifeNudge({ smoh }: { smoh: number }) {
  const pct = smoh / 2000
  if (pct < 0.4) {
    return (
      <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200 [data-theme=light]:text-emerald-900">
        Healthy engine — SMOH is well under a typical 2,000 hr TBO reference.
      </div>
    )
  }
  if (pct <= 0.8) {
    return (
      <div className="rounded-lg border border-slate-500/40 bg-slate-500/10 p-3 text-sm text-[var(--fh-text)]">
        Mid-life — plan reserves and compare to your target hold period.
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-100 [data-theme=light]:text-amber-950">
      High time vs. 2,000 hr reference — verify TBO for your exact engine model and budget overhaul risk.
    </div>
  )
}

function AskingHint({ price }: { price: number }) {
  let msg = ""
  if (price < 20000) msg = "Below $20K — likely high hours or project aircraft"
  else if (price < 40000) msg = "Typical for high-time trainers"
  else if (price < 65000) msg = "Most common flip target segment"
  else if (price < 100000) msg = "Well-equipped or low-time examples"
  else msg = "Complex aircraft or turboprop category"
  return <p className="mt-1 text-xs text-[var(--fh-text-dim)]">{msg}</p>
}

export default function StepAircraftId({ answers, onUpdate, onNext }: StepProps) {
  const ac = answers.aircraft
  const [sub, setSub] = useState<SubView>(() =>
    ac?.source === "listing" && ac.listingId ? "prepop" : "change"
  )
  const [manualStep, setManualStep] = useState<ManualStep>(1)
  const [showSummary, setShowSummary] = useState(false)

  const [q, setQ] = useState("")
  const [results, setResults] = useState<Record<string, unknown>[]>([])
  const [picked, setPicked] = useState<Record<string, unknown> | null>(null)

  const [nInput, setNInput] = useState("")
  const [nLookupState, setNLookupState] = useState<NLookupState>("idle")
  const [faaProfileFromLookup, setFaaProfileFromLookup] = useState<AircraftProfile | null>(null)

  const [draft, setDraft] = useState<Partial<AircraftProfile>>(() => ({
    source: "manual",
    year: ac?.year,
    make: ac?.make,
    model: ac?.model,
    registration: ac?.registration,
    serialNumber: ac?.serialNumber,
    ttaf: ac?.ttaf,
    condition: ac?.condition,
    smoh: ac?.smoh,
    snew: ac?.snew,
    stoh: ac?.stoh,
    spoh: ac?.spoh,
    lastAnnual: ac?.lastAnnual,
    annualStatus: ac?.annualStatus,
    engineMake: ac?.engineMake,
    engineModel: ac?.engineModel,
    engineCount: ac?.engineCount ?? 1,
    overhaulType: ac?.overhaulType,
    propMake: ac?.propMake,
    propType: ac?.propType,
    panelType: ac?.panelType,
    avionicsSelected: ac?.avionicsSelected ?? [],
    damageHistory: ac?.damageHistory,
    damageDetail: ac?.damageDetail,
    squawks: ac?.squawks,
    paintCondition: ac?.paintCondition,
    interiorCondition: ac?.interiorCondition,
    askingPrice: ac?.askingPrice,
    location: ac?.location,
    notes: ac?.notes,
  }))

  const models = useMemo(() => {
    const m = draft.make ?? ""
    return modelMap[m] ?? []
  }, [draft.make])

  const engModels = useMemo(() => {
    const m = draft.engineMake ?? ""
    return engineModelMap[m] ?? []
  }, [draft.engineMake])

  const searchListings = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResults([])
      return
    }
    try {
      const res = await fetch(`/api/listings?q=${encodeURIComponent(query.trim())}&pageSize=8`)
      const json = await res.json()
      setResults(Array.isArray(json.data) ? json.data : [])
    } catch {
      setResults([])
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => searchListings(q), 220)
    return () => clearTimeout(t)
  }, [q, searchListings])

  const handleNLookup = useCallback(async () => {
    const val = nInput.trim()
    if (val.length < 3) return
    setNLookupState("loading")
    setFaaProfileFromLookup(null)
    try {
      const res = await fetch(`/api/faa-registry/lookup?q=${encodeURIComponent(val)}`)
      const data = (await res.json()) as {
        found?: boolean
        faa?: FaaPrefillPayload | null
        error?: string
      }
      if (!res.ok) {
        setNLookupState("error")
        return
      }
      if (data.found && data.faa && data.faa.registration) {
        setFaaProfileFromLookup(faaPrefillToProfile(data.faa))
        setNLookupState("found")
      } else {
        setNLookupState("not_found")
      }
    } catch {
      setNLookupState("error")
    }
  }, [nInput])

  const switchToManualFromFaaNotFound = useCallback(() => {
    setNLookupState("idle")
    setNInput("")
    setFaaProfileFromLookup(null)
    setSub("manual")
    setManualStep(1)
    setShowSummary(false)
  }, [])

  const applyFaaProfileToDraft = useCallback((p: AircraftProfile) => {
    setDraft((d) => ({
      ...d,
      registration: p.registration,
      serialNumber: p.serialNumber ?? d.serialNumber,
      year: p.year ?? d.year,
      make: p.make ?? d.make,
      model: p.model ?? d.model,
      engineMake: p.engineMake ?? d.engineMake,
      engineModel: p.engineModel ?? d.engineModel,
      engineCount: p.engineCount ?? d.engineCount,
      location: p.location ?? d.location,
    }))
  }, [])

  const chipToggle = (label: string) => {
    const cur = draft.avionicsSelected ?? []
    const next = cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label]
    setDraft((d) => ({ ...d, avionicsSelected: next }))
  }

  const assembleProfile = (): AircraftProfile => ({
    source: "manual",
    year: draft.year,
    make: draft.make,
    model: draft.model,
    registration: draft.registration,
    serialNumber: draft.serialNumber,
    ttaf: draft.ttaf,
    condition: draft.condition,
    smoh: draft.smoh,
    snew: draft.snew,
    stoh: draft.stoh,
    spoh: draft.spoh,
    lastAnnual: draft.lastAnnual,
    annualStatus: draft.annualStatus,
    engineMake: draft.engineMake,
    engineModel: draft.engineModel,
    engineCount: draft.engineCount,
    overhaulType: draft.overhaulType,
    propMake: draft.propMake,
    propType: draft.propType,
    panelType: draft.panelType,
    avionicsSelected: draft.avionicsSelected,
    damageHistory: draft.damageHistory,
    damageDetail: draft.damageDetail,
    squawks: draft.squawks,
    paintCondition: draft.paintCondition,
    interiorCondition: draft.interiorCondition,
    askingPrice: draft.askingPrice,
    location: draft.location,
    notes: draft.notes,
  })

  const profileLabel = (p: AircraftProfile) =>
    [p.year, p.make, p.model].filter(Boolean).join(" ") || "Aircraft"

  const listingCard = (p: AircraftProfile, opts?: { listingHref?: string }) => (
    <div className="rounded-xl border border-[var(--fh-border)] bg-[#161b22] p-4 [data-theme=light]:bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 text-lg font-bold text-[var(--fh-text)] [data-theme=light]:text-slate-900" style={barlow}>
          {profileLabel(p)}
        </h3>
        {opts?.listingHref ? (
          <Link href={opts.listingHref} className="text-xs font-semibold text-[#FF9900] hover:underline">
            View listing
          </Link>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {p.registration ? (
          <span className="rounded-full bg-[#0d1117] px-2 py-0.5 text-xs text-[var(--fh-text)] [data-theme=light]:bg-slate-100">
            {p.registration}
          </span>
        ) : null}
        {p.dealTier ? (
          <span className="rounded-full bg-[#FF9900]/15 px-2 py-0.5 text-xs text-[#FF9900]">Tier {p.dealTier}</span>
        ) : null}
        {typeof p.valueScore === "number" ? (
          <span className="rounded-full bg-slate-700/40 px-2 py-0.5 text-xs">Score {p.valueScore}</span>
        ) : null}
        {typeof p.askingPrice === "number" ? (
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300 [data-theme=light]:text-emerald-800">
            Ask {fmtMoney(p.askingPrice)}
          </span>
        ) : null}
        {typeof p.smoh === "number" ? (
          <span className="rounded-full bg-slate-700/40 px-2 py-0.5 text-xs">SMOH {p.smoh}</span>
        ) : null}
        {p.panelType ? (
          <span className="rounded-full bg-slate-700/40 px-2 py-0.5 text-xs">{p.panelType}</span>
        ) : null}
      </div>
      {typeof p.smoh === "number" ? <div className="mt-3"><EngineLifeNudge smoh={p.smoh} /></div> : null}
    </div>
  )

  if (sub === "prepop" && ac?.source === "listing" && ac.listingId) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        {listingCard(ac, { listingHref: `/listings/${ac.listingId}` })}
        <button
          type="button"
          className="w-full text-left text-sm font-semibold text-[#FF9900] hover:underline"
          onClick={() => setSub("change")}
        >
          Not this aircraft, or aircraft not in our database →
        </button>
        <button
          type="button"
          onClick={() => {
            onUpdate({ aircraft: ac })
            onNext()
          }}
          className="fh-cta-on-orange-fill mt-2 w-full rounded-lg bg-[#FF9900] py-3 text-sm font-extrabold text-black"
          style={barlow}
        >
          Use this aircraft →
        </button>
      </div>
    )
  }

  if (sub === "change") {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <label className="block text-sm font-semibold text-[var(--fh-text)]">Search inventory</label>
        <input
          className="w-full rounded-lg border border-[var(--fh-border)] bg-[#0d1117] px-3 py-2 text-sm text-[var(--fh-text)] [data-theme=light]:bg-white"
          placeholder="N-number, make, model…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="max-h-56 space-y-1 overflow-auto rounded-lg border border-[var(--fh-border)] bg-[#161b22] p-1 [data-theme=light]:bg-slate-50">
          {results.length === 0 && q.trim().length >= 2 ? (
            <button
              type="button"
              className="w-full p-3 text-left text-sm text-[#FF9900] hover:underline"
              onClick={() => {
                setSub("manual")
                setManualStep(1)
                setShowSummary(false)
              }}
            >
              No listing found — build aircraft profile from scratch →
            </button>
          ) : null}
          {results.map((row) => {
            const id = String(row.id ?? "")
            const label = [row.year, row.make, row.model].filter(Boolean).join(" ")
            return (
              <button
                key={id}
                type="button"
                className="w-full rounded-md px-2 py-2 text-left text-sm hover:bg-[#0d1117] [data-theme=light]:hover:bg-slate-200"
                onClick={() => setPicked(row)}
              >
                {label || id}
                {row.n_number ? <span className="ml-2 text-xs text-[var(--fh-text-dim)]">{String(row.n_number)}</span> : null}
              </button>
            )
          })}
        </div>
        {picked ? (
          <div className="space-y-2 rounded-lg border border-[var(--fh-border)] bg-[#161b22] p-3 [data-theme=light]:bg-white">
            <p className="text-sm font-semibold">Selected</p>
            <p className="text-sm text-[var(--fh-text-dim)]">
              {[picked.year, picked.make, picked.model].filter(Boolean).join(" ")}
            </p>
            <button
              type="button"
              className="w-full rounded-lg bg-[#FF9900] py-2 text-sm font-bold text-black"
              onClick={() => {
                const id = String(picked.id ?? "")
                const price =
                  typeof picked.asking_price === "number"
                    ? picked.asking_price
                    : typeof picked.price_asking === "number"
                      ? picked.price_asking
                      : undefined
                const prof: AircraftProfile = {
                  source: "search",
                  listingId: id,
                  year: typeof picked.year === "number" ? picked.year : undefined,
                  make: typeof picked.make === "string" ? picked.make : undefined,
                  model: typeof picked.model === "string" ? picked.model : undefined,
                  registration: typeof picked.n_number === "string" ? picked.n_number : undefined,
                  askingPrice: price,
                  ttaf: typeof picked.total_time_airframe === "number" ? picked.total_time_airframe : undefined,
                  smoh: typeof picked.engine_hours_smoh === "number" ? picked.engine_hours_smoh : undefined,
                  flipScore: typeof picked.flip_score === "number" ? picked.flip_score : null,
                  dealTier: typeof picked.flip_tier === "string" ? picked.flip_tier : typeof picked.deal_tier === "string" ? picked.deal_tier : null,
                  valueScore: typeof picked.value_score === "number" ? picked.value_score : null,
                  panelType:
                    picked.has_glass_cockpit === true
                      ? "Glass panel"
                      : picked.is_steam_gauge === true
                        ? "Steam gauges"
                        : "Hybrid",
                }
                onUpdate({ aircraft: prof })
                onNext()
              }}
            >
              Use this aircraft →
            </button>
          </div>
        ) : null}

        <div className="relative py-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="h-px flex-1 bg-[var(--fh-border)]" />
            <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-[var(--fh-text-dim)]">
              or look up by N-number
            </span>
            <div className="h-px flex-1 bg-[var(--fh-border)]" />
          </div>

          <div className="flex gap-2.5">
            <input
              className="min-w-0 flex-1 rounded-lg border border-[var(--fh-border)] bg-[#0d1117] px-3 py-2 text-base uppercase tracking-wide [data-theme=light]:bg-white"
              style={{ fontFamily: "var(--font-dm-mono), ui-monospace, monospace" }}
              value={nInput}
              maxLength={7}
              placeholder="e.g. N12345"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              onChange={(e) => {
                const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7)
                setNInput(v)
                if (nLookupState !== "idle") {
                  setNLookupState("idle")
                  setFaaProfileFromLookup(null)
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleNLookup()
              }}
            />
            <button
              type="button"
              className="shrink-0 rounded-lg bg-[#FF9900] px-5 py-2 text-sm font-bold text-black disabled:cursor-not-allowed disabled:opacity-40"
              disabled={nInput.trim().length < 3 || nLookupState === "loading"}
              onClick={() => void handleNLookup()}
            >
              {nLookupState === "loading" ? "Looking up…" : "Look up →"}
            </button>
          </div>

          {nLookupState === "idle" ? (
            <p className="mt-2 text-xs text-[var(--fh-text-dim)]">
              Enter your full N-number and press Enter or &quot;Look up →&quot;
            </p>
          ) : null}
          {nLookupState === "loading" ? (
            <div className="mt-3 flex gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 p-3 text-sm text-sky-100 [data-theme=light]:text-sky-950">
              <span aria-hidden>⏳</span>
              <span>Checking FAA registry for {nInput || "…"}…</span>
            </div>
          ) : null}
          {nLookupState === "found" && faaProfileFromLookup ? (
            <>
              <div className="mt-3 flex gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-100 [data-theme=light]:text-emerald-950">
                <span aria-hidden>✅</span>
                <span>
                  <strong>Found in FAA registry.</strong> We&apos;ve pre-filled the summary below. Review and edit anything
                  that needs updating.
                </span>
              </div>
              <div className="mt-3">{listingCard(faaProfileFromLookup)}</div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  className="flex-1 rounded-lg border border-[var(--fh-border)] py-2.5 text-sm font-semibold text-[var(--fh-text)]"
                  onClick={() => {
                    applyFaaProfileToDraft(faaProfileFromLookup)
                    setNLookupState("idle")
                    setNInput("")
                    setFaaProfileFromLookup(null)
                    setSub("manual")
                    setManualStep(1)
                    setShowSummary(false)
                  }}
                >
                  Edit profile
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-lg bg-[#FF9900] py-2.5 text-sm font-bold text-black"
                  style={barlow}
                  onClick={() => {
                    onUpdate({ aircraft: faaProfileFromLookup })
                    onNext()
                  }}
                >
                  Use this aircraft →
                </button>
              </div>
            </>
          ) : null}
          {nLookupState === "not_found" ? (
            <div className="mt-3 flex gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-100 [data-theme=light]:text-amber-950">
              <span aria-hidden>🔍</span>
              <span>
                <strong>{nInput || "That N-number"} not found in the FAA registry.</strong> This could mean the aircraft is
                experimental, recently re-registered, or the N-number has a typo. You can still{" "}
                <button
                  type="button"
                  className="font-semibold text-[#FF9900] underline hover:no-underline"
                  onClick={switchToManualFromFaaNotFound}
                >
                  build the profile manually →
                </button>
              </span>
            </div>
          ) : null}
          {nLookupState === "error" ? (
            <div className="mt-3 flex gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-100 [data-theme=light]:text-red-950">
              <span aria-hidden>⚠️</span>
              <span>Lookup failed — please check your connection and try again.</span>
            </div>
          ) : null}
        </div>

        <div className="border-t border-[var(--fh-border)] pt-4">
          <button
            type="button"
            onClick={() => {
              setSub("manual")
              setManualStep(1)
              setShowSummary(false)
            }}
            className="w-full rounded-[14px] border-2 border-dashed border-[#FF9900]/50 bg-[#161b22] p-4 text-left text-sm font-bold text-[#FF9900] [data-theme=light]:bg-slate-50"
          >
            Build aircraft profile from scratch
          </button>
        </div>
      </div>
    )
  }

  const manualValid1 = draft.year != null && draft.year >= 1940 && draft.year <= 2025 && draft.make && draft.model
  const tbo = draft.engineModel ? lookupTBO(draft.engineModel) : null

  const dots = (
    <div className="mb-4 flex justify-center gap-2">
      {([1, 2, 3, 4, 5] as const).map((s) => (
        <span
          key={s}
          className="h-2 w-2 rounded-full"
          style={{ background: manualStep >= s ? "#FF9900" : "var(--fh-text-dim)" }}
        />
      ))}
    </div>
  )

  if (showSummary) {
    const prof = assembleProfile()
    return (
      <div className="mx-auto max-w-lg space-y-4">
        {dots}
        {listingCard(prof)}
        <div className="flex gap-2">
          <button
            type="button"
            className="flex-1 rounded-lg border border-[var(--fh-border)] py-2 text-sm font-semibold"
            onClick={() => {
              setShowSummary(false)
              setManualStep(1)
            }}
          >
            Edit profile
          </button>
          <button
            type="button"
            className="flex-1 rounded-lg bg-[#FF9900] py-2 text-sm font-bold text-black"
            onClick={() => {
              onUpdate({ aircraft: prof })
              onNext()
            }}
          >
            Use this aircraft →
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      {dots}
      {manualStep === 1 ? (
        <>
          <h3 className="text-base font-bold text-[var(--fh-text)]" style={barlow}>
            Identity
          </h3>
          <p className="text-xs text-[var(--fh-text-dim)]">
            Enter year, make, and model. To look up by N-number first, go back and use{" "}
            <strong>or look up by N-number</strong> on the previous screen.
          </p>

          <label className="mt-3 block text-xs text-[var(--fh-text-dim)]">Year (1940–2025)</label>
          <input
            type="number"
            className="mb-2 w-full rounded-lg border border-[var(--fh-border)] bg-[#0d1117] px-3 py-2 [data-theme=light]:bg-white"
            min={1940}
            max={2025}
            value={draft.year ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, year: Number(e.target.value) || undefined }))}
          />
          <label className="block text-xs text-[var(--fh-text-dim)]">Make</label>
          <select
            className="mb-2 w-full rounded-lg border border-[var(--fh-border)] bg-[#0d1117] px-3 py-2 [data-theme=light]:bg-white"
            value={draft.make ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, make: e.target.value || undefined, model: undefined }))}
          >
            <option value="">Select…</option>
            {coachMakes.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <label className="block text-xs text-[var(--fh-text-dim)]">Model</label>
          <select
            className="mb-2 w-full rounded-lg border border-[var(--fh-border)] bg-[#0d1117] px-3 py-2 [data-theme=light]:bg-white"
            value={draft.model ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value || undefined }))}
            disabled={!draft.make}
          >
            <option value="">Select…</option>
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <label className="block text-xs text-[var(--fh-text-dim)]">N-number / registration (optional)</label>
          <input
            className="mb-2 w-full rounded-lg border border-[var(--fh-border)] bg-[#0d1117] px-3 py-2 [data-theme=light]:bg-white"
            value={draft.registration ?? ""}
            placeholder="e.g. N3902C"
            autoComplete="off"
            onChange={(e) => setDraft((d) => ({ ...d, registration: e.target.value || undefined }))}
          />
          <label className="block text-xs text-[var(--fh-text-dim)]">Serial (optional)</label>
          <input
            className="w-full rounded-lg border border-[var(--fh-border)] bg-[#0d1117] px-3 py-2 [data-theme=light]:bg-white"
            value={draft.serialNumber ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, serialNumber: e.target.value || undefined }))}
          />
          <button
            type="button"
            disabled={!manualValid1}
            className="mt-4 w-full rounded-lg bg-[#FF9900] py-2 text-sm font-bold text-black disabled:opacity-40"
            onClick={() => setManualStep(2)}
          >
            Next
          </button>
        </>
      ) : null}

      {manualStep === 2 ? (
        <>
          <h3 className="text-base font-bold" style={barlow}>
            Airframe & hours
          </h3>
          <p className="text-xs text-[var(--fh-text-dim)]">All fields on this step are optional — fill what you know.</p>
          <label className="text-xs text-[var(--fh-text-dim)]">TTAF</label>
          <input
            type="number"
            className="mb-2 w-full rounded-lg border border-[var(--fh-border)] bg-[#0d1117] px-3 py-2 [data-theme=light]:bg-white"
            value={draft.ttaf ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, ttaf: Number(e.target.value) || undefined }))}
          />
          <label className="text-xs text-[var(--fh-text-dim)]">Condition</label>
          <select
            className="mb-2 w-full rounded-lg border border-[var(--fh-border)] bg-[#0d1117] px-3 py-2 [data-theme=light]:bg-white"
            value={draft.condition ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, condition: e.target.value || undefined }))}
          >
            <option value="">Select…</option>
            <option value="Excellent">Excellent</option>
            <option value="Good">Good</option>
            <option value="Fair">Fair</option>
            <option value="Project">Project</option>
          </select>
          {["SMOH", "SNEW", "STOH", "SPOH"].map((lab) => (
            <div key={lab}>
              <label className="text-xs text-[var(--fh-text-dim)]">{lab}</label>
              <input
                type="number"
                className="mb-2 w-full rounded-lg border border-[var(--fh-border)] bg-[#0d1117] px-3 py-2 [data-theme=light]:bg-white"
                value={(draft as Record<string, number | undefined>)[lab.toLowerCase() as "smoh"] ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [lab.toLowerCase()]: Number(e.target.value) || undefined }))
                }
              />
            </div>
          ))}
          {typeof draft.smoh === "number" ? <EngineLifeNudge smoh={draft.smoh} /> : null}
          <label className="text-xs text-[var(--fh-text-dim)]">Last annual</label>
          <input
            className="mb-2 w-full rounded-lg border border-[var(--fh-border)] bg-[#0d1117] px-3 py-2 [data-theme=light]:bg-white"
            value={draft.lastAnnual ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, lastAnnual: e.target.value || undefined }))}
          />
          <label className="text-xs text-[var(--fh-text-dim)]">Annual status</label>
          <select
            className="mb-2 w-full rounded-lg border border-[var(--fh-border)] bg-[#0d1117] px-3 py-2 [data-theme=light]:bg-white"
            value={draft.annualStatus ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, annualStatus: e.target.value || undefined }))}
          >
            <option value="">Select…</option>
            <option value="Current">Current</option>
            <option value="Due soon">Due soon</option>
            <option value="Overdue">Overdue</option>
            <option value="Unknown">Unknown</option>
          </select>
          <div className="flex gap-2">
            <button type="button" className="flex-1 rounded-lg border py-2 text-sm" onClick={() => setManualStep(1)}>
              Back
            </button>
            <button
              type="button"
              className="flex-1 rounded-lg bg-[#FF9900] py-2 text-sm font-bold text-black"
              onClick={() => setManualStep(3)}
            >
              Next
            </button>
          </div>
        </>
      ) : null}

      {manualStep === 3 ? (
        <>
          <h3 className="text-base font-bold" style={barlow}>
            Engine & prop
          </h3>
          <label className="text-xs text-[var(--fh-text-dim)]">Engine manufacturer</label>
          <select
            className="mb-2 w-full rounded-lg border border-[var(--fh-border)] bg-[#0d1117] px-3 py-2 [data-theme=light]:bg-white"
            value={draft.engineMake ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, engineMake: e.target.value || undefined, engineModel: undefined }))}
          >
            <option value="">Select…</option>
            {engineManufacturers.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <label className="text-xs text-[var(--fh-text-dim)]">Engine model</label>
          <select
            className="mb-2 w-full rounded-lg border border-[var(--fh-border)] bg-[#0d1117] px-3 py-2 [data-theme=light]:bg-white"
            value={draft.engineModel ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, engineModel: e.target.value || undefined }))}
            disabled={!draft.engineMake}
          >
            <option value="">Select…</option>
            {engModels.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <p className="text-xs text-[var(--fh-text-dim)]">Engines</p>
          <div className="mb-2 flex gap-2">
            {([1, 2] as const).map((n) => (
              <button
                key={n}
                type="button"
                className={`rounded-lg border px-3 py-1 text-sm ${draft.engineCount === n ? "border-[#FF9900] bg-[#FF9900]/15" : ""}`}
                onClick={() => setDraft((d) => ({ ...d, engineCount: n }))}
              >
                {n === 1 ? "Single" : "Twin"}
              </button>
            ))}
          </div>
          <label className="text-xs text-[var(--fh-text-dim)]">Overhaul type</label>
          <select
            className="mb-2 w-full rounded-lg border border-[var(--fh-border)] bg-[#0d1117] px-3 py-2 [data-theme=light]:bg-white"
            value={draft.overhaulType ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, overhaulType: e.target.value || undefined }))}
          >
            <option value="">Select…</option>
            <option value="Major">Major overhaul</option>
            <option value="Top">Top overhaul</option>
            <option value="Factory reman">Factory reman</option>
            <option value="Unknown">Unknown</option>
          </select>
          <label className="text-xs text-[var(--fh-text-dim)]">Prop manufacturer</label>
          <input
            className="mb-2 w-full rounded-lg border border-[var(--fh-border)] bg-[#0d1117] px-3 py-2 [data-theme=light]:bg-white"
            value={draft.propMake ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, propMake: e.target.value || undefined }))}
          />
          <label className="text-xs text-[var(--fh-text-dim)]">Prop type</label>
          <select
            className="mb-2 w-full rounded-lg border border-[var(--fh-border)] bg-[#0d1117] px-3 py-2 [data-theme=light]:bg-white"
            value={draft.propType ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, propType: e.target.value || undefined }))}
          >
            <option value="">Select…</option>
            <option value="Fixed pitch">Fixed pitch</option>
            <option value="Constant speed">Constant speed</option>
          </select>
          {tbo ? (
            <div className="rounded-lg border border-sky-500/40 bg-sky-500/10 p-3 text-sm text-sky-100 [data-theme=light]:text-sky-950">
              TBO reference: {draft.engineModel} — {tbo} hours manufacturer TBO.
            </div>
          ) : null}
          <div className="flex gap-2">
            <button type="button" className="flex-1 rounded-lg border py-2 text-sm" onClick={() => setManualStep(2)}>
              Back
            </button>
            <button type="button" className="flex-1 rounded-lg bg-[#FF9900] py-2 text-sm font-bold text-black" onClick={() => setManualStep(4)}>
              Next
            </button>
          </div>
        </>
      ) : null}

      {manualStep === 4 ? (
        <>
          <h3 className="text-base font-bold" style={barlow}>
            Avionics
          </h3>
          <p className="text-xs text-[var(--fh-text-dim)]">Panel type (one)</p>
          <div className="mb-3 flex flex-wrap gap-2">
            {panelTypeOptions.map((p) => (
              <button
                key={p}
                type="button"
                className={`rounded-full border px-3 py-1 text-sm ${draft.panelType === p ? "border-[#FF9900] bg-[#FF9900]/15" : ""}`}
                onClick={() => setDraft((d) => ({ ...d, panelType: p }))}
              >
                {p}
              </button>
            ))}
          </div>
          {avionicsChipGroups.map((g) => (
            <div key={g.groupLabel} className="mb-3">
              <p className="mb-1 text-xs font-semibold text-[var(--fh-text-dim)]">{g.groupLabel}</p>
              <div className="flex flex-wrap gap-2">
                {g.items.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`rounded-full border px-2 py-1 text-xs ${(draft.avionicsSelected ?? []).includes(item) ? "border-[#FF9900] bg-[#FF9900]/15" : ""}`}
                    onClick={() => chipToggle(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="text-xs text-[var(--fh-text-dim)]">
            {(draft.avionicsSelected ?? []).length} items selected
            {(draft.avionicsSelected ?? []).length
              ? `: ${(draft.avionicsSelected ?? []).slice(0, 4).join(", ")}${(draft.avionicsSelected ?? []).length > 4 ? "…" : ""}`
              : ""}
          </p>
          <div className="flex gap-2">
            <button type="button" className="flex-1 rounded-lg border py-2 text-sm" onClick={() => setManualStep(3)}>
              Back
            </button>
            <button type="button" className="flex-1 rounded-lg bg-[#FF9900] py-2 text-sm font-bold text-black" onClick={() => setManualStep(5)}>
              Next
            </button>
          </div>
        </>
      ) : null}

      {manualStep === 5 ? (
        <>
          <h3 className="text-base font-bold" style={barlow}>
            Maintenance & condition
          </h3>
          <p className="text-xs text-[var(--fh-text-dim)]">Damage history</p>
          <div className="mb-2 flex flex-wrap gap-2">
            {(["NDH", "Has damage history", "Unknown"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                className={`rounded-full border px-3 py-1 text-sm ${
                  (opt === "NDH" && draft.damageHistory === false) ||
                  (opt === "Has damage history" && draft.damageHistory === true) ||
                  (opt === "Unknown" && draft.damageHistory == null)
                    ? "border-[#FF9900] bg-[#FF9900]/15"
                    : ""
                }`}
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    damageHistory: opt === "NDH" ? false : opt === "Has damage history" ? true : undefined,
                    damageDetail: opt === "Has damage history" ? d.damageDetail : undefined,
                  }))
                }
              >
                {opt}
              </button>
            ))}
          </div>
          {draft.damageHistory === true ? (
            <textarea
              className="mb-2 w-full rounded-lg border border-[var(--fh-border)] bg-[#0d1117] p-2 text-sm [data-theme=light]:bg-white"
              placeholder="Describe damage / repairs"
              value={draft.damageDetail ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, damageDetail: e.target.value || undefined }))}
            />
          ) : null}
          <label className="text-xs text-[var(--fh-text-dim)]">Known squawks</label>
          <textarea
            className="mb-2 w-full rounded-lg border border-[var(--fh-border)] bg-[#0d1117] p-2 text-sm [data-theme=light]:bg-white"
            value={draft.squawks ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, squawks: e.target.value || undefined }))}
          />
          <label className="text-xs text-[var(--fh-text-dim)]">Paint</label>
          <select
            className="mb-2 w-full rounded-lg border border-[var(--fh-border)] bg-[#0d1117] px-3 py-2 [data-theme=light]:bg-white"
            value={draft.paintCondition ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, paintCondition: e.target.value || undefined }))}
          >
            <option value="">Select…</option>
            <option value="Excellent">Excellent</option>
            <option value="Good">Good</option>
            <option value="Fair">Fair</option>
            <option value="Poor">Poor</option>
          </select>
          <label className="text-xs text-[var(--fh-text-dim)]">Interior</label>
          <select
            className="mb-2 w-full rounded-lg border border-[var(--fh-border)] bg-[#0d1117] px-3 py-2 [data-theme=light]:bg-white"
            value={draft.interiorCondition ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, interiorCondition: e.target.value || undefined }))}
          >
            <option value="">Select…</option>
            <option value="Excellent">Excellent</option>
            <option value="Good">Good</option>
            <option value="Fair">Fair</option>
            <option value="Poor">Poor</option>
          </select>
          <label className="text-xs text-[var(--fh-text-dim)]">Asking price (your target or estimate)</label>
          <input
            type="number"
            className="mb-1 w-full rounded-lg border border-[var(--fh-border)] bg-[#0d1117] px-3 py-2 [data-theme=light]:bg-white"
            value={draft.askingPrice ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, askingPrice: Number(e.target.value) || undefined }))}
            onBlur={() => {
              const p = draft.askingPrice
              if (typeof p === "number") {
                /* hint rendered below */
              }
            }}
          />
          {typeof draft.askingPrice === "number" ? <AskingHint price={draft.askingPrice} /> : null}
          <label className="text-xs text-[var(--fh-text-dim)]">Location</label>
          <input
            className="mb-2 w-full rounded-lg border border-[var(--fh-border)] bg-[#0d1117] px-3 py-2 [data-theme=light]:bg-white"
            value={draft.location ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value || undefined }))}
          />
          <label className="text-xs text-[var(--fh-text-dim)]">Notes</label>
          <textarea
            className="mb-2 w-full rounded-lg border border-[var(--fh-border)] bg-[#0d1117] p-2 text-sm [data-theme=light]:bg-white"
            value={draft.notes ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value || undefined }))}
          />
          <div className="flex gap-2">
            <button type="button" className="flex-1 rounded-lg border py-2 text-sm" onClick={() => setManualStep(4)}>
              Back
            </button>
            <button
              type="button"
              className="flex-1 rounded-lg bg-[#FF9900] py-2 text-sm font-bold text-black"
              onClick={() => setShowSummary(true)}
            >
              Build aircraft profile →
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}
