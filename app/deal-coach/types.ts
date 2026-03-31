export type DealMode = "buy" | "sell" | "research"
export type IntentType = "flip" | "personal" | "training" | "business"
export type FinanceType = "cash" | "finance50" | "finance80"
export type SellGoal = "top_dollar" | "sell_30" | "balance"

export interface AircraftProfile {
  source: "listing" | "search" | "manual" | "faa"
  listingId?: string
  year?: number
  make?: string
  model?: string
  registration?: string
  serialNumber?: string

  ttaf?: number
  condition?: string

  smoh?: number
  snew?: number
  stoh?: number
  spoh?: number
  annualStatus?: string
  lastAnnual?: string
  engineMake?: string
  engineModel?: string
  engineCount?: number
  overhaulType?: string
  propMake?: string
  propType?: string

  panelType?: string
  avionicsSelected?: string[]

  damageHistory?: boolean
  damageDetail?: string
  squawks?: string
  paintCondition?: string
  interiorCondition?: string

  askingPrice?: number
  location?: string
  notes?: string

  /** Display-only hints from listing row */
  flipScore?: number | null
  dealTier?: string | null
  valueScore?: number | null
}

export interface CoachAnswers {
  mode: DealMode
  intent?: IntentType
  aircraft?: AircraftProfile
  offerPrice?: number
  holdMonths?: number
  exitTarget?: number
  financeType?: FinanceType
  sellGoal?: SellGoal
  sellTargetPrice?: number
  sellTimeline?: string
  sellHasLoan?: boolean
  sellLoanBalance?: number
}

export type DealCoachStep =
  | "entry"
  | "aircraft"
  | "sell-hours"
  | "intent"
  | "parameters"
  | "transition"
  | "desk"
  | "sellStub"
  | "sell-goals"
  | "sell-report"
