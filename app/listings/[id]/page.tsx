import Link from "next/link"
import type { Metadata } from "next"
import { cache, type ReactNode } from "react"
import ListingDetailBodySections, { type LlpRow } from "./components/ListingDetailBodySections"
import ListingDetailSidebarSections from "./components/ListingDetailSidebarSections"
import ListingIdentityBar from "./components/ListingIdentityBar"
import ListingImageGallery from "./components/ListingImageGallery"
import ListingScoreHeroCards from "./components/ListingScoreHeroCards"
import RightDetailColumn from "./components/RightDetailColumn"
import {
  buildListingFallbackImagePath,
  buildPriceHistoryChart,
  buildPriceHistoryStats,
  collectImageUrls,
  collectKeyValueList,
  collectLinkUrls,
  collectTextList,
  formatTitle,
  getScoreColor,
  getSourceLinkLabel,
  normalizePriceHistory,
  pickNumber,
  pickText,
  renderScoreExplanationItem,
  safeDisplay,
  toBool,
  toTitleCase,
  type UnknownRow,
} from "./components/detailUtils"
import {
  cleanParsedText,
  cleanEngineModelText,
  inferEngineManufacturerFromModel,
  mergeAvionicsItems,
  parseDescriptionIntelligence,
  parseSellerDescription,
  renderAvionicsValue,
  type ParsedSellerDescription,
} from "./components/detailParsingUtils"
import {
  formatCompTier,
  formatHours,
  formatIsoDate,
  formatMoney,
  formatScore,
  formatSeatsEngines,
  getRiskClass,
} from "../../../lib/listings/format"
import { getListingById, getListingPriceHistory, getListingRawById, getSimilarMarketPricing } from "../../../lib/listings/queries"
import type { AircraftListing } from "../../../lib/types"
import { DEFAULT_OG_IMAGE_PATH, toAbsoluteUrl, titleFromParts } from "../../../lib/seo/site"

/** ISR: listing detail can be cached briefly to reduce repeat Supabase reads on popular slugs. */
export const revalidate = 300

type ListingPageProps = {
  params: Promise<{ id: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

type ScoreMetricRow = [string, ReactNode]

const getListingForSeo = cache(async (id: string) => {
  try {
    const listing = await getListingById(id)
    return listing ? (listing as AircraftListing) : null
  } catch (error) {
    console.error("[listings/[id]] metadata lookup failed", { id, error })
    return null
  }
})

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const listing = await getListingForSeo(id)
  const canonicalPath = `/listings/${id}`

  if (!listing) {
    return {
      title: "Listing Not Found",
      alternates: { canonical: canonicalPath },
      robots: { index: false, follow: true },
    }
  }

  const title =
    titleFromParts([listing.year ? String(listing.year) : "", listing.make, listing.model]) ||
    listing.title ||
    "Aircraft Listing"
  const askingPrice =
    typeof listing.price_asking === "number"
      ? listing.price_asking
      : typeof listing.asking_price === "number"
      ? listing.asking_price
      : null
  const descriptionParts = [
    askingPrice && askingPrice > 0 ? `Asking ${formatMoney(askingPrice)}.` : "Price available on request.",
    listing.location_label ? `Located in ${listing.location_label}.` : "",
    typeof listing.total_time_airframe === "number" ? `Total time ${Math.round(listing.total_time_airframe).toLocaleString("en-US")} hours.` : "",
    listing.risk_level ? `Risk level ${listing.risk_level}.` : "",
  ].filter(Boolean)
  const description = descriptionParts.join(" ")
  const imageUrl =
    typeof listing.primary_image_url === "string" && listing.primary_image_url.trim().length > 0
      ? listing.primary_image_url.trim()
      : toAbsoluteUrl(DEFAULT_OG_IMAGE_PATH)

  return {
    title,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      title,
      description,
      url: toAbsoluteUrl(canonicalPath),
      type: "article",
      images: [{ url: imageUrl }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
      },
    },
  }
}

