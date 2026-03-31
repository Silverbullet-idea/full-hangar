export interface SellIntelPayload {
  aircraft: {
    make: string
    model?: string
    yearMin?: number
    yearMax?: number
    smoh?: number
    askingPrice?: number
    panelType?: string
    avionicsSelected?: string[]
  }
  marketPosition: MarketPositionData
  upgradeROI: UpgradeROIData
  listingStrategy: ListingStrategyData
  computedAt: string
  dataQuality: "strong" | "moderate" | "limited"
  /** Present when sample is thin; UI may surface as a banner. */
  dataQualityNote?: string | null
}

export interface MarketPositionData {
  medianAskPrice: number | null
  p25AskPrice: number | null
  p75AskPrice: number | null
  activeListingCount: number
  avgDaysOnMarket: number | null
  priceVsMedianPercent: number | null
  demandTier: "HIGH" | "MODERATE" | "LOW" | null
  topStates: Array<{ state: string; count: number }>
  recentOwnershipChanges: number
  comps: CompListing[]
  priceHistory: PriceHistoryPoint[]
}

export interface CompListing {
  id: string
  year: number | null
  make: string
  model: string
  askingPrice: number
  ttaf: number | null
  smoh: number | null
  location: string | null
  daysOnMarket: number | null
  flipScore: number | null
  flipTier: string | null
  url: string | null
}

export interface PriceHistoryPoint {
  month: string
  medianPrice: number
  listingCount: number
}

export interface AvionicsFrequency {
  token: string
  count: number
  pctOfComps: number
}

export interface UpgradeROIData {
  avionicsItems: UpgradeItem[]
  engineNarrative: EngineNarrative
  annualAdvice: AnnualAdvice
  damageHistoryImpact: string | null
  bestSpendSummary: string
  mustSkipItems: string[]
  compsAvionicsFrequency: AvionicsFrequency[]
  modelSpecificWarnings: string[]
  buyerExpectations: string[]
  signatureUpgrade: string | null
}

export interface UpgradeItem {
  name: string
  installCost: number
  valueAdd: number
  netROI: number
  recommendation: "DO" | "SKIP" | "OPTIONAL"
  rationale: string
}

export interface EngineNarrative {
  smoh: number | null
  tbo: number | null
  pctRemaining: number | null
  framing: string
  buyerRiskLevel: "LOW" | "MODERATE" | "HIGH"
  overhaulCostEstimate: number | null
}

export interface AnnualAdvice {
  status: "fresh" | "current" | "expiring_soon" | "expired" | "unknown"
  recommendation: string
  estimatedCost: number | null
}

export interface ListingStrategyData {
  suggestedListPrice: number | null
  negotiationFloor: number | null
  priceReductionSchedule: PriceStep[]
  platforms: PlatformRecommendation[]
  keywords: string[]
  photoGuide: string[]
  brokerVsSelf: BrokerCalc
}

export interface PriceStep {
  dayThreshold: number
  action: string
  targetPrice: number | null
}

export interface PlatformRecommendation {
  name: string
  url: string
  priority: "PRIMARY" | "SECONDARY"
  rationale: string
}

export interface BrokerCalc {
  selfSellNetEstimate: number | null
  brokerNetEstimate: number | null
  breakEvenDaysOnMarket: number | null
  recommendation: string
}

export type SellIntelParams = {
  make: string
  model?: string
  yearMin?: number
  yearMax?: number
  smoh?: number
  askingPrice?: number
  panelType?: string
  avionicsSelected?: string[]
  annualStatus?: string
  damageHistory?: boolean
  /** 1 or 2 — refines piston_single vs piston_multi when present */
  engineCount?: number
}
