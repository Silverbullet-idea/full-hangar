import type { CoachAnswers } from "../../app/deal-coach/types"
import type { DeskState } from "./deskState"

function hasAdsBChip(selected: string[] | undefined): boolean {
  if (!selected?.length) return false
  return selected.some((s) => /ads-b|adsb|gtx|lynx|uavionix|mode/i.test(s))
}

/**
 * National average hangar — placeholder until geo-specific defaults ship.
 */
export function buildPrefill(answers: CoachAnswers): DeskState {
  const offer = Math.max(0, answers.offerPrice ?? 45000)
  const holdMonths = Math.min(24, Math.max(1, answers.holdMonths ?? 6))
  const exitPrice = Math.max(0, answers.exitTarget ?? offer * 1.08)

  const panel = answers.aircraft?.panelType ?? ""
  const chips = answers.aircraft?.avionicsSelected ?? []
  const steam = panel === "Steam gauges" || panel.toLowerCase().includes("steam")
  let avionics = 0
  if (steam && !hasAdsBChip(chips)) {
    avionics = 6200
  } else if (steam) {
    avionics = 4500
  } else if (panel === "Hybrid") {
    avionics = 3500
  } else {
    avionics = 2000
  }

  const contingency = Math.max(600, offer * 0.05)

  return {
    offer,
    prebuy: 500,
    title: 250,
    ferry: 0,
    annualReserve: 0,
    avionics,
    detail: 0,
    squawks: 0,
    contingency,
    holdMonths,
    hangar: 250,
    insurance: 150,
    maintReserve: 80,
    demoFlight: 0,
    oppCost: 0,
    brokerage: 0,
    exitTitle: 350,
    sellCosts: 240,
    exitPrice,
  }
}