export default async function ListingDetailPage({ params, searchParams }: ListingPageProps) {
  const { id } = await params
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const returnToRaw = resolvedSearchParams?.returnTo
  const returnToValue = Array.isArray(returnToRaw) ? returnToRaw[0] : returnToRaw
  const backToListingsHref =
    typeof returnToValue === "string" && returnToValue.startsWith("/listings")
      ? returnToValue
      : "/listings"
  let listing: AircraftListing | null = null
  let raw: UnknownRow = null
  try {
    const [listingResult, rawResult] = await Promise.all([getListingById(id), getListingRawById(id)])
    listing = listingResult ? (listingResult as AircraftListing) : null
    raw = rawResult as UnknownRow
  } catch (error) {
    console.error("[listings/[id]] initial data lookup failed", { id, error })
  }

  if (!listing) {
    return (
      <main className="container">
        <p>Listing not found.</p>
        <Link href={backToListingsHref}>Back to listings</Link>
      </main>
    )
  }

  const listingRow = listing as AircraftListing
  const imageUrls = collectImageUrls(listingRow.primary_image_url, raw)
  const faaMatched = toBool(raw, "faa_matched")
  const registrationAlert = pickText(raw, ["faa_registration_alert"])
  const nNumber = safeDisplay(listingRow.n_number || pickText(raw, ["n_number"]))
  const accidentCount = pickNumber(raw, ["accident_count"]) ?? 0
  const mostRecentAccidentDate = pickText(raw, ["most_recent_accident_date"])
  const mostSevereDamage = pickText(raw, ["most_severe_damage"])
  const hasAccidentHistory = toBool(raw, "has_accident_history") || accidentCount > 0
  const sourceUrl = listingRow.url || pickText(raw, ["source_url", "listing_url", "url"])
  const sourceLinkLabel = getSourceLinkLabel(listingRow.source, listingRow.source_id, sourceUrl)
  const titleText = formatTitle(listingRow.year, listingRow.make, listingRow.model, listingRow.title)
  const dealDeskAircraftLabel = nNumber !== "—" ? `${titleText} — ${nNumber}` : titleText
  const fallbackImageUrl = buildListingFallbackImagePath({
    source: listingRow.source,
    sourceId: listingRow.source_id,
    title: titleText,
  })
  const descriptionText = listingRow.description_full || listingRow.description || ""
  const descriptionIntelligence = parseDescriptionIntelligence(raw)
  const parsedDescription = parseSellerDescription(descriptionText)
  const avionicsMatchedItems = collectKeyValueList(raw, "avionics_matched_items")
  const parsedTotalTime = descriptionIntelligence.times.totalTime
  const parsedEngineSmoh = descriptionIntelligence.times.engineSmoh
  const parsedEngineTbo = descriptionIntelligence.times.engineTbo
  const parsedLastAnnual = descriptionIntelligence.maintenance.lastAnnualInspection || parsedDescription.lastAnnualInspection
  const parsedCylinderHours = descriptionIntelligence.maintenance.cylindersSinceNewHours || parsedDescription.cylindersSinceNewHours
  const totalTimeHours = typeof listingRow.total_time_airframe === "number"
    ? listingRow.total_time_airframe
    : parsedTotalTime ?? parsedDescription.totalTimeAirframe
  const engineSmohHours = typeof listingRow.engine_time_since_overhaul === "number"
    ? listingRow.engine_time_since_overhaul
    : parsedEngineSmoh ?? parsedDescription.engineSmoh
  const engineTboHours =
    pickNumber(raw, ["ev_tbo_hours"]) ??
    listingRow.engine_tbo_hours ??
    pickNumber(raw, ["engine_tbo_hours", "engine_tbo"]) ??
    parsedEngineTbo ??
    parsedDescription.engineTbo
  const scoreData = parseUnknownRecord(raw, ["score_data"]) ?? parseUnknownRecord(listingRow as UnknownRow, ["score_data"])
  const engineValueData = scoreData && typeof scoreData.engine_value === "object" ? (scoreData.engine_value as Record<string, unknown>) : null
  const engineRemainingValue =
    pickNumber(engineValueData, ["engine_remaining_value"]) ??
    pickNumber(raw, ["ev_engine_remaining_value"]) ??
    pickNumber(raw, ["engine_remaining_value", "engine_value_remaining"]) ?? null
  const engineOverrunLiability =
    pickNumber(engineValueData, ["engine_overrun_liability"]) ??
    pickNumber(raw, ["ev_engine_overrun_liability"]) ??
    pickNumber(raw, ["engine_overrun_liability", "engine_tbo_overrun_liability"]) ?? null
  const engineReservePerHour =
    pickNumber(engineValueData, ["engine_reserve_per_hour"]) ??
    pickNumber(raw, ["ev_engine_reserve_per_hour"]) ??
    pickNumber(raw, ["engine_reserve_per_hour", "engine_hourly_reserve"]) ?? null
  const engineHoursSmoh =
    pickNumber(engineValueData, ["engine_hours_smoh"]) ??
    pickNumber(raw, ["ev_hours_smoh"]) ??
    pickNumber(raw, ["engine_hours_smoh", "engine_time_since_overhaul", "time_since_overhaul"]) ??
    engineSmohHours ??
    null
  const engineDataQuality =
    pickText(engineValueData, ["data_quality"]) ??
    pickText(raw, ["ev_data_quality"]) ??
    null
  const engineValueExplanation =
    pickText(engineValueData, ["explanation"]) ??
    pickText(raw, ["ev_explanation"]) ??
    null
  const engineTboReferenceLine = normalizeTboReferenceLine(engineValueExplanation)
  const listedEngineReplacementCost =
    pickNumber(engineValueData, ["exchange_price"]) ??
    pickNumber(raw, ["ev_exchange_price"]) ??
    pickNumber(raw, ["engine_replacement_cost", "engine_overhaul_cost", "engine_exchange_price", "engine_new_cost"]) ?? null
  const derivedEngineReplacementCost =
    typeof engineRemainingValue === "number" &&
    engineRemainingValue > 0 &&
    typeof engineHoursSmoh === "number" &&
    typeof engineTboHours === "number" &&
    engineTboHours > engineHoursSmoh
      ? (engineRemainingValue * engineTboHours) / (engineTboHours - engineHoursSmoh)
      : null
  const engineReplacementCost = listedEngineReplacementCost ?? derivedEngineReplacementCost
  const possibleEngineOverhaulDate =
    pickText(raw, ["engine_overhaul_date", "last_engine_overhaul_date", "last_overhaul_date"]) ??
    pickText(engineValueData, ["last_overhaul_date"])
  const currentYear = new Date().getFullYear()
  const showEngineCalendarWarning =
    typeof listingRow.year === "number" &&
    Number.isFinite(listingRow.year) &&
    currentYear - listingRow.year >= 10 &&
    !possibleEngineOverhaulDate
  const engineModelText =
    cleanEngineModelText(
      pickText(raw, ["engine_model", "faa_engine_model_detail"]) ||
        descriptionIntelligence.engineModel ||
        parsedDescription.engineModel
    )
  const serialNumberText =
    pickText(raw, ["serial_number", "faa_serial_number_detail", "serial_no", "serial"]) ||
    cleanParsedText(listingRow.serial_number)
  const faaEngineManufacturer = pickText(raw, ["faa_engine_manufacturer_detail"])
  const engineManufacturerText =
    faaEngineManufacturer ||
    pickText(raw, ["engine_manufacturer", "engine_make"]) ||
    inferEngineManufacturerFromModel(engineModelText)
  const faaTypeEngine = pickText(raw, ["faa_type_engine_detail"])
  const normalizedEngineType = normalizeEngineTypeLabel(faaTypeEngine, engineModelText, engineManufacturerText)
  const faaAirworthinessCategory = pickText(raw, ["faa_airworthiness_category_detail"])
  const faaAirworthinessClassification = pickText(raw, ["faa_airworthiness_classification_detail"])
  const faaAirworthinessDate = pickText(raw, ["faa_aw_date_detail"])
  const avionicsList = parsedDescription.avionicsDisplayLines.length
    ? parsedDescription.avionicsDisplayLines
    : mergeAvionicsItems(
        parsedDescription.avionicsList,
        descriptionIntelligence.avionics,
        avionicsMatchedItems.map((item) => toTitleCase(item.label))
      )
  const avionicsText = pickText(raw, ["avionics_notes", "avionics_description"]) || parsedDescription.avionics
  const conditionText = pickText(raw, ["condition", "listing_condition", "aircraft_condition"]) || parsedDescription.condition
  const marketOpportunityScore = pickNumber(raw, ["market_opportunity_score"]) ?? listingRow.market_opportunity_score
  const conditionScore = pickNumber(raw, ["condition_score"]) ?? listingRow.condition_score
  const executionScore = pickNumber(raw, ["execution_score"]) ?? listingRow.execution_score
  const investmentScore = pickNumber(raw, ["investment_score"]) ?? listingRow.investment_score
  const pricingConfidence = pickText(raw, ["pricing_confidence"]) ?? listingRow.pricing_confidence
  const compSelectionTier = pickText(raw, ["comp_selection_tier"]) ?? listingRow.comp_selection_tier
  const compUniverseSize = pickNumber(raw, ["comp_universe_size"]) ?? listingRow.comp_universe_size
  const compExactCount = pickNumber(raw, ["comp_exact_count"]) ?? listingRow.comp_exact_count
  const compFamilyCount = pickNumber(raw, ["comp_family_count"]) ?? listingRow.comp_family_count
  const compMakeCount = pickNumber(raw, ["comp_make_count"]) ?? listingRow.comp_make_count
  const compMedianPrice = pickNumber(raw, ["comp_median_price"]) ?? listingRow.comp_median_price
  const compP25Price = pickNumber(raw, ["comp_p25_price"]) ?? listingRow.comp_p25_price
  const compP75Price = pickNumber(raw, ["comp_p75_price"]) ?? listingRow.comp_p75_price
  const mispricingZscore = pickNumber(raw, ["mispricing_zscore"]) ?? listingRow.mispricing_zscore
  const scoreBreakdown = deriveScoreBreakdown({
    listing: listingRow,
    marketOpportunityScore,
    conditionScore,
    executionScore,
    investmentScore,
  })
  const scoreColor = getScoreColor(scoreBreakdown.primaryScore)
  const primaryImageUrl = typeof listingRow.primary_image_url === "string" ? listingRow.primary_image_url.trim() : ""
  const galleryUrls = primaryImageUrl
    ? imageUrls.filter((url) => url !== primaryImageUrl)
    : imageUrls
  const logbookUrls = collectLinkUrls(raw, "logbook_urls")
  const scoreExplanation = collectTextList(raw, "score_explanation")
  const dataConfidence = pickText(raw, ["data_confidence"])
  const dealComparisonSource = pickText(raw, ["deal_comparison_source"]) || listingRow.deal_comparison_source
  const resolvedAskingPrice = resolveAskingPrice(listingRow, raw)
  const detailDealTierRaw = pickText(raw, ["deal_tier"]) || listingRow.deal_tier
  const hasDisclosedListPrice = typeof resolvedAskingPrice === "number" && resolvedAskingPrice > 0
  const displayDealTier = hasDisclosedListPrice ? detailDealTierRaw : null
  const fractionalPricingContext = descriptionIntelligence.pricingContext
  const fractionalBreakdown = resolveFractionalBreakdown(raw, fractionalPricingContext, resolvedAskingPrice)
  const fractionalPricingNote = buildFractionalPricingNote(fractionalBreakdown)
  let marketPricing: Awaited<ReturnType<typeof getSimilarMarketPricing>> = null
  try {
    marketPricing = await getSimilarMarketPricing(listingRow.make, listingRow.model, listingRow.year)
  } catch (error) {
    console.error("[listings/[id]] market pricing lookup failed", {
      id,
      make: listingRow.make,
      model: listingRow.model,
      year: listingRow.year,
      error,
    })
  }
  const effectiveCompSource = resolveCompSource(dealComparisonSource, marketPricing?.sampleSize ?? null)
  const effectiveDataConfidence = resolveDataConfidence(dataConfidence, listingRow, resolvedAskingPrice, marketPricing?.sampleSize ?? null)
  const scoreMethodSummary = buildScoreMethodSummary(
    scoreBreakdown,
    effectiveDataConfidence,
    pricingConfidence,
    effectiveCompSource,
    scoreExplanation.length
  )
  const confidenceSignals = buildConfidenceSignals(listingRow, resolvedAskingPrice, marketPricing?.sampleSize ?? null, dataConfidence)
  let priceHistoryRaw: Awaited<ReturnType<typeof getListingPriceHistory>> = []
  try {
    priceHistoryRaw = await getListingPriceHistory(listingRow.source, listingRow.source_id, 730)
  } catch (error) {
    console.error("[listings/[id]] price history lookup failed", {
      id,
      source: listingRow.source,
      sourceId: listingRow.source_id,
      error,
    })
  }
  const priceHistory = normalizePriceHistory(priceHistoryRaw)
  const priceHistoryStats = buildPriceHistoryStats(priceHistory)
  const priceHistoryChart = buildPriceHistoryChart(priceHistory)
  const detectedStcs = collectKeyValueList(raw, "stc_modifications")
  const hasGlassCockpit = toBool(raw, "has_glass_cockpit")
  const isSteamGauge = toBool(raw, "is_steam_gauge")
  const installedAvionicsValue = pickNumber(raw, ["avionics_installed_value"]) ?? listingRow.avionics_installed_value
  const stcPremiumTotal = pickNumber(raw, ["stc_market_value_premium_total"])
  const faaOwner = pickText(raw, ["faa_owner"])
  const faaRegisteredOwnerName = pickText(raw, ["faa_registered_owner_name", "faa_owner"])
  const faaRegisteredOwnerStreet = pickText(raw, ["faa_registered_owner_street"])
  const faaRegisteredOwnerCounty = pickText(raw, ["faa_registered_owner_county"])
  const faaRegisteredOwnerZip = pickText(raw, ["faa_registered_owner_zip"])
  const faaRegisteredOwnerCountry = pickText(raw, ["faa_registered_owner_country"])
  const faaTypeRegistration = pickText(raw, ["faa_type_registration_detail"])
  const faaDealer = pickText(raw, ["faa_dealer_detail"])
  const faaStatusCodeDetail = pickText(raw, ["faa_status_code_detail", "faa_status"])
  const faaCertIssueDateDetail = pickText(raw, ["faa_cert_issue_date_detail", "faa_cert_date"])
  const faaExpirationDateDetail = pickText(raw, ["faa_expiration_date_detail"])
  const faaModeSBase8 = pickText(raw, ["faa_mode_s_code_base8"])
  const faaModeSBase16 = pickText(raw, ["faa_mode_s_code_base16"])
  const faaStatus = pickText(raw, ["faa_status"])
  const faaCertDate = pickText(raw, ["faa_cert_date"])
  const faaCity = pickText(raw, ["faa_city"])
  const faaState = pickText(raw, ["faa_state"])
  const faaSeats = pickNumber(raw, ["faa_num_seats"])
  const faaEngines = pickNumber(raw, ["faa_num_engines"])
  const faaHorsepower = pickNumber(raw, ["faa_engine_horsepower"])
  const faaCruise = pickNumber(raw, ["faa_cruising_speed"])
  const faaWeight = pickNumber(raw, ["faa_aircraft_weight"])
  const hasFaaSnapshot = Boolean(
    faaMatched ||
      faaOwner ||
      faaStatus ||
      faaCertDate ||
      faaCity ||
      faaState ||
      faaRegisteredOwnerName ||
      faaRegisteredOwnerStreet ||
      faaRegisteredOwnerCounty ||
      faaRegisteredOwnerZip ||
      faaRegisteredOwnerCountry ||
      faaStatusCodeDetail ||
      faaCertIssueDateDetail ||
      faaExpirationDateDetail ||
      faaTypeRegistration ||
      faaDealer ||
      faaModeSBase8 ||
      faaModeSBase16 ||
      faaEngineManufacturer ||
      faaTypeEngine ||
      faaAirworthinessCategory ||
      faaAirworthinessClassification ||
      faaAirworthinessDate ||
      typeof faaSeats === "number" ||
      typeof faaEngines === "number" ||
      typeof faaHorsepower === "number" ||
      typeof faaCruise === "number" ||
      typeof faaWeight === "number"
  )
  const faaLookupUrl = nNumber !== "—"
    ? `https://registry.faa.gov/aircraftinquiry/Search/NNumberResult?nNumberTxt=${encodeURIComponent(nNumber.replace(/^N/i, ""))}`
    : null
  const baseDeferredMaintenance =
    listingRow.deferred_total ??
    pickNumber(raw, ["deferred_total", "deferred_maintenance"]) ??
    null
  const engineOverrunLiabilityAmount =
    typeof engineOverrunLiability === "number" && engineOverrunLiability > 0
      ? engineOverrunLiability
      : 0
  const deferredMaintenanceTotal =
    (typeof baseDeferredMaintenance === "number" ? baseDeferredMaintenance : 0) +
    engineOverrunLiabilityAmount
  const trueCostEstimate = calculateTrueCost(
    resolvedAskingPrice,
    deferredMaintenanceTotal,
    listingRow.true_cost,
    engineOverrunLiabilityAmount
  )
  const scoreInputRows = buildScoreInputRows({
    listing: listingRow,
    scoreBreakdown,
    pricingConfidence,
    compInsights: {
      compSelectionTier,
      compUniverseSize,
      compExactCount,
      compFamilyCount,
      compMakeCount,
      compMedianPrice,
      compP25Price,
      compP75Price,
      mispricingZscore,
    },
    askingPrice: resolvedAskingPrice,
    trueCostEstimate,
    deferredMaintenance: deferredMaintenanceTotal,
    engineOverrunLiability: engineOverrunLiabilityAmount,
    installedAvionicsValue,
    stcPremiumTotal,
    dataConfidence: effectiveDataConfidence,
    compSource: effectiveCompSource,
    marketPricing,
  })

  const accidentHistoryValue = nNumber === "—" ? (
    <div style={{ color: "#9ca3af", fontWeight: 700 }}>Accident history unavailable (no N-number matched)</div>
  ) : hasAccidentHistory ? (
    <div>
      <div style={{ color: "#dc2626", fontWeight: 700 }}>
        {`⚠ ${accidentCount} Accident(s) Found — Most Recent: ${formatIsoDate(mostRecentAccidentDate)}, Damage: ${safeDisplay(mostSevereDamage)}`}
      </div>
      <a
        href={`https://www.ntsb.gov/Pages/AviationQueryV2.aspx?NNumber=${encodeURIComponent(nNumber)}`}
        target="_blank"
        rel="noreferrer"
      >
        Search NTSB records
      </a>
    </div>
  ) : (
    <div style={{ color: "#16a34a", fontWeight: 700 }}>✓ No NTSB Accidents on Record</div>
  )
  const verificationFlags = buildVerificationFlags({
    nNumber,
    registrationAlert,
    hasFaaSnapshot,
    listingState: listingRow.location_state,
    faaState,
  })
  const aircraftRows: Array<[string, ReactNode]> = [
    ["Year", safeDisplay(listingRow.year)],
    ["Make", safeDisplay(listingRow.make)],
    ["Model", safeDisplay(listingRow.model)],
    ["Serial Number", safeDisplay(serialNumberText)],
    ["N-Number", safeDisplay(listingRow.n_number)],
    ["Location", safeDisplay(listingRow.location_label)],
    ["Condition", safeDisplay(conditionText)],
  ]
  const engineRows: Array<[string, ReactNode]> = []
  const pushEngineRow = (label: string, rawValue: unknown, rendered: ReactNode) => {
    if (!hasDisplayValue(rawValue)) return
    engineRows.push([label, rendered])
  }
  pushEngineRow("Total Time", totalTimeHours, safeDisplay(formatHours(totalTimeHours)))
  pushEngineRow("Engine Time", engineSmohHours, safeDisplay(formatHours(engineSmohHours)))
  pushEngineRow("Cylinders Since New", parsedCylinderHours, safeDisplay(formatHours(parsedCylinderHours)))
  pushEngineRow("Engine TBO", engineTboHours, safeDisplay(formatHours(engineTboHours)))
  pushEngineRow("Engine Manufacturer", engineManufacturerText, safeDisplay(engineManufacturerText))
  pushEngineRow("Engine Model", engineModelText, safeDisplay(engineModelText))
  pushEngineRow("Last Annual", parsedLastAnnual, safeDisplay(parsedLastAnnual))
  pushEngineRow("Engine Type", normalizedEngineType, safeDisplay(normalizedEngineType))
  if (avionicsList.length > 0 || hasDisplayValue(avionicsText)) {
    engineRows.push(["Avionics", renderAvionicsValue(avionicsList, avionicsText)])
  }
  const airworthyText = formatAirworthy(raw, parsedDescription)
  if (hasDisplayValue(airworthyText) && airworthyText !== "Unknown") {
    engineRows.push(["Airworthy", safeDisplay(airworthyText, { unknownAsDash: true })])
  }
  const faaRows: Array<[string, ReactNode]> = [
    ["N-Number", safeDisplay(nNumber)],
    ["FAA Match", faaMatched ? "Matched" : hasFaaSnapshot ? "Partial" : "Pending enrich"],
    ["FAA Status", safeDisplay(faaStatusCodeDetail || faaStatus)],
    ["Registration Alert", safeDisplay(registrationAlert)],
    ["Registered Owner", safeDisplay(faaRegisteredOwnerName || faaOwner)],
    ["Owner Street", safeDisplay(faaRegisteredOwnerStreet)],
    ["Owner City / State", safeDisplay([faaCity, faaState].filter(Boolean).join(", "))],
    ["Owner County / ZIP", safeDisplay([faaRegisteredOwnerCounty, faaRegisteredOwnerZip].filter(Boolean).join(" / "))],
    ["Owner Country", safeDisplay(faaRegisteredOwnerCountry)],
    ["Type Registration", safeDisplay(faaTypeRegistration)],
    ["Dealer", safeDisplay(faaDealer)],
    ["FAA Cert Date", safeDisplay(formatIsoDate(faaCertIssueDateDetail || faaCertDate))],
    ["Expiration Date", safeDisplay(formatIsoDate(faaExpirationDateDetail))],
    ["Seats / Engines", safeDisplay(formatSeatsEngines(faaSeats, faaEngines))],
    ["Engine HP", safeDisplay(typeof faaHorsepower === "number" ? `${faaHorsepower} hp` : null)],
    ["Cruise Speed", safeDisplay(typeof faaCruise === "number" ? `${faaCruise} kt` : null)],
    ["Aircraft Weight", safeDisplay(typeof faaWeight === "number" ? `${faaWeight.toLocaleString("en-US")} lb` : null)],
    ["Mode S (Oct / Hex)", safeDisplay([faaModeSBase8, faaModeSBase16].filter(Boolean).join(" / "))],
    ["Accident History", accidentHistoryValue],
  ]
  const pillarNotes = buildPillarNotes(scoreExplanation)
  const evPctRaw = pickNumber(raw, ["ev_pct_life_remaining"])
  let engineLifePct = normalizeEngineLifePercent(evPctRaw)
  if (
    engineLifePct === null &&
    typeof engineHoursSmoh === "number" &&
    typeof engineTboHours === "number" &&
    engineTboHours > 0
  ) {
    engineLifePct = Math.max(0, Math.min(100, (1 - engineHoursSmoh / engineTboHours) * 100))
  }
  const engineQuickValue =
    typeof engineHoursSmoh === "number"
      ? `${Math.round(engineHoursSmoh).toLocaleString("en-US")} SMOH${
          engineLifePct !== null ? ` · ${Math.round(engineLifePct)}% life` : ""
        }`
      : "—"
  const engineQuickTone: "default" | "good" | "warn" =
    typeof engineHoursSmoh === "number" && engineLifePct !== null && engineLifePct < 22.5
      ? "warn"
      : typeof engineHoursSmoh === "number" && engineLifePct !== null && engineLifePct >= 50
        ? "good"
        : "default"
  const intelligenceVersion = pickText(raw, ["intelligence_version"]) || listingRow.intelligence_version || null
  const vsMedianPrice = listingRow.vs_median_price ?? pickNumber(raw, ["vs_median_price"])
  const percentileLabel =
    typeof vsMedianPrice === "number" && Number.isFinite(vsMedianPrice) && vsMedianPrice !== 0
      ? `${vsMedianPrice < 0 ? "Below" : "Above"} active comp median by ${formatMoney(Math.abs(vsMedianPrice))}`
      : null
  const marketMedianLabel =
    marketPricing && typeof marketPricing.median === "number"
      ? `Similar listings median ${formatMoney(marketPricing.median)} (n=${marketPricing.sampleSize})`
      : typeof compMedianPrice === "number"
        ? `Comp set median ${formatMoney(compMedianPrice)}`
        : null
  const heroImageUrls = [
    ...new Set(
      [String(primaryImageUrl || "").trim(), ...galleryUrls.map((value) => String(value || "").trim())].filter(Boolean)
    ),
  ]
  const sourceMetaLine = [listingRow.source, listingRow.source_id ? `#${listingRow.source_id}` : null]
    .filter(Boolean)
    .join(" · ")
  const identityQuickStats = [
    {
      label: "TTAF",
      value: typeof totalTimeHours === "number" ? `${Math.round(totalTimeHours).toLocaleString("en-US")} h` : "—",
    },
    { label: "Engine", value: engineQuickValue, tone: engineQuickTone },
    {
      label: "DOM",
      value: typeof listingRow.days_on_market === "number" ? `${Math.round(listingRow.days_on_market).toLocaleString("en-US")} d` : "—",
    },
    { label: "Annual", value: parsedLastAnnual ? String(parsedLastAnnual) : "—" },
  ]

  const lastAnnualForLlp = parsedLastAnnual ? String(parsedLastAnnual) : null
  const llpRows = buildListingLlpRows({
    lastAnnualText: lastAnnualForLlp,
    make: listingRow.make,
    model: listingRow.model,
  })
  const annualAirframe = annualStatusDisplay(lastAnnualForLlp)
  const makeModelLine = [listingRow.make, listingRow.model].filter(Boolean).join(" ").trim() || "—"
  const registrationAirframeNode = registrationAlert ? (
    <span className="text-red-400">
      {safeDisplay(listingRow.n_number || nNumber)} — {registrationAlert}
    </span>
  ) : (
    safeDisplay(listingRow.n_number || nNumber)
  )
  const airframeSpecRows: Array<[string, ReactNode]> = [
    ["Year", safeDisplay(listingRow.year)],
    ["Make & Model", makeModelLine],
    ["Serial Number", safeDisplay(serialNumberText)],
    ["Registration", registrationAirframeNode],
    ["Total Time (TTAF)", safeDisplay(formatHours(totalTimeHours))],
    ["FAA Registered Owner", safeDisplay(faaRegisteredOwnerName || faaOwner)],
    ["FAA Cert Issued", safeDisplay(formatIsoDate(faaCertIssueDateDetail || faaCertDate))],
    ["Aircraft / Engine Type", safeDisplay(normalizedEngineType || engineModelText || "—")],
    [
      "Annual Status",
      <span key="annual-airframe" className={annualAirframe.ok ? "text-[#22c55e]" : "text-amber-500"}>
        {annualAirframe.label}
      </span>,
    ],
  ]
  const faaModelCode =
    pickText(raw, ["faa_aircraft_mfr_mdl_code", "faa_mfr_mdl_code", "mfr_mdl_code", "faa_model_code"]) || null
  const faaCompactRows: Array<[string, ReactNode]> = [
    ["N-Number", safeDisplay(nNumber)],
    ["FAA Status", safeDisplay(faaStatusCodeDetail || faaStatus)],
    ["Year Manufactured", safeDisplay(listingRow.year)],
    ["Cert Issued", safeDisplay(formatIsoDate(faaCertIssueDateDetail || faaCertDate))],
    ["Registered Owner", safeDisplay(faaRegisteredOwnerName || faaOwner)],
    ["FAA Engine Type", safeDisplay(faaTypeEngine || engineModelText)],
    ["MFR Model Code", safeDisplay(faaModelCode)],
  ]
  const faaFullTable = (
    <table className="detail-table">
      <tbody>
        {faaRows.map(([label, value]) => (
          <tr key={label}>
            <th scope="row">{label}</th>
            <td>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
  const faaSidebarVerified = Boolean(faaMatched && !registrationAlert && hasFaaSnapshot)
  const medianCompForBody =
    typeof compMedianPrice === "number" && compMedianPrice > 0
      ? compMedianPrice
      : marketPricing && typeof marketPricing.median === "number"
        ? marketPricing.median
        : null
  const compUniverseCountBody = Math.max(
    0,
    Math.round(
      typeof compUniverseSize === "number" && compUniverseSize > 0
        ? compUniverseSize
        : typeof compExactCount === "number" && compExactCount > 0
          ? compExactCount
          : marketPricing?.sampleSize ?? 0
    )
  )
  const compSampleLabelBody =
    marketPricing && typeof marketPricing.sampleSize === "number"
      ? `Similar listings (n=${marketPricing.sampleSize})`
      : typeof compUniverseSize === "number" && compUniverseSize > 0
        ? `Comp universe ~${Math.round(compUniverseSize)}`
        : "From comparable set"
  const parserVersionFootnote =
    pickText(raw, ["description_parser_version", "parser_version", "avionics_parser_version"]) || null
  const lastUpdatedFootnote = formatIsoDate(listingRow.last_seen_date)
  const sourceFootnoteLabel = listingRow.source || "Multiple sources"

  const canonicalUrl = toAbsoluteUrl(`/listings/${id}`)
  const listingDisplayName = titleText || "Aircraft Listing"
  const detailJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: toAbsoluteUrl("/") },
          { "@type": "ListItem", position: 2, name: "Listings", item: toAbsoluteUrl("/listings") },
          { "@type": "ListItem", position: 3, name: listingDisplayName, item: canonicalUrl },
        ],
      },
      {
        "@type": "Product",
        name: listingDisplayName,
        url: canonicalUrl,
        sku: listingRow.source_id || listingRow.id,
        ...(listingRow.make ? { brand: { "@type": "Brand", name: listingRow.make } } : {}),
        ...(descriptionText ? { description: descriptionText.slice(0, 5000) } : {}),
        ...(imageUrls.length ? { image: imageUrls.slice(0, 8) } : {}),
        ...(typeof resolvedAskingPrice === "number" && resolvedAskingPrice > 0
          ? {
              offers: {
                "@type": "Offer",
                priceCurrency: "USD",
                price: resolvedAskingPrice,
                url: canonicalUrl,
                availability:
                  listingRow.is_active === false
                    ? "https://schema.org/OutOfStock"
                    : "https://schema.org/InStock",
              },
            }
          : {}),
      },
    ],
  }

  return (
    <main className="container max-w-full overflow-x-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(detailJsonLd) }}
      />
      <Link
        href={backToListingsHref}
        className="mb-4 flex min-h-[44px] max-w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground md:hidden"
      >
        ← Back to listings
      </Link>
      <p className="mb-4 hidden md:block">
        <Link href={backToListingsHref}>← Back to listings</Link>
      </p>

      <div className="fh-detail-shell mx-auto max-w-[1280px] px-4 pb-2 sm:px-5 lg:grid lg:grid-cols-[1fr_380px] lg:gap-6 lg:px-6">
        <div className="mb-6 min-w-0 overflow-hidden rounded-xl border border-[var(--brand-dark)] shadow-sm lg:mb-0 [data-theme=light]:border-slate-200">
          <ListingImageGallery
            title={listingRow.title || "Aircraft listing"}
            imageUrls={heroImageUrls}
            dealTier={displayDealTier}
            priceUndisclosed={!hasDisclosedListPrice}
            fallbackImageUrl={fallbackImageUrl}
            layoutVariant="detailHero"
          />
          <ListingIdentityBar
            title={titleText}
            nNumber={nNumber}
            location={listingRow.location_label || null}
            metaLine={sourceMetaLine || null}
            fractionalRow={
              fractionalBreakdown.isFractional ? (
                <div className="fractional-chip-row mb-1">
                  <span className="fractional-chip">Fractional Ownership</span>
                  {fractionalBreakdown.shareLabel ? (
                    <span className="fractional-chip-detail">{fractionalBreakdown.shareLabel}</span>
                  ) : null}
                </div>
              ) : null
            }
            stats={identityQuickStats}
          />
        </div>

        <div className="mb-6 min-w-0 lg:mb-0">
          <ListingScoreHeroCards
            dealTier={displayDealTier}
            primaryScore={hasDisclosedListPrice ? scoreBreakdown.primaryScore : null}
            primaryLabel={scoreBreakdown.primaryLabel}
            scoreColor={scoreColor}
            formatScore={formatScore}
            safeDisplay={safeDisplay}
            intelligenceVersion={intelligenceVersion}
            percentileLabel={percentileLabel}
            askingPrice={resolvedAskingPrice}
            formatMoney={formatMoney}
            priceReduced={listingRow.price_reduced === true}
            priceReductionAmount={listingRow.price_reduction_amount ?? null}
            daysOnMarket={listingRow.days_on_market ?? null}
            marketMedianLabel={marketMedianLabel}
            trueCostEstimate={trueCostEstimate}
            deferredMaintenanceTotal={deferredMaintenanceTotal}
            marketScore={scoreBreakdown.marketScore}
            conditionScore={scoreBreakdown.conditionScore}
            executionScore={scoreBreakdown.executionScore}
            pillarNotes={pillarNotes}
          />
        </div>

        <div className="detail-grid-left min-w-0 lg:col-start-1">
          <ListingDetailBodySections
            listingId={id}
            faaMatched={faaMatched}
            airframeRows={airframeSpecRows}
            engineLifePercent={engineLifePct}
            engineModelText={engineModelText || "—"}
            engineValuePanel={{
              remainingValue: engineRemainingValue,
              overrunLiability: engineOverrunLiabilityAmount > 0 ? engineOverrunLiabilityAmount : null,
              reservePerHour: engineReservePerHour,
              hoursSmoh: engineHoursSmoh,
              tboHours: typeof engineTboHours === "number" ? engineTboHours : null,
              replacementCost: engineReplacementCost,
              dataQuality: engineDataQuality,
              explanation: engineValueExplanation,
              tboReferenceLine: engineTboReferenceLine,
              showCalendarWarning: showEngineCalendarWarning,
            }}
            formatMoney={formatMoney}
            formatHours={formatHours}
            avionicsScore={listingRow.avionics_score}
            installedAvionicsValue={installedAvionicsValue}
            avionicsMatchedItems={avionicsMatchedItems}
            detectedStcs={detectedStcs}
            panelTypeLabel={hasGlassCockpit ? "Glass" : isSteamGauge ? "Steam" : "Mixed / Unknown"}
            isSteamGauge={isSteamGauge}
            toTitleCase={toTitleCase}
            llpRows={llpRows}
            deferredMaintenanceTotal={deferredMaintenanceTotal}
            askingPrice={resolvedAskingPrice}
            medianCompPrice={medianCompForBody}
            compSampleLabel={compSampleLabelBody}
            compUniverseCount={compUniverseCountBody}
            descriptionText={descriptionText}
            sourceUrl={sourceUrl}
            sourceLinkLabel={sourceLinkLabel}
            logbookUrls={logbookUrls}
          />
        </div>
        <div className="detail-grid-right flex min-w-0 flex-col gap-4 lg:col-start-2">
          <ListingDetailSidebarSections
            dealDeskHref={`/internal/deal-desk/${id}`}
            aircraftLabel={dealDeskAircraftLabel}
            faaVerified={faaSidebarVerified}
            faaCompactRows={faaCompactRows}
            faaLookupUrl={faaLookupUrl}
            verificationFlags={verificationFlags}
            faaFullTable={faaFullTable}
            sellerBadge={faaDealer && String(faaDealer).trim() ? "Dealer listing" : "Private / broker"}
            sellerHeadline={
              [listingRow.source, listingRow.source_id ? `#${listingRow.source_id}` : null].filter(Boolean).join(" ") ||
              "Listing source"
            }
            sellerLocation={listingRow.location_label}
            sourceUrl={sourceUrl}
            sourceLinkLabel={sourceLinkLabel}
            scoreExplanation={scoreExplanation}
            renderScoreExplanationItem={renderScoreExplanationItem}
            footnote={{
              sourceLabel: sourceFootnoteLabel,
              intelligenceVersion,
              parserVersion: parserVersionFootnote,
              lastUpdated: lastUpdatedFootnote,
            }}
          />
          <RightDetailColumn
            listingId={id}
            askingPrice={resolvedAskingPrice}
            marketPricing={marketPricing}
            formatMoney={formatMoney}
            scoreColor={scoreColor}
            primaryScore={scoreBreakdown.primaryScore}
            primaryLabel={scoreBreakdown.primaryLabel}
            formatScore={formatScore}
            scoreMethodSummary={scoreMethodSummary}
            confidenceSignals={confidenceSignals}
            effectiveDataConfidence={effectiveDataConfidence}
            marketScore={scoreBreakdown.marketScore}
            conditionScore={scoreBreakdown.conditionScore}
            executionScore={scoreBreakdown.executionScore}
            compExactCount={compExactCount}
            compFamilyCount={compFamilyCount}
            compMakeCount={compMakeCount}
            riskBadgeClass={getRiskClass(listingRow.risk_level)}
            riskLabel={listingRow.risk_level || "UNKNOWN"}
            scoreInputRows={scoreInputRows}
            pricingConfidence={pricingConfidence}
            compSelectionTier={compSelectionTier}
            formatCompTier={formatCompTier}
            scoreExplanation={scoreExplanation}
            renderScoreExplanationItem={renderScoreExplanationItem}
            showAvionicsPanel={avionicsMatchedItems.length > 0 || detectedStcs.length > 0 || typeof installedAvionicsValue === "number"}
            installedAvionicsValue={installedAvionicsValue}
            avionicsScore={listingRow.avionics_score}
            stcPremiumTotal={stcPremiumTotal}
            panelTypeLabel={hasGlassCockpit ? "Glass" : isSteamGauge ? "Steam" : "Mixed / Unknown"}
            avionicsMatchedItems={avionicsMatchedItems}
            detectedStcs={detectedStcs}
            toTitleCase={toTitleCase}
            isSteamGauge={isSteamGauge}
            priceHistory={priceHistory}
            priceHistoryStats={priceHistoryStats}
            priceHistoryChart={priceHistoryChart}
            formatIsoDate={formatIsoDate}
            safeDisplay={safeDisplay}
            showFaaSnapshot={nNumber !== "—" || hasFaaSnapshot || Boolean(registrationAlert)}
            verificationFlags={verificationFlags}
            faaRows={faaRows}
            faaLookupUrl={faaLookupUrl}
            hideAskingPriceInComps
            suppressDuplicateHeroScores
            phase3SecondaryColumn
          />
        </div>
      </div>
      {fractionalPricingNote ? (
        <p className="fractional-pricing-note mx-auto max-w-[1280px] px-4 sm:px-5 lg:px-6">{fractionalPricingNote}</p>
      ) : null}

      <style>{`
        .fractional-pricing-note {
          margin: -8px 0 14px;
          color: #f5d284;
          font-size: 0.95rem;
        }
        .fractional-chip-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .fractional-chip {
          display: inline-flex;
          align-items: center;
          border: 1px solid #ff9900;
          background: #141922;
          color: #ff9900;
          border-radius: 999px;
          padding: 4px 10px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.01em;
        }
        .fractional-chip-detail {
          color: #d1d5db;
          font-size: 12px;
        }
        .panel,
        .table-card {
          background: #161d28;
          border: 1px solid #3a4454;
          border-radius: 12px;
          padding: 1rem;
        }
        .panel-stack {
          display: grid;
          gap: 1rem;
        }
        .hero-image {
          width: 100%;
          border-radius: 10px;
          display: block;
          object-fit: cover;
          border: 1px solid #3a4454;
          min-height: 260px;
          max-height: 420px;
        }
        .hero-placeholder {
          background: #141922;
          display: grid;
          place-items: center;
          color: #5e5e5e;
        }
        .hero-placeholder svg {
          width: 64px;
          height: 64px;
        }
        .image-gallery-grid {
          margin-top: 0.8rem;
          display: grid;
          gap: 0.6rem;
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
        .gallery-thumb {
          width: 100%;
          height: 88px;
          border-radius: 8px;
          object-fit: cover;
          border: 1px solid #3a4454;
        }
        .button-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-top: 0.2rem;
          background: #ff9900;
          color: #101010;
          padding: 0.65rem 1rem;
          border-radius: 8px;
          font-weight: 700;
          text-decoration: none;
        }
        .button-link:hover {
          background: #af4d27;
          color: #ffffff;
        }
        .score-badge {
          width: 176px;
          max-width: 100%;
          min-height: 82px;
          border-radius: 999px;
          border: 3px solid;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0;
          margin-top: 0.2rem;
          padding: 0.6rem 0.8rem;
          background: #141922;
        }
        .score-readout {
          display: flex;
          align-items: baseline;
          justify-content: center;
          gap: 0.3rem;
          text-align: center;
        }
        .score-value {
          font-size: 2rem;
          font-weight: 800;
          line-height: 1;
        }
        .score-max {
          font-size: 0.9rem;
          color: var(--brand-muted);
          font-weight: 600;
        }
        .score-guidance {
          margin: 0.2rem 0 0.45rem;
          color: var(--brand-muted);
          font-size: 0.82rem;
          line-height: 1.35;
        }
        .score-band-list {
          margin: 0.2rem 0 0.45rem;
          padding-left: 1.1rem;
          color: var(--brand-muted);
          font-size: 0.8rem;
          line-height: 1.35;
        }
        .score-band-list li {
          margin-bottom: 0.18rem;
        }
        .score-method {
          margin: 0 0 0.6rem;
          color: var(--brand-muted);
          font-size: 0.8rem;
          line-height: 1.35;
        }
        .score-method-list {
          margin: 0 0 0.6rem;
          padding-left: 1rem;
          color: var(--brand-muted);
          font-size: 0.8rem;
          line-height: 1.4;
          display: grid;
          gap: 0.2rem;
        }
        .score-notes {
          margin: 0 0 0.6rem;
          border: 1px solid var(--brand-dark);
          border-radius: 8px;
          padding: 0.42rem 0.55rem;
          background: var(--surface-muted);
          font-size: 0.78rem;
          color: var(--brand-muted);
        }
        .score-notes summary {
          cursor: pointer;
          color: var(--brand-white);
          font-weight: 600;
        }
        .score-notes ul {
          margin: 0.4rem 0 0;
          padding-left: 1rem;
        }
        .score-notes li {
          margin-bottom: 0.2rem;
        }
        .score-inputs-wrap {
          margin-top: 0.7rem;
        }
        .score-inputs-title {
          margin: 0 0 0.35rem;
          color: #ff9900;
          font-size: 0.9rem;
        }
        .score-inputs-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.82rem;
          background: #141922;
          border: 1px solid #3a4454;
          border-radius: 8px;
          overflow: hidden;
        }
        .score-inputs-table th,
        .score-inputs-table td {
          text-align: left;
          padding: 0.42rem 0.5rem;
          border-bottom: 1px solid #313d4f;
          vertical-align: top;
        }
        .score-inputs-table tr:last-child th,
        .score-inputs-table tr:last-child td {
          border-bottom: none;
        }
        .score-inputs-table th {
          width: 45%;
          color: var(--brand-muted);
          font-weight: 600;
        }
        .score-inputs-table td {
          color: var(--brand-white);
          font-weight: 700;
        }
        .badge {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 0.35rem 0.7rem;
          font-size: 0.82rem;
          font-weight: 700;
          letter-spacing: 0.04em;
        }
        .risk-low {
          background: #ff990022;
          border: 1px solid #ff9900;
          color: #ff9900;
        }
        .risk-moderate {
          background: #af4d2722;
          border: 1px solid #af4d27;
          color: #af4d27;
        }
        .risk-high {
          background: #d9770622;
          border: 1px solid #d97706;
          color: #d97706;
        }
        .risk-critical {
          background: #dc262622;
          border: 1px solid #dc2626;
          color: #dc2626;
        }
        .score-none {
          background: var(--surface-muted);
          border: 1px solid var(--brand-dark);
          color: var(--brand-muted);
        }
        .price-history-metrics {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 0.5rem;
        }
        .price-history-metrics > div {
          border: 1px solid #3a4454;
          border-radius: 8px;
          padding: 0.5rem;
          background: #141922;
        }
        .metric-label {
          font-size: 0.75rem;
          color: var(--brand-muted);
          margin-top: 0.2rem;
        }
        .price-chart-wrap {
          margin-top: 0.7rem;
          border: 1px solid #3a4454;
          border-radius: 8px;
          padding: 0.45rem;
          background: #141922;
        }
        .price-chart {
          width: 100%;
          height: 74px;
          display: block;
        }
        .avionics-inline-list {
          margin: 0;
          padding: 0.1rem 0;
          display: grid;
          gap: 0.2rem;
          white-space: normal;
        }
        .avionics-inline-line {
          margin: 0;
          font-weight: 700;
          color: #ffffff;
          line-height: 1.35;
          word-break: break-word;
        }
        .avionics-inline-line.heading {
          color: #e5e7eb;
          font-weight: 800;
        }
        .avionics-inline-line.subheading {
          margin-top: 0.2rem;
          color: #d1d5db;
          font-weight: 800;
        }
        .avionics-inline-line.item {
          padding-left: 0.55rem;
        }
        .avionics-inline-list.legacy {
          display: grid;
          gap: 0.2rem;
        }
        @media (max-width: 980px) {
          .price-history-metrics {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
      `}</style>
    </main>
  )
}

