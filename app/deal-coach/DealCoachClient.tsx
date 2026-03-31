"use client"

import Link from "next/link"
import { useCallback, useMemo, useState } from "react"
import type { AircraftProfile, CoachAnswers, DealCoachStep, DealMode } from "./types"
import StepAircraftId from "./steps/StepAircraftId"
import StepDeepDesk from "./steps/StepDeepDesk"
import StepEntry from "./steps/StepEntry"
import StepIntent from "./steps/StepIntent"
import StepParameters from "./steps/StepParameters"
// import StepSellStub from "./steps/StepSellStub"
import StepSellGoals from "./steps/StepSellGoals"
import StepSellHours from "./steps/StepSellHours"
import StepSellReport from "./steps/StepSellReport"
import StepTransition from "./steps/StepTransition"

const barlow = { fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" } as const

function progressFor(step: DealCoachStep, mode: CoachAnswers["mode"]): [number, string] {
  if (step === "sellStub") return [100, "Seller preview"]
  if (mode === "sell") {
    if (step === "entry") return [10, "Start"]
    if (step === "aircraft") return [30, "Step 1 of 4"]
    if (step === "sell-hours") return [50, "Step 2 of 4"]
    if (step === "sell-goals") return [70, "Step 3 of 4"]
    if (step === "sell-report") return [100, "Sell Strategy"]
    return [100, "Sell Strategy"]
  }
  const map: Record<Exclude<DealCoachStep, "sellStub" | "sell-goals" | "sell-report" | "sell-hours">, [number, string]> = {
    entry: [4, "Start"],
    aircraft: [28, "Step 1 of 4"],
    intent: [50, "Step 2 of 4"],
    parameters: [72, "Step 3 of 4"],
    transition: [88, "Building…"],
    desk: [100, "Deal Desk"],
  }
  return map[step as Exclude<DealCoachStep, "sellStub" | "sell-goals" | "sell-report" | "sell-hours">] ?? [0, ""]
}

type DealCoachClientProps = {
  initialListingProfile: AircraftProfile | null
  /** When set (and no listing profile), skip mode picker and open aircraft step with this mode. */
  initialIntent?: DealMode | null
}

export default function DealCoachClient({
  initialListingProfile,
  initialIntent = null,
}: DealCoachClientProps) {
  const [step, setStep] = useState<DealCoachStep>(() => {
    if (initialListingProfile) return "aircraft"
    if (initialIntent) return "aircraft"
    return "entry"
  })
  const [answers, setAnswers] = useState<CoachAnswers>(() => {
    if (initialListingProfile?.listingId) {
      return { mode: "buy", aircraft: initialListingProfile }
    }
    if (initialIntent) {
      return { mode: initialIntent }
    }
    return { mode: "buy" }
  })

  const onUpdate = useCallback((patch: Partial<CoachAnswers>) => {
    setAnswers((prev) => ({ ...prev, ...patch }))
  }, [])

  const onNext = useCallback(() => {
    setStep((s) => {
      if (s === "entry") return "aircraft"
      if (s === "aircraft") {
        if (answers.mode === "sell") return "sell-hours"
        return "intent"
      }
      if (s === "sell-hours") return "sell-goals"
      if (s === "sell-goals") return "sell-report"
      if (s === "intent") return "parameters"
      if (s === "parameters") return "transition"
      if (s === "transition") return "desk"
      return s
    })
  }, [answers.mode])

  const onBack = useCallback(() => {
    setStep((s) => {
      if (s === "sell-report") return "sell-goals"
      if (s === "sell-goals") return "sell-hours"
      if (s === "sell-hours") return "aircraft"
      if (s === "sellStub") return "aircraft"
      if (s === "aircraft") return "entry"
      if (s === "intent") return "aircraft"
      if (s === "parameters") return "intent"
      if (s === "desk") return "parameters"
      return s
    })
  }, [])

  const stepProps = useMemo(
    () => ({
      answers,
      onUpdate,
      onNext,
      onBack,
    }),
    [answers, onUpdate, onNext, onBack]
  )

  const [pct, label] = progressFor(step, answers.mode)

  const showGlobalBack =
    step !== "entry" && step !== "desk" && step !== "transition" && step !== "sell-report"

  return (
    <div className="min-h-screen bg-[#0d1117] text-[var(--fh-text)] [data-theme=light]:bg-slate-100 [data-theme=light]:text-slate-900">
      <header className="deal-coach-no-print border-b border-[var(--fh-border)] bg-[#0d1117]/95 px-4 py-4 backdrop-blur [data-theme=light]:bg-slate-50/95">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/"
            className="shrink-0 text-2xl font-bold tracking-tight text-[var(--fh-text)] transition-opacity hover:opacity-90 sm:text-3xl md:text-4xl [data-theme=light]:text-slate-900"
            style={barlow}
          >
            Deal Coach
          </Link>
          <div className="flex-1 sm:max-w-md">
            <div className="mb-1 flex justify-between text-[10px] uppercase text-[var(--fh-text-dim)]">
              <span>{label}</span>
              <span>{pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#161b22] [data-theme=light]:bg-slate-200">
              <div className="h-full rounded-full bg-[#FF9900] transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {showGlobalBack ? (
          <button
            type="button"
            onClick={onBack}
            className="mb-6 text-sm font-semibold text-[#FF9900] hover:underline"
          >
            ← Back
          </button>
        ) : null}

        {step === "entry" ? <StepEntry {...stepProps} /> : null}
        {step === "aircraft" ? <StepAircraftId {...stepProps} /> : null}
        {step === "intent" ? <StepIntent {...stepProps} /> : null}
        {step === "parameters" ? <StepParameters {...stepProps} /> : null}
        {step === "transition" ? <StepTransition {...stepProps} /> : null}
        {step === "desk" ? <StepDeepDesk answers={answers} /> : null}
        {step === "sell-hours" ? <StepSellHours {...stepProps} /> : null}
        {step === "sell-goals" ? <StepSellGoals {...stepProps} /> : null}
        {step === "sell-report" ? <StepSellReport {...stepProps} /> : null}
        {/* {step === "sellStub" ? <StepSellStub {...stepProps} /> : null} */}
      </main>
    </div>
  )
}
