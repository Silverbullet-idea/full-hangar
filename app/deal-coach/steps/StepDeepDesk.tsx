"use client"

import { useCallback, useMemo, useState, type ReactNode } from "react"
import { buildPrefill } from "../../../lib/dealCoach/prefill"
import { calcPL, type DeskState } from "../../../lib/dealCoach/deskState"
import type { CoachAnswers } from "../types"

const barlow = { fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" } as const

function fmtMoney(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
}

type Tag = "from coach" | "estimate" | "standard"

function Row({
  label,
  tag,
  value,
  onChange,
}: {
  label: string
  tag: Tag
  value: number
  onChange: (n: number) => void
}) {
  const tagCls =
    tag === "from coach"
      ? "text-emerald-500"
      : "text-[var(--fh-text-dim)]"
  return (
    <div className="flex items-center gap-2 border-b border-[var(--fh-border)] py-2 text-sm last:border-0">
      <span className="min-w-0 flex-1 text-[var(--fh-text)]">{label}</span>
      <span className={`hidden text-[10px] uppercase sm:inline ${tagCls}`}>{tag}</span>
      <input
        type="number"
        className="w-28 rounded border border-[var(--fh-border)] bg-[#0d1117] px-2 py-1 text-right font-mono text-xs [data-theme=light]:bg-white"
        style={{ fontFamily: "var(--font-dm-mono), monospace" }}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
    </div>
  )
}

function Section({
  icon,
  title,
  cost,
  open,
  onToggle,
  children,
}: {
  icon: string
  title: string
  cost: number
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="rounded-xl border border-[var(--fh-border)] bg-[#161b22] [data-theme=light]:bg-white">
      <button
        type="button"
        className="flex w-full items-center gap-3 p-4 text-left"
        onClick={onToggle}
        style={barlow}
      >
        <span className="text-xl" aria-hidden>
          {icon}
        </span>
        <span className="flex-1 text-base font-bold text-[var(--fh-text)] [data-theme=light]:text-slate-900">{title}</span>
        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-400 [data-theme=light]:text-emerald-800">
          Pre-filled
        </span>
        <span className="font-mono text-sm text-[var(--fh-text-dim)]" style={{ fontFamily: "var(--font-dm-mono)" }}>
          −{fmtMoney(Math.abs(cost))}
        </span>
        <span className="text-[var(--fh-text-dim)]">{open ? "▾" : "▸"}</span>
      </button>
      {open ? <div className="border-t border-[var(--fh-border)] px-4 pb-4">{children}</div> : null}
    </div>
  )
}

function SensitivityGrid({ state }: { state: DeskState }) {
  const holds = useMemo(() => {
    const h = state.holdMonths
    const seq = [h - 3, h - 1, h + 1, h + 3].map((x) => Math.min(24, Math.max(1, x)))
    return Array.from(new Set(seq)).slice(0, 4)
  }, [state.holdMonths])

  const exits = useMemo(() => {
    const e = state.exitPrice
    const step = 2500
    return [e - step * 2, e - step, e + step, e + step * 2].map((x) => Math.max(0, x))
  }, [state.exitPrice])

  const cell = (holdM: number, exitP: number) => {
    const pl = calcPL({ ...state, holdMonths: holdM, exitPrice: exitP })
    const p = pl.profit
    let bg = "bg-red-500/20 text-red-100 [data-theme=light]:text-red-900"
    if (p > 0) bg = "bg-emerald-500/20 text-emerald-100 [data-theme=light]:text-emerald-900"
    else if (p >= -2000) bg = "bg-amber-500/20 text-amber-100 [data-theme=light]:text-amber-900"
    return (
      <td key={`${holdM}-${exitP}`} className={`p-2 text-center text-xs font-mono ${bg}`}>
        {fmtMoney(p)}
      </td>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[320px] border-collapse text-sm">
        <thead>
          <tr>
            <th className="p-2 text-left text-xs text-[var(--fh-text-dim)]">Hold \ Exit</th>
            {exits.map((e) => (
              <th key={e} className="p-2 text-xs text-[var(--fh-text-dim)]">
                {fmtMoney(e)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {holds.map((h) => (
            <tr key={h}>
              <td className="p-2 text-xs font-semibold text-[var(--fh-text)]">{h} mo</td>
              {exits.map((e) => cell(h, e))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function StepDeepDesk({ answers }: { answers: CoachAnswers }) {
  const [desk, setDesk] = useState<DeskState>(() => buildPrefill(answers))
  const [open, setOpen] = useState<Record<number, boolean>>({ 0: true, 4: true })
  const [toast, setToast] = useState<string | null>(null)

  const pl = useMemo(() => calcPL(desk), [desk])

  const set = useCallback(<K extends keyof DeskState>(key: K, v: number) => {
    setDesk((d) => ({ ...d, [key]: v }))
  }, [])

  const ask = answers.aircraft?.askingPrice

  return (
    <div className="mx-auto max-w-6xl">
      {toast ? (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-[var(--fh-border)] bg-[#161b22] px-4 py-2 text-sm shadow-lg [data-theme=light]:bg-white">
          {toast}
        </div>
      ) : null}

      <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-6">
        <div className="lg:hidden">
          <div
            className="sticky top-0 z-10 mb-4 flex flex-wrap items-center gap-3 border-b border-[var(--fh-border)] bg-[#0d1117]/95 py-2 backdrop-blur [data-theme=light]:bg-slate-50/95"
          >
            <div>
              <div className="text-[10px] uppercase text-[var(--fh-text-dim)]">Net profit</div>
              <div
                className={`text-lg font-bold font-mono ${pl.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}
                style={{ fontFamily: "var(--font-dm-mono)" }}
              >
                {fmtMoney(pl.profit)}
              </div>
            </div>
            <div className="text-xs text-[var(--fh-text-dim)]">
              ROI {pl.roi.toFixed(1)}% · Basis {fmtMoney(pl.basis)} · Exit {fmtMoney(desk.exitPrice)}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <Section
            icon="🛬"
            title="Aircraft acquisition"
            cost={pl.acq}
            open={!!open[0]}
            onToggle={() => setOpen((o) => ({ ...o, 0: !o[0] }))}
          >
            <Row label="Offer" tag="from coach" value={desk.offer} onChange={(n) => set("offer", n)} />
            <Row label="Pre-buy inspection" tag="standard" value={desk.prebuy} onChange={(n) => set("prebuy", n)} />
            <Row label="Title / escrow" tag="standard" value={desk.title} onChange={(n) => set("title", n)} />
            <Row label="Ferry / relocation" tag="estimate" value={desk.ferry} onChange={(n) => set("ferry", n)} />
            <Row label="Annual reserve" tag="estimate" value={desk.annualReserve} onChange={(n) => set("annualReserve", n)} />
            <p className="mt-2 text-right text-sm font-mono font-semibold text-[var(--fh-text)]">Section {fmtMoney(pl.acq)}</p>
          </Section>

          <Section
            icon="🔧"
            title="Upgrades & contingency"
            cost={pl.upgrades}
            open={!!open[1]}
            onToggle={() => setOpen((o) => ({ ...o, 1: !o[1] }))}
          >
            <div className="mb-2 rounded-lg border border-[#FF9900]/30 bg-[#FF9900]/5 p-3 text-xs text-[var(--fh-text-dim)]">
              Avionics uplift is modeled conservatively from your panel selection. Adjust line items to match your shop quotes.
            </div>
            <Row label="Avionics" tag="from coach" value={desk.avionics} onChange={(n) => set("avionics", n)} />
            <Row label="Paint / interior detail" tag="estimate" value={desk.detail} onChange={(n) => set("detail", n)} />
            <Row label="Squawks" tag="estimate" value={desk.squawks} onChange={(n) => set("squawks", n)} />
            <Row label="Contingency" tag="from coach" value={desk.contingency} onChange={(n) => set("contingency", n)} />
            <p className="mt-2 text-right text-sm font-mono font-semibold">Section {fmtMoney(pl.upgrades)}</p>
          </Section>

          <Section
            icon="📅"
            title="Carrying costs"
            cost={pl.carrying}
            open={!!open[2]}
            onToggle={() => setOpen((o) => ({ ...o, 2: !o[2] }))}
          >
            <Row label="Hold (months)" tag="from coach" value={desk.holdMonths} onChange={(n) => set("holdMonths", Math.min(24, Math.max(1, n)))} />
            <Row label="Hangar / mo" tag="standard" value={desk.hangar} onChange={(n) => set("hangar", n)} />
            <Row label="Insurance / mo" tag="standard" value={desk.insurance} onChange={(n) => set("insurance", n)} />
            <Row label="Maint reserve / mo" tag="standard" value={desk.maintReserve} onChange={(n) => set("maintReserve", n)} />
            <Row label="Demo flight / mo" tag="estimate" value={desk.demoFlight} onChange={(n) => set("demoFlight", n)} />
            <p className="mt-2 text-right text-sm font-mono font-semibold">Section {fmtMoney(pl.carrying)}</p>
          </Section>

          <Section
            icon="🏁"
            title="Financing & exit costs"
            cost={pl.exitCosts}
            open={!!open[3]}
            onToggle={() => setOpen((o) => ({ ...o, 3: !o[3] }))}
          >
            <Row label="Opportunity cost" tag="estimate" value={desk.oppCost} onChange={(n) => set("oppCost", n)} />
            <Row label="Brokerage" tag="estimate" value={desk.brokerage} onChange={(n) => set("brokerage", n)} />
            <Row label="Exit title / escrow" tag="standard" value={desk.exitTitle} onChange={(n) => set("exitTitle", n)} />
            <Row label="Selling costs" tag="standard" value={desk.sellCosts} onChange={(n) => set("sellCosts", n)} />
            <p className="mt-2 text-right text-sm font-mono font-semibold">Section {fmtMoney(pl.exitCosts)}</p>
          </Section>

          <Section
            icon="🎯"
            title="Exit target"
            cost={desk.exitPrice}
            open={!!open[4]}
            onToggle={() => setOpen((o) => ({ ...o, 4: !o[4] }))}
          >
            <Row label="Exit price" tag="from coach" value={desk.exitPrice} onChange={(n) => set("exitPrice", n)} />
            {typeof ask === "number" ? (
              <p className="mt-2 text-xs text-[var(--fh-text-dim)]">
                Compared to current ask {fmtMoney(ask)} — adjust for your expected resale lane.
              </p>
            ) : null}
          </Section>

          <Section
            icon="📉"
            title="Sensitivity grid"
            cost={0}
            open={!!open[5]}
            onToggle={() => setOpen((o) => ({ ...o, 5: !o[5] }))}
          >
            <SensitivityGrid state={desk} />
          </Section>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-xl border border-[var(--fh-border)] bg-[#161b22] p-4 [data-theme=light]:bg-white">
            <h3 className="text-lg font-bold text-[var(--fh-text)] [data-theme=light]:text-slate-900" style={barlow}>
              Live P&amp;L
            </h3>
            <div
              className={`mt-2 text-3xl font-bold font-mono ${pl.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}
              style={{ fontFamily: "var(--font-dm-mono)" }}
            >
              {fmtMoney(pl.profit)}
            </div>
            <span
              className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-bold ${
                pl.roi >= 0 ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"
              }`}
            >
              ROI {pl.roi.toFixed(1)}%
            </span>
            <ul className="mt-4 space-y-1 text-xs text-[var(--fh-text-dim)]">
              <li className="flex justify-between">
                <span>Acquisition</span>
                <span className="font-mono">{fmtMoney(pl.acq)}</span>
              </li>
              <li className="flex justify-between">
                <span>Upgrades</span>
                <span className="font-mono">{fmtMoney(pl.upgrades)}</span>
              </li>
              <li className="flex justify-between">
                <span>Carrying</span>
                <span className="font-mono">{fmtMoney(pl.carrying)}</span>
              </li>
              <li className="flex justify-between">
                <span>Exit costs</span>
                <span className="font-mono">{fmtMoney(pl.exitCosts)}</span>
              </li>
              <li className="mt-2 flex justify-between border-t border-[var(--fh-border)] pt-2 font-semibold text-[var(--fh-text)]">
                <span>All-in basis</span>
                <span className="font-mono">{fmtMoney(pl.basis)}</span>
              </li>
              <li className="flex justify-between">
                <span>Exit</span>
                <span className="font-mono">{fmtMoney(desk.exitPrice)}</span>
              </li>
            </ul>
            <button
              type="button"
              className="mt-4 w-full rounded-lg border border-[var(--fh-border)] py-2 text-sm font-semibold"
              onClick={() => {
                setToast("Scenario saved — sign up to access it later →")
                setTimeout(() => setToast(null), 3500)
              }}
            >
              Save scenario
            </button>
            <button
              type="button"
              className="mt-2 w-full rounded-lg border border-[#FF9900] py-2 text-sm font-semibold text-[#FF9900]"
              onClick={() => {
                setToast("PDF export coming soon.")
                setTimeout(() => setToast(null), 2500)
              }}
            >
              Export PDF report →
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}