function formatAirworthy(raw: UnknownRow, parsedDescription?: ParsedSellerDescription): string {
  const boolValue = raw?.is_airworthy
  if (typeof boolValue === "boolean") return boolValue ? "Yes" : "No"
  const text = pickText(raw, ["airworthy"])
  if (!text && parsedDescription?.airworthy) return parsedDescription.airworthy
  return text || "Unknown"
}

function parseUnknownRecord(row: UnknownRow, keys: string[]): Record<string, unknown> | null {
  for (const key of keys) {
    const value = row && typeof row === "object" ? (row as Record<string, unknown>)[key] : null
    if (!value) continue
    if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value) as unknown
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>
        }
      } catch {
        // Ignore invalid JSON values from heterogeneous payloads.
      }
    }
  }
  return null
}

function normalizeTboReferenceLine(value: string | null): string | null {
  if (!value) return null
  const compact = value.replace(/\s+/g, " ").trim()
  if (!compact) return null
  const firstSentence = compact.split(".")[0]?.trim() ?? compact
  return firstSentence.length > 160 ? `${firstSentence.slice(0, 157)}...` : firstSentence
}

function normalizeEngineTypeLabel(
  faaTypeEngine: string | null,
  engineModel: string | null,
  engineManufacturer: string | null
): string | null {
  const model = (engineModel || "").toLowerCase()
  const manufacturer = (engineManufacturer || "").toLowerCase()
  const faaRaw = (faaTypeEngine || "").trim()
  const faa = faaRaw.toLowerCase()

  if (model.includes("rotax") || manufacturer.includes("rotax")) return "Rotax"
  if (faa.includes("rotax")) return "Rotax"

  const numericType = /^\d+$/.test(faaRaw) ? Number(faaRaw) : null
  if (numericType !== null) {
    if ([1, 7, 8].includes(numericType)) return "Piston"
    if ([2, 3, 4, 5, 6].includes(numericType)) return "Turbine"
  }

  if (
    faa.includes("recip") ||
    faa.includes("piston") ||
    faa.includes("4 cycle") ||
    faa.includes("4-cycle") ||
    faa.includes("2 cycle") ||
    faa.includes("2-cycle")
  ) {
    return "Piston"
  }

  if (
    faa.includes("turb") ||
    faa.includes("jet") ||
    faa.includes("shaft") ||
    faa.includes("fan") ||
    model.includes("pt6") ||
    model.includes("tpe") ||
    model.includes("m601")
  ) {
    return "Turbine"
  }

  if (faaRaw) return "?"
  return null
}

