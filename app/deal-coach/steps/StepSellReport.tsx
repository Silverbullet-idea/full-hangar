"use client"

import { useCallback, useEffect, useState } from "react"
import { getMockSellIntelPayload } from "@/lib/sellIntel/mock"
import type { SellIntelPayload } from "@/lib/sellIntel/types"
import BrokerVsSelfCard from "../components/SellReport/BrokerVsSelfCard"
import AnnualAdviceCard from "../components/SellReport/AnnualAdviceCard"
import BestSpendSummary from "../components/SellReport/BestSpendSummary"
import CompsTable from "../components/SellReport/CompsTable"
import DemandSignalCard from "../components/SellReport/DemandSignalCard"
import EngineNarrativeCard from "../components/SellReport/EngineNarrativeCard"
import KeywordChips from "../components/SellReport/KeywordChips"
import MarketSnapshot from "../components/SellReport/MarketSnapshot"
import PhotoGuide from "../components/SellReport/PhotoGuide"
import PlatformList from "../components/SellReport/PlatformList"
import PriceHistoryChart from "../components/SellReport/PriceHistoryChart"
import PriceReductionTimeline from "../components/SellReport/PriceReductionTimeline"
import PricingBand from "../components/SellReport/PricingBand"
import SeasonalHint from "../components/SellReport/SeasonalHint"
import UpgradeROITable from "../components/SellReport/UpgradeROITable"
import { buildSellIntelQueryString } from "../sellIntelQuery"
import "../sellReportPrint.css"
import type { StepProps } from "./types"

