export interface DeskState {
  offer: number
  prebuy: number
  title: number
  ferry: number
  annualReserve: number
  avionics: number
  detail: number
  squawks: number
  contingency: number
  holdMonths: number
  hangar: number
  insurance: number
  maintReserve: number
  demoFlight: number
  oppCost: number
  brokerage: number
  exitTitle: number
  sellCosts: number
  exitPrice: number
}

export interface PLResult {
  acq: number
  upgrades: number
  carrying: number
  exitCosts: number
  basis: number
  profit: number
  roi: number
}

export function calcPL(state: DeskState): PLResult {
  const acq = state.offer + state.prebuy + state.title + state.ferry + state.annualReserve
  const upgrades = state.avionics + state.detail + state.squawks + state.contingency
  const carrying =
    (state.hangar + state.insurance + state.maintReserve + state.demoFlight) * state.holdMonths
  const exitCosts = state.oppCost + state.brokerage + state.exitTitle + state.sellCosts
  const basis = acq + upgrades + carrying + exitCosts
  const profit = state.exitPrice - basis
  const roi = basis > 0 ? (profit / basis) * 100 : 0
  return { acq, upgrades, carrying, exitCosts, basis, profit, roi }
}