function hasDisplayValue(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === "number") return Number.isFinite(value) && value > 0
  if (typeof value === "string") {
    const clean = value.trim()
    if (!clean) return false
    if (/^(unknown|n\/a|na|none|-|--|tbd)$/i.test(clean)) return false
    return true
  }
  if (Array.isArray(value)) return value.length > 0
  return true
}

function calculateTrueCost(
  askingPrice: number | null,
  deferredTotal: number,
  trueCost: number | null,
  engineOverrunLiability: number
): number | null {
  if (typeof askingPrice !== "number") return null
  if (typeof trueCost === "number") {
    return trueCost + engineOverrunLiability
  }
  return askingPrice + deferredTotal
}

function normalizeEngineLifePercent(raw: number | null): number | null {
  if (raw === null || !Number.isFinite(raw)) return null
  if (raw >= 0 && raw <= 1) return raw * 100
  if (raw > 1 && raw <= 100) return raw
  return null
}

function resolveAnnualInspectionStatus(lastAnnualText: string | null): LlpRow["status"] {
  const t = lastAnnualText?.trim()
  if (!t) return "NOT_DISCLOSED"
  const d = Date.parse(t)
  if (!Number.isNaN(d)) {
    const months = (Date.now() - d) / (1000 * 60 * 60 * 24 * 30.44)
    return months <= 12 ? "OK" : "CHECK_DATE"
  }
  const y = new Date().getFullYear()
  const m = t.match(/20\d{2}/)
  if (m) {
    const yr = Number.parseInt(m[0], 10)
    return y - yr <= 1 ? "OK" : "CHECK_DATE"
  }
  return "CHECK_DATE"
}