const barlow = { fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" } as const

const USE_MOCK = process.env.NEXT_PUBLIC_SELL_INTEL_MOCK === "true"

type Tab = "market" | "upgrade" | "listing"

function qualityBadge(q: SellIntelPayload["dataQuality"]): { label: string; className: string } {
  if (q === "strong") return { label: "STRONG DATA", className: "bg-emerald-500/20 text-emerald-300 ring-emerald-500/40 [data-theme=light]:text-emerald-900" }
  if (q === "moderate") return { label: "MODERATE DATA", className: "bg-amber-500/20 text-amber-200 ring-amber-500/40 [data-theme=light]:text-amber-900" }
  return { label: "LIMITED DATA", className: "bg-red-500/20 text-red-300 ring-red-500/40 [data-theme=light]:text-red-900" }
}

function parsePayload(json: unknown): SellIntelPayload | null {
  if (!json || typeof json !== "object") return null
  const o = json as Record<string, unknown>
  if (o.data && typeof o.data === "object") return o.data as SellIntelPayload
  if (typeof o.computedAt === "string" && o.marketPosition && o.upgradeROI && o.listingStrategy) return json as SellIntelPayload
  return null
}

function normalizePayload(p: SellIntelPayload): SellIntelPayload {
  return {
    ...p,
    upgradeROI: {
      ...p.upgradeROI,
      compsAvionicsFrequency: p.upgradeROI.compsAvionicsFrequency ?? [],
      modelSpecificWarnings: p.upgradeROI.modelSpecificWarnings ?? [],
      buyerExpectations: p.upgradeROI.buyerExpectations ?? [],
      signatureUpgrade: p.upgradeROI.signatureUpgrade ?? null,
    },
  }
}

function fmtMoneyTable(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
}

export default function StepSellReport({ answers, onBack }: StepProps) {
  const [tab, setTab] = useState<Tab>("market")
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<SellIntelPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ac = answers.aircraft
  const headline = [ac?.year, ac?.make, ac?.model].filter(Boolean).join(" ") || "Your aircraft"

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    if (USE_MOCK) {
      setData(normalizePayload(getMockSellIntelPayload()))
      setLoading(false)
      return
    }

    const qs = buildSellIntelQueryString(answers)
    if (!qs.includes("make=")) {
      setError("Add a make in the aircraft step to load the Seller's Intelligence Report.")
      setData(null)
      setLoading(false)
      return
    }

    try {
      const res = await fetch(`/api/sell-intel?${qs}`)
      const json = await res.json()
      const payload = parsePayload(json)
      if (!res.ok || !payload) throw new Error(typeof json?.error === "string" ? json.error : "Bad response")
      setData(normalizePayload(payload))
    } catch {
      setData(null)
      setError("Could not load the Seller's Intelligence Report. Try again later.")
    } finally {
      setLoading(false)
    }
  }, [answers])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!data || typeof document === "undefined") return
    const prev = document.title
    document.title = `Seller's Intelligence Report — ${headline}`
    return () => {
      document.title = prev
    }
  }, [data, headline])

  const print = () => {
    if (typeof window !== "undefined") window.print()
  }

  const mailtoWaitlist = () => {
    const sub = encodeURIComponent(`Listing Waitlist: ${headline}`)
    window.location.href = `mailto:?subject=${sub}`
  }

  if (loading) {
    return (
      <div
        className="sell-report-print-root mx-auto max-w-4xl space-y-6 py-4"
        aria-busy="true"
        aria-label="Loading Seller's Intelligence Report"
      >
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-2/3 rounded bg-[#161b22] [data-theme=light]:bg-slate-200" />
          <div className="h-4 w-full rounded bg-[#161b22] [data-theme=light]:bg-slate-200" />
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="h-28 rounded-xl bg-[#161b22] [data-theme=light]:bg-slate-200" />
            <div className="h-28 rounded-xl bg-[#161b22] [data-theme=light]:bg-slate-200" />
            <div className="h-28 rounded-xl bg-[#161b22] [data-theme=light]:bg-slate-200" />
          </div>
        </div>
        <p className="text-center text-sm font-semibold text-[var(--fh-text)] [data-theme=light]:text-slate-900">
          Analyzing market data for {ac?.make ?? "your make"} {ac?.model ?? ""}…
        </p>
        <p className="text-center text-xs text-[var(--fh-text-dim)]">
          Scanning 10,500+ active listings · Computing upgrade ROI · Building pricing strategy
        </p>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-lg space-y-4 text-center">
        <p className="text-sm text-red-400">{error}</p>
        <button type="button" onClick={() => void load()} className="rounded-lg border border-[#FF9900] px-4 py-2 text-sm font-bold text-[#FF9900]">
          Retry
        </button>
        <button type="button" onClick={onBack} className="block w-full text-sm text-[var(--fh-text-dim)]">
          ← Rerun coach
        </button>
      </div>
    )
  }

  if (!data) return null

  const badge = qualityBadge(data.dataQuality)
  const yourTarget = answers.sellTargetPrice ?? ac?.askingPrice
  const ph = data.marketPosition.priceHistory

  return (
    <div className="sell-report-print-root mx-auto max-w-4xl space-y-6 pb-12">
      <button
        type="button"
        onClick={onBack}
        className="sell-report-no-print back text-sm font-semibold text-[#FF9900] hover:underline"
      >
        ← Rerun coach
      </button>

      <div className="sell-report-print-header mb-2 hidden print:flex">
        <div>
          <div className="aircraft-name text-[var(--fh-text)] [data-theme=light]:text-slate-900">
            {ac?.year} {ac?.make} {ac?.model}
          </div>
          <div className="report-subtitle">Seller&apos;s Intelligence Report</div>
          <div className="report-subtitle mt-0.5 text-[11px] text-[var(--fh-text-dim)]">
            Computed {new Date(data.computedAt).toLocaleString()} from {data.marketPosition.activeListingCount} active listings
          </div>
        </div>
        <div className="sell-report-print-logo text-right">
          <div className="logo-wordmark font-bold text-[var(--fh-text)] [data-theme=light]:text-slate-900">
            Full<span className="text-[#FF9900]">Hangar</span>
          </div>
          <div className="logo-tagline mt-0.5 text-[var(--fh-text-dim)]">full-hangar.com · Aircraft Market Intelligence</div>
        </div>
      </div>

      <header className="sell-report-screen-header space-y-2 print:hidden">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[var(--fh-text)] [data-theme=light]:text-slate-900" style={barlow}>
              {headline}
            </h1>
            <p className="text-sm text-[var(--fh-text-dim)]">Seller&apos;s Intelligence Report</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-md px-3 py-1 text-[10px] font-black uppercase ring-1 ${badge.className}`}>{badge.label}</span>
            <button
              type="button"
              onClick={print}
              className="sell-report-no-print rounded-lg border border-[var(--fh-border)] px-3 py-2 text-xs font-bold text-[var(--fh-text)] hover:border-[#FF9900] [data-theme=light]:text-slate-900"
              aria-label="Print Seller's Intelligence Report"
            >
              🖨 Print report
            </button>
          </div>
        </div>
        <p className="text-xs text-[var(--fh-text-dim)]">
          Computed {new Date(data.computedAt).toLocaleString()} from {data.marketPosition.activeListingCount} active listings
        </p>
        {data.dataQuality === "limited" ? (
          <p className="text-xs text-amber-300 [data-theme=light]:text-amber-900">
            Fewer than 4 comparable listings found. Treat price estimates as directional ranges.
          </p>
        ) : null}
        {data.dataQualityNote ? (
          <p className="text-xs text-[var(--fh-text-dim)]">{data.dataQualityNote}</p>
        ) : null}
      </header>

      <nav className="tabs sell-report-no-print flex flex-wrap gap-2 border-b border-[var(--fh-border)] pb-2">
        {(
          [
            ["market", "Market position"],
            ["upgrade", "Upgrade ROI"],
            ["listing", "Listing strategy"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-t-lg px-4 py-2 text-sm font-bold ${
              tab === id ? "bg-[#FF9900] text-black" : "text-[var(--fh-text-dim)] hover:text-[var(--fh-text)]"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <section className={`tab-panel sell-report-tab-panel space-y-6 ${tab === "market" ? "block" : "hidden print:block"}`}>
        <h2 className="print-section-header hidden print:block">Market position</h2>
        <MarketSnapshot market={data.marketPosition} />
        <div className="price-history-chart-wrap print-no-break">
          <PriceHistoryChart points={ph} yourTargetPrice={yourTarget} />
        </div>
        <div className="price-history-print-table w-full overflow-x-auto text-sm">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--fh-border)] text-[10px] uppercase text-[var(--fh-text-dim)]">
                <th className="py-2 pr-4">Month</th>
                <th className="py-2 pr-4">Median price</th>
                <th className="py-2">Listings</th>
              </tr>
            </thead>
            <tbody>
              {ph.map((row) => (
                <tr key={row.month} className="border-b border-[var(--fh-border)]/60">
                  <td className="py-2 pr-4 font-mono text-xs">{row.month}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{fmtMoneyTable(row.medianPrice)}</td>
                  <td className="py-2 text-xs">{row.listingCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <CompsTable comps={data.marketPosition.comps} suggestedListPrice={data.listingStrategy.suggestedListPrice} />
        <div className="grid gap-4 lg:grid-cols-2">
          <DemandSignalCard market={data.marketPosition} />
          <SeasonalHint />
        </div>
      </section>

      <div className="print-page-break hidden print:block" aria-hidden />

      <section className={`tab-panel sell-report-tab-panel space-y-6 ${tab === "upgrade" ? "block" : "hidden print:block"}`}>
        <h2 className="print-section-header hidden print:block">Upgrade ROI</h2>
        {data.upgradeROI.damageHistoryImpact ? (
          <p className="print-no-break rounded-lg border border-[var(--fh-border)] p-3 text-sm text-[var(--fh-text)] [data-theme=light]:text-slate-900">
            Damage history: {data.upgradeROI.damageHistoryImpact}
          </p>
        ) : null}
        <UpgradeROITable
          items={data.upgradeROI.avionicsItems}
          mustSkipItems={data.upgradeROI.mustSkipItems}
          meta={data.upgradeROI}
          aircraftMake={ac?.make}
          aircraftModel={ac?.model}
          activeListingCount={data.marketPosition.activeListingCount}
          avionicsSelected={ac?.avionicsSelected}
        />
        <div className="print-no-break">
          <EngineNarrativeCard engine={data.upgradeROI.engineNarrative} />
        </div>
        <div className="print-no-break">
          <AnnualAdviceCard advice={data.upgradeROI.annualAdvice} />
        </div>
        <BestSpendSummary summary={data.upgradeROI.bestSpendSummary} avionicsItems={data.upgradeROI.avionicsItems} />
      </section>

      <div className="print-page-break hidden print:block" aria-hidden />

      <section className={`tab-panel sell-report-tab-panel space-y-6 ${tab === "listing" ? "block" : "hidden print:block"}`}>
        <h2 className="print-section-header hidden print:block">Listing strategy</h2>
        <div className="print-no-break">
          <PricingBand
            floor={data.listingStrategy.negotiationFloor}
            suggested={data.listingStrategy.suggestedListPrice}
            p75={data.marketPosition.p75AskPrice}
            yourTarget={yourTarget}
          />
        </div>
        <PriceReductionTimeline steps={data.listingStrategy.priceReductionSchedule} />
        <PlatformList platforms={data.listingStrategy.platforms} />
        <KeywordChips keywords={data.listingStrategy.keywords} />
        <PhotoGuide shots={data.listingStrategy.photoGuide} />
        <div className="print-no-break">
          <BrokerVsSelfCard calc={data.listingStrategy.brokerVsSelf} avgDom={data.marketPosition.avgDaysOnMarket} />
        </div>
      </section>

      <footer className="sell-report-no-print waitlist-cta mt-10 border-t border-[var(--fh-border)] pt-8">
        <p className="text-lg font-bold text-[var(--fh-text)] [data-theme=light]:text-slate-900" style={barlow}>
          Want to list your aircraft on Full Hangar?
        </p>
        <p className="mt-2 max-w-xl text-sm text-[var(--fh-text-dim)]">
          Full Hangar is building a marketplace for serious buyers. Be first when we launch — add your aircraft to the waitlist.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={mailtoWaitlist}
            className="rounded-xl bg-[#FF9900] px-5 py-3 text-sm font-black text-black"
          >
            Add to listing waitlist →
          </button>
          <button
            type="button"
            onClick={print}
            className="rounded-xl border border-[var(--fh-border)] px-5 py-3 text-sm font-bold text-[var(--fh-text)] [data-theme=light]:text-slate-900"
            aria-label="Print Seller's Intelligence Report"
          >
            🖨 Print report
          </button>
        </div>
      </footer>

      <div className="sell-report-print-footer">
        <div>
          <span className="fh-brand font-bold">
            Full<span className="text-[#FF9900]">Hangar</span>
          </span>{" "}
          · Aircraft Market Intelligence
        </div>
        <div>
          Seller&apos;s Intelligence Report · {ac?.year} {ac?.make} {ac?.model}
        </div>
        <div>
          full-hangar.com · {new Date().toLocaleDateString()}
        </div>
      </div>
    </div>
  )
}
