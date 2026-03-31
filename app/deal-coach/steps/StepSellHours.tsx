"use client"

import { useMemo, useState } from "react"
import { avionicsChipGroups, panelTypeOptions } from "../../../lib/dealCoach/avionicsOptions"
import { lookupTBO } from "../../../lib/dealCoach/tboReference"
import type { AircraftProfile } from "../types"
import type { StepProps } from "./types"

const barlow = { fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" } as const

function EngineLifeNudgeSell({ smoh, tboHours }: { smoh: number; tboHours: number }) {
  const pct = smoh / tboHours
  if (pct < 0.4) {
    return (
      <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200 [data-theme=light]:text-emerald-900">
        Healthy engine — SMOH is well under a typical {tboHours.toLocaleString()} hr TBO reference.
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
      High time vs. {tboHours.toLocaleString()} hr reference — verify TBO for your exact engine model and budget overhaul risk.
    </div>
  )
}

export default function StepSellHours({ answers, onUpdate, onNext }: StepProps) {
  const ac = answers.aircraft

  const [ttaf, setTtaf] = useState<number | undefined>(ac?.ttaf)
  const [smoh, setSmoh] = useState<number | undefined>(ac?.smoh)
  const [snew, setSnew] = useState<number | undefined>(ac?.snew)
  const [stoh, setStoh] = useState<number | undefined>(ac?.stoh)
  const [spoh, setSpoh] = useState<number | undefined>(ac?.spoh)
  const [annualStatus, setAnnualStatus] = useState<string | undefined>(ac?.annualStatus)
  const [condition, setCondition] = useState<string | undefined>(ac?.condition)
  const [panelType, setPanelType] = useState<string | undefined>(ac?.panelType)
  const [avionicsSelected, setAvionicsSelected] = useState<string[]>(ac?.avionicsSelected ?? [])

  const tboHours = useMemo(() => {
    const m = ac?.engineModel
    if (!m) return 2000
    const t = lookupTBO(m)
    return typeof t === "number" && t > 0 ? t : 2000
  }, [ac?.engineModel])

  const chipToggle = (label: string) => {
    setAvionicsSelected((cur) => (cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label]))
  }

  const clearAllAvionics = () => setAvionicsSelected([])

  const selectedAvionicsCount = avionicsSelected.length

  const submit = () => {
    const next: AircraftProfile = {
      ...(ac ?? { source: "manual" }),
      ttaf,
      smoh,
      snew,
      stoh,
      spoh,
      annualStatus,
      condition,
      panelType,
      avionicsSelected,
    }
    onUpdate({ aircraft: next })
    onNext()
  }

  const engLine =
    ac?.engineMake && ac?.engineModel ? `${ac.engineMake} ${ac.engineModel}` : ac?.engineModel || ac?.engineMake || ""

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <h2 className="text-2xl font-bold text-[var(--fh-text)] [data-theme=light]:text-slate-900" style={barlow}>
        Aircraft hours & condition
      </h2>
      <p className="text-xs text-[var(--fh-text-dim)]">
        All fields are optional — best-effort data improves your report. TTAF and SMOH help the most.
      </p>

      {ac?.source === "faa" ? (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-100 [data-theme=light]:text-emerald-950">
          <p className="font-semibold">
            ✓ {[ac.year, ac.make, ac.model].filter(Boolean).join(" ")}
            {ac.registration ? `  ·  ${ac.registration}` : ""}
            {engLine ? `  ·  ${engLine}` : ""}
            {ac.location ? `  ·  ${ac.location}` : ""}
          </p>
          <p className="mt-2 text-xs opacity-90">FAA prefilled — review and confirm your hours below.</p>
        </div>
      ) : null}

      <div>
        <label className="text-xs text-[var(--fh-text-dim)]">TTAF (total time airframe) — most important for valuation</label>
        <input
          type="number"
          className="mt-1 w-full rounded-lg border border-[var(--fh-border)] bg-[#0d1117] px-3 py-2 [data-theme=light]:bg-white"
          value={ttaf ?? ""}
          onChange={(e) => setTtaf(Number(e.target.value) || undefined)}
        />
      </div>
      <div>
        <label className="text-xs text-[var(--fh-text-dim)]">SMOH (since major overhaul)</label>
        <input
          type="number"
          className="mt-1 w-full rounded-lg border border-[var(--fh-border)] bg-[#0d1117] px-3 py-2 [data-theme=light]:bg-white"
          value={smoh ?? ""}
          onChange={(e) => setSmoh(Number(e.target.value) || undefined)}
        />
      </div>
      <div>
        <label className="text-xs text-[var(--fh-text-dim)]">SNEW (since new — if factory)</label>
        <input
          type="number"
          className="mt-1 w-full rounded-lg border border-[var(--fh-border)] bg-[#0d1117] px-3 py-2 [data-theme=light]:bg-white"
          value={snew ?? ""}
          onChange={(e) => setSnew(Number(e.target.value) || undefined)}
        />
      </div>
      <div>
        <label className="text-xs text-[var(--fh-text-dim)]">STOH (since top overhaul)</label>
        <input
          type="number"
          className="mt-1 w-full rounded-lg border border-[var(--fh-border)] bg-[#0d1117] px-3 py-2 [data-theme=light]:bg-white"
          value={stoh ?? ""}
          onChange={(e) => setStoh(Number(e.target.value) || undefined)}
        />
      </div>
      <div>
        <label className="text-xs text-[var(--fh-text-dim)]">SPOH (since prop overhaul)</label>
        <input
          type="number"
          className="mt-1 w-full rounded-lg border border-[var(--fh-border)] bg-[#0d1117] px-3 py-2 [data-theme=light]:bg-white"
          value={spoh ?? ""}
          onChange={(e) => setSpoh(Number(e.target.value) || undefined)}
        />
      </div>

      {typeof smoh === "number" && smoh >= 0 ? <EngineLifeNudgeSell smoh={smoh} tboHours={tboHours} /> : null}

      <div>
        <label className="text-xs text-[var(--fh-text-dim)]">Annual inspection status</label>
        <select
          className="mt-1 w-full rounded-lg border border-[var(--fh-border)] bg-[#0d1117] px-3 py-2 [data-theme=light]:bg-white"
          value={annualStatus ?? ""}
          onChange={(e) => setAnnualStatus(e.target.value || undefined)}
        >
          <option value="">Select…</option>
          <option value="Fresh annual">Fresh annual</option>
          <option value="Current">Current</option>
          <option value="Expiring soon">Expiring soon</option>
          <option value="Expired">Expired</option>
          <option value="Unknown">Unknown</option>
        </select>
      </div>

      <div>
        <label className="text-xs text-[var(--fh-text-dim)]">Condition</label>
        <select
          className="mt-1 w-full rounded-lg border border-[var(--fh-border)] bg-[#0d1117] px-3 py-2 [data-theme=light]:bg-white"
          value={condition ?? ""}
          onChange={(e) => setCondition(e.target.value || undefined)}
        >
          <option value="">Select…</option>
          <option value="Excellent">Excellent</option>
          <option value="Good">Good</option>
          <option value="Fair">Fair</option>
          <option value="Project">Project</option>
        </select>
      </div>

      <div>
        <p className="text-xs text-[var(--fh-text-dim)]">Panel type (one)</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {panelTypeOptions.map((p) => (
            <button
              key={p}
              type="button"
              className={`rounded-full border px-3 py-1 text-sm ${panelType === p ? "border-[#FF9900] bg-[#FF9900]/15" : ""}`}
              onClick={() => setPanelType(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-base font-bold text-[var(--fh-text)] [data-theme=light]:text-slate-900" style={barlow}>
            Avionics <span className="text-[#FF9900]">equipment</span>
          </p>
          {selectedAvionicsCount > 0 ? (
            <button
              type="button"
              onClick={clearAllAvionics}
              className="rounded-full border border-[var(--fh-border)] px-3 py-1 text-xs text-[var(--fh-text-dim)] transition-colors hover:text-[var(--fh-text)] [data-theme=light]:border-slate-300"
            >
              Clear all
            </button>
          ) : null}
        </div>
        {avionicsChipGroups.map((g) => (
          <div key={g.groupLabel} className="mb-3 mt-3">
            <p className="mb-1 text-xs font-semibold text-[var(--fh-text-dim)]">{g.groupLabel}</p>
            <div className="flex flex-wrap gap-2">
              {g.items.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`rounded-full border px-2 py-1 text-xs ${avionicsSelected.includes(item) ? "border-[#FF9900] bg-[#FF9900]/15" : ""}`}
                  onClick={() => chipToggle(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={submit}
        className="w-full rounded-xl bg-[#FF9900] py-3 text-sm font-black text-black"
        style={barlow}
      >
        Next →
      </button>
    </div>
  )
}