function buildListingLlpRows(args: { lastAnnualText: string | null; make: string | null; model: string | null }): LlpRow[] {
  const annualStatus = resolveAnnualInspectionStatus(args.lastAnnualText)
  const rows: LlpRow[] = [
    { name: "Annual Inspection", status: annualStatus },
    { name: "Altimeter / Pitot-Static", status: "NOT_DISCLOSED" },
    { name: "Transponder / Encoder", status: "NOT_DISCLOSED" },
    { name: "ELT Battery", status: "NOT_DISCLOSED" },
    { name: "Seatbelts / 91.413", status: "NOT_DISCLOSED" },
  ]
  if (/cirrus/i.test(`${args.make ?? ""} ${args.model ?? ""}`)) {
    rows.push({ name: "Cirrus CAPS (if equipped)", status: "NOT_DISCLOSED" })
  }
  return rows
}

function annualStatusDisplay(lastAnnualText: string | null): { label: string; ok: boolean } {
  const st = resolveAnnualInspectionStatus(lastAnnualText)
  if (st === "OK") return { label: "Current (≤12 mo)", ok: true }
  if (st === "CHECK_DATE") return { label: "Check logbooks", ok: false }
  return { label: "Not disclosed", ok: false }
}

function buildPillarNotes(explanations: string[]): {
  market: string | null
  condition: string | null
  execution: string | null
} {
  const clip = (s: string) => (s.length > 140 ? `${s.slice(0, 137)}…` : s)
  let market: string | null = null
  let condition: string | null = null
  let execution: string | null = null
  for (const line of explanations) {
    const l = line.toLowerCase()
    if (!market && /market|comp|median|pricing|mispric|value vs|ask|deal/.test(l)) market = clip(line)
    else if (!condition && /condition|airframe|maintenance|engine|annual|logbook|smoh|tbo/.test(l)) condition = clip(line)
    else if (!execution && /execution|days on market|dom|price drop|reduced|seller|motivation|market time/.test(l))
      execution = clip(line)
  }
  return { market, condition, execution }
}

function resolveAskingPrice(listing: AircraftListing, raw: UnknownRow): number | null {
  const direct =
    typeof listing.price_asking === "number"
      ? listing.price_asking
      : typeof listing.asking_price === "number"
      ? listing.asking_price
      : null
  if (typeof direct === "number" && direct > 0) return direct
  return pickNumber(raw, ["asking_price", "price_asking", "price"]) ?? null
}

function resolveFractionalBreakdown(
  raw: UnknownRow,
  pricingContext: {
    isFractional: boolean
    shareNumerator: number | null
    shareDenominator: number | null
    sharePrice: number | null
    normalizedFullPrice: number | null
    reviewNeeded: boolean
    evidence: string[]
  },
  normalizedAskingPrice: number | null
) {
  const isFractionalFromColumns = toBool(raw, "is_fractional_ownership")
  const shareNumerator =
    pickNumber(raw, ["fractional_share_numerator"]) ??
    pricingContext.shareNumerator ??
    null
  const shareDenominator =
    pickNumber(raw, ["fractional_share_denominator"]) ??
    pricingContext.shareDenominator ??
    null
  const sharePrice =
    pickNumber(raw, ["fractional_share_price"]) ??
    pricingContext.sharePrice ??
    null
  const normalizedFullPrice =
    pickNumber(raw, ["fractional_full_price_estimate"]) ??
    pricingContext.normalizedFullPrice ??
    normalizedAskingPrice
  const reviewNeeded = toBool(raw, "fractional_review_needed") || pricingContext.reviewNeeded
  const isFractional = isFractionalFromColumns || pricingContext.isFractional
  const shareLabel =
    typeof shareNumerator === "number" &&
    shareNumerator > 0 &&
    typeof shareDenominator === "number" &&
    shareDenominator > 1
      ? `Share ${shareNumerator}/${shareDenominator}`
      : null

  return {
    isFractional,
    reviewNeeded,
    shareNumerator,
    shareDenominator,
    sharePrice,
    normalizedFullPrice,
    evidence: pricingContext.evidence,
    shareLabel,
  }
}

function buildFractionalPricingNote(fractional: {
  isFractional: boolean
  reviewNeeded: boolean
  shareNumerator: number | null
  shareDenominator: number | null
  sharePrice: number | null
  normalizedFullPrice: number | null
  evidence: string[]
}): string | null {
  if (fractional.isFractional) {
    const numerator = fractional.shareNumerator && fractional.shareNumerator > 0 ? fractional.shareNumerator : 1
    const denominator = fractional.shareDenominator && fractional.shareDenominator > 1 ? fractional.shareDenominator : null
    const sharePrice = fractional.sharePrice
    const fullPrice = fractional.normalizedFullPrice
    if (denominator && typeof sharePrice === "number" && typeof fullPrice === "number") {
      return `Fractional listing detected: ${numerator}/${denominator} share listed at ${formatMoney(sharePrice)}; normalized full-aircraft value ${formatMoney(fullPrice)}.`
    }
    if (denominator && typeof fullPrice === "number") {
      return `Fractional listing detected: ${numerator}/${denominator} share listing normalized to ${formatMoney(fullPrice)} full-aircraft value.`
    }
  }

  if (fractional.reviewNeeded) {
    const evidence = fractional.evidence.length ? ` Evidence: ${fractional.evidence.join(", ")}.` : ""
    return `Partnership/fractional wording detected; listing flagged for manual price review.${evidence}`
  }
  return null
}

function resolveCompSource(compSource: string | null, marketSampleSize: number | null): string | null {
  if (compSource) return compSource
  if (typeof marketSampleSize === "number" && marketSampleSize >= 5) {
    return "estimated active listings (same make/model)"
  }
  return null
}

function resolveDataConfidence(
  value: string | null,
  listing: AircraftListing,
  askingPrice: number | null,
  marketSampleSize: number | null
): string | null {
  if (value) return value
  let points = 0
  if (typeof askingPrice === "number" && askingPrice > 0) points += 1
  if (typeof listing.total_time_airframe === "number" && listing.total_time_airframe > 0) points += 1
  if (typeof listing.engine_time_since_overhaul === "number" && listing.engine_time_since_overhaul > 0) points += 1
  if (typeof listing.avionics_score === "number") points += 1
  if (typeof marketSampleSize === "number" && marketSampleSize >= 5) points += 1
  if (points >= 4) return "MEDIUM (derived)"
  if (points >= 2) return "LOW (derived)"
  return null
}

function deriveScoreBreakdown(args: {
  listing: AircraftListing
  marketOpportunityScore: number | null
  conditionScore: number | null
  executionScore: number | null
  investmentScore: number | null
}): {
  primaryScore: number | null
  primaryLabel: string
  marketScore: number | null
  conditionScore: number | null
  executionScore: number | null
} {
  const { listing } = args
  const fallbackMarket = typeof listing.deal_rating === "number" ? listing.deal_rating : listing.value_score
  const fallbackCondition = typeof listing.value_score === "number" ? listing.value_score : null
  const fallbackExecution = deriveExecutionFallback(listing)
  const marketScore = args.marketOpportunityScore ?? fallbackMarket ?? null
  const conditionScore = args.conditionScore ?? fallbackCondition ?? null
  const executionScore = args.executionScore ?? fallbackExecution
  const weightedFallback =
    typeof marketScore === "number" && typeof conditionScore === "number" && typeof executionScore === "number"
      ? marketScore * 0.45 + conditionScore * 0.35 + executionScore * 0.2
      : null
  const primaryScore = args.investmentScore ?? weightedFallback ?? listing.value_score
  return {
    primaryScore: primaryScore !== null ? Number(primaryScore.toFixed(1)) : null,
    primaryLabel: args.investmentScore !== null ? "Investment score" : "Investment score (derived)",
    marketScore: marketScore !== null ? Number(marketScore.toFixed(1)) : null,
    conditionScore: conditionScore !== null ? Number(conditionScore.toFixed(1)) : null,
    executionScore: executionScore !== null ? Number(executionScore.toFixed(1)) : null,
  }
}

function deriveExecutionFallback(listing: AircraftListing): number | null {
  let score = 50
  const dom = typeof listing.days_on_market === "number" ? listing.days_on_market : null
  if (typeof dom === "number") {
    if (dom >= 180) score += 18
    else if (dom >= 90) score += 12
    else if (dom >= 45) score += 6
    else if (dom < 10) score -= 5
  }
  if (listing.price_reduced === true) score += 12
  return Math.max(0, Math.min(100, score))
}

function buildScoreInputRows(args: {
  listing: AircraftListing
  scoreBreakdown: {
    primaryScore: number | null
    primaryLabel: string
    marketScore: number | null
    conditionScore: number | null
    executionScore: number | null
  }
  pricingConfidence: string | null
  compInsights: {
    compSelectionTier: string | null
    compUniverseSize: number | null
    compExactCount: number | null
    compFamilyCount: number | null
    compMakeCount: number | null
    compMedianPrice: number | null
    compP25Price: number | null
    compP75Price: number | null
    mispricingZscore: number | null
  }
  askingPrice: number | null
  trueCostEstimate: number | null
  deferredMaintenance: number
  engineOverrunLiability: number
  installedAvionicsValue: number | null
  stcPremiumTotal: number | null
  dataConfidence: string | null
  compSource: string | null
  marketPricing: {
    sampleSize: number
    low: number | null
    median: number | null
    high: number | null
    usedYearWindow: boolean
  } | null
}): ScoreMetricRow[] {
  const rows: ScoreMetricRow[] = []
  const {
    listing,
    scoreBreakdown,
    pricingConfidence,
    compInsights,
    askingPrice,
    trueCostEstimate,
    deferredMaintenance,
    engineOverrunLiability,
    installedAvionicsValue,
    stcPremiumTotal,
    dataConfidence,
    compSource,
    marketPricing,
  } = args

  rows.push([scoreBreakdown.primaryLabel, `${safeDisplay(formatScore(scoreBreakdown.primaryScore))} / 100`])
  rows.push(["Market opportunity", `${safeDisplay(formatScore(scoreBreakdown.marketScore))} / 100`])
  rows.push(["Condition score", `${safeDisplay(formatScore(scoreBreakdown.conditionScore))} / 100`])
  rows.push(["Execution score", `${safeDisplay(formatScore(scoreBreakdown.executionScore))} / 100`])
  rows.push(["Legacy value score", `${safeDisplay(formatScore(listing.value_score))} / 100`])
  rows.push(["Deal rating", `${safeDisplay(formatScore(listing.deal_rating))} / 100`])
  if (compInsights.compSelectionTier) {
    rows.push(["Comp selection tier", formatCompTier(compInsights.compSelectionTier)])
  }
  if (typeof compInsights.compUniverseSize === "number" && compInsights.compUniverseSize > 0) {
    rows.push(["Comp universe used", `${Math.round(compInsights.compUniverseSize).toLocaleString("en-US")} listings`])
  }
  if (
    typeof compInsights.compP25Price === "number" &&
    typeof compInsights.compMedianPrice === "number" &&
    typeof compInsights.compP75Price === "number"
  ) {
    rows.push([
      "Comp effective price band",
      `${formatMoney(compInsights.compP25Price)} - ${formatMoney(compInsights.compP75Price)} (median ${formatMoney(compInsights.compMedianPrice)})`,
    ])
  }
  if (typeof compInsights.mispricingZscore === "number") {
    rows.push(["Mispricing z-score", compInsights.mispricingZscore.toFixed(2)])
  }

  if (typeof askingPrice === "number" && askingPrice > 0) {
    rows.push(["Asking price", safeDisplay(formatMoney(askingPrice))])
  } else if (
    marketPricing &&
    typeof marketPricing.low === "number" &&
    typeof marketPricing.median === "number" &&
    typeof marketPricing.high === "number"
  ) {
    const scopeLabel = marketPricing.usedYearWindow ? "same model (+/-10 years)" : "same make/model"
    rows.push([
      "Estimated market ask range",
      `${formatMoney(marketPricing.low)} - ${formatMoney(marketPricing.high)} (median ${formatMoney(marketPricing.median)}, n=${marketPricing.sampleSize}, ${scopeLabel})`,
    ])
  }

  if (typeof deferredMaintenance === "number" && deferredMaintenance > 0) {
    rows.push(["Deferred maintenance", safeDisplay(formatMoney(deferredMaintenance))])
  }
  if (typeof engineOverrunLiability === "number" && engineOverrunLiability > 0) {
    rows.push(["Engine Overhaul (past TBO)", safeDisplay(formatMoney(engineOverrunLiability))])
  }
  if (typeof trueCostEstimate === "number" && trueCostEstimate > 0) {
    rows.push(["True cost estimate", safeDisplay(formatMoney(trueCostEstimate))])
  }
  rows.push(["Avionics score", `${safeDisplay(formatScore(listing.avionics_score))} / 100`])

  if (typeof installedAvionicsValue === "number" && installedAvionicsValue > 0) {
    rows.push(["Installed avionics value", safeDisplay(formatMoney(installedAvionicsValue))])
  }
  if (typeof stcPremiumTotal === "number" && stcPremiumTotal > 0) {
    rows.push(["STC premium value", safeDisplay(formatMoney(stcPremiumTotal))])
  }
  if (dataConfidence) {
    rows.push(["Data confidence", safeDisplay(dataConfidence)])
  }
  if (pricingConfidence) {
    rows.push(["Pricing confidence", safeDisplay(pricingConfidence)])
  }
  if (compSource) {
    rows.push(["Comp source", safeDisplay(compSource)])
  }

  return rows
}

function buildConfidenceSignals(
  listing: AircraftListing,
  askingPrice: number | null,
  marketSampleSize: number | null,
  originalConfidence: string | null
): string[] {
  const signals: string[] = []
  if (originalConfidence) {
    signals.push(`Model-provided confidence: ${originalConfidence}.`)
  }
  if (typeof askingPrice === "number" && askingPrice > 0) {
    signals.push(`Asking price available (${formatMoney(askingPrice)}).`)
  } else {
    signals.push("Asking price missing; using market estimate fallback.")
  }
  if (typeof listing.total_time_airframe === "number" && listing.total_time_airframe > 0) {
    signals.push(`Airframe time available (${Math.round(listing.total_time_airframe).toLocaleString("en-US")} hrs).`)
  } else {
    signals.push("Airframe time missing.")
  }
  if (typeof listing.engine_time_since_overhaul === "number" && listing.engine_time_since_overhaul > 0) {
    signals.push(`Engine SMOH available (${Math.round(listing.engine_time_since_overhaul).toLocaleString("en-US")} hrs).`)
  } else {
    signals.push("Engine SMOH missing.")
  }
  if (typeof listing.avionics_score === "number") {
    signals.push(`Avionics score available (${formatScore(listing.avionics_score)}/100).`)
  } else {
    signals.push("Avionics score missing.")
  }
  if (typeof marketSampleSize === "number" && marketSampleSize > 0) {
    signals.push(`Comparable active listings found: ${marketSampleSize}.`)
  } else {
    signals.push("No comparable active listings found for market estimate.")
  }
  return signals
}

function buildVerificationFlags(input: {
  nNumber: string
  registrationAlert: string | null
  hasFaaSnapshot: boolean
  listingState: string | null
  faaState: string | null
}): Array<{ level: "info" | "warning" | "danger"; text: string }> {
  const flags: Array<{ level: "info" | "warning" | "danger"; text: string }> = []
  if (input.nNumber === "—") {
    flags.push({ level: "warning", text: "No N-number captured yet: FAA cross-reference cannot run until listing text is enriched." })
    return flags
  }
  if (!input.hasFaaSnapshot) {
    flags.push({ level: "info", text: "FAA enrichment pending for this N-number. Run FAA enrichment to populate owner, status, and specs." })
  }
  if (input.registrationAlert) {
    flags.push({ level: "danger", text: `Registration alert: ${input.registrationAlert}. Verify before deposit or pre-buy.` })
  }
  const listingState = (input.listingState || "").trim().toUpperCase()
  const faaState = (input.faaState || "").trim().toUpperCase()
  if (listingState && faaState && listingState !== faaState) {
    flags.push({ level: "warning", text: `Location mismatch: listing state ${listingState} vs FAA state ${faaState}. Confirm aircraft identity and current location.` })
  }
  return flags
}

function buildScoreMethodSummary(
  scoreBreakdown: {
    primaryScore: number | null
    primaryLabel: string
    marketScore: number | null
    conditionScore: number | null
    executionScore: number | null
  },
  dataConfidence: string | null,
  pricingConfidence: string | null,
  dealComparisonSource: string | null,
  scoreExplanationCount: number
): string {
  const lines: string[] = []
  lines.push(`${scoreBreakdown.primaryLabel}: 45% Market Opportunity + 35% Condition + 20% Execution Readiness.`)

  const hasAllSubscores =
    typeof scoreBreakdown.marketScore === "number" &&
    typeof scoreBreakdown.conditionScore === "number" &&
    typeof scoreBreakdown.executionScore === "number"

  if (hasAllSubscores) {
    const marketScore = scoreBreakdown.marketScore as number
    const conditionScore = scoreBreakdown.conditionScore as number
    const executionScore = scoreBreakdown.executionScore as number
    const marketContribution = marketScore * 0.45
    const conditionContribution = conditionScore * 0.35
    const executionContribution = executionScore * 0.2
    const blended = marketContribution + conditionContribution + executionContribution
    lines.push(
      `Current scores: Market ${formatScore(marketScore)}, Condition ${formatScore(conditionScore)}, Execution ${formatScore(executionScore)}.`
    )
    lines.push(
      `Weighted result: ${marketContribution.toFixed(1)} + ${conditionContribution.toFixed(1)} + ${executionContribution.toFixed(1)} = ${blended.toFixed(1)}.`
    )
  }
  if (dealComparisonSource) {
    lines.push(`Market pricing source: ${dealComparisonSource} (exact-first comps waterfall, then broader fallback tiers).`)
  }
  if (dataConfidence) {
    lines.push(`Data confidence: ${dataConfidence}.`)
  }
  if (pricingConfidence) {
    lines.push(`Pricing confidence: ${pricingConfidence}.`)
  }
  if (scoreExplanationCount > 0) {
    lines.push("See the factor list below for the strongest positive and negative score drivers.")
  }
  return lines.join("\n")
}

