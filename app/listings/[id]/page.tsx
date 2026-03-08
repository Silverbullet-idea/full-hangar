import Link from "next/link"
import type { Metadata } from "next"
import { cache, type ReactNode } from "react"
import LeftDetailColumn from "./components/LeftDetailColumn"
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

type ListingPageProps = {
  params: Promise<{ id: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

type ScoreMetricRow = [string, ReactNode]

const getListingForSeo = cache(async (id: string) => {
  const listing = await getListingById(id)
  return listing ? (listing as AircraftListing) : null
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
  const [listing, raw] = await Promise.all([getListingById(id), getListingRawById(id)])

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
  const parsedHoursSinceIran = descriptionIntelligence.maintenance.hoursSinceIran || parsedDescription.hoursSinceIran
  const totalTimeHours = typeof listingRow.total_time_airframe === "number"
    ? listingRow.total_time_airframe
    : parsedTotalTime ?? parsedDescription.totalTimeAirframe
  const engineSmohHours = typeof listingRow.engine_time_since_overhaul === "number"
    ? listingRow.engine_time_since_overhaul
    : parsedEngineSmoh ?? parsedDescription.engineSmoh
  const engineTboHours =
    listingRow.engine_tbo_hours ??
    pickNumber(raw, ["engine_tbo_hours", "engine_tbo"]) ??
    parsedEngineTbo ??
    parsedDescription.engineTbo
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
  const avionicsText = pickText(raw, ["avionics_description", "avionics_notes"]) || parsedDescription.avionics
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
  const detailDealTier = pickText(raw, ["deal_tier"]) || listingRow.deal_tier
  const resolvedAskingPrice = resolveAskingPrice(listingRow, raw)
  const fractionalPricingContext = descriptionIntelligence.pricingContext
  const fractionalBreakdown = resolveFractionalBreakdown(raw, fractionalPricingContext, resolvedAskingPrice)
  const fractionalPricingNote = buildFractionalPricingNote(fractionalBreakdown)
  const marketPricing = await getSimilarMarketPricing(listingRow.make, listingRow.model, listingRow.year)
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
  const priceHistoryRaw = await getListingPriceHistory(listingRow.source, listingRow.source_id, 730)
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
  const trueCostEstimate = calculateTrueCost(resolvedAskingPrice, listingRow.deferred_total, listingRow.true_cost)
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
  const engineRows: Array<[string, ReactNode]> = [
    ["Total Time", safeDisplay(formatHours(totalTimeHours))],
    ["Engine Time SMOH", safeDisplay(formatHours(engineSmohHours))],
    ["Cylinders Since New", safeDisplay(formatHours(parsedCylinderHours))],
    ["Hours Since IRAN", safeDisplay(formatHours(parsedHoursSinceIran))],
    ["Engine TBO", safeDisplay(formatHours(engineTboHours))],
    ["Engine Manufacturer", safeDisplay(engineManufacturerText)],
    ["Engine Model", safeDisplay(engineModelText)],
    ["Last Annual", safeDisplay(parsedLastAnnual)],
    ["Type Engine", safeDisplay(faaTypeEngine)],
    ["Airworthiness Category", safeDisplay(faaAirworthinessCategory)],
    ["Airworthiness Classification", safeDisplay(faaAirworthinessClassification)],
    ["A/W Date", safeDisplay(formatIsoDate(faaAirworthinessDate))],
    ["Avionics", renderAvionicsValue(avionicsList, avionicsText)],
    ["Airworthy", safeDisplay(formatAirworthy(raw, parsedDescription), { unknownAsDash: true })],
  ]
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
    <main className="container">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(detailJsonLd) }}
      />
      <p>
        <Link href={backToListingsHref}>← Back to listings</Link>
      </p>

      <h1 className="listing-title">
        {titleText}
        {typeof resolvedAskingPrice === "number" && resolvedAskingPrice > 0 ? (
          <span className="asking-price-inline">
            {" - Asking Price: "}
            <span className="asking-price-value">{formatMoney(resolvedAskingPrice)}</span>
          </span>
        ) : null}
      </h1>
      {fractionalBreakdown.isFractional ? (
        <div className="fractional-chip-row">
          <span className="fractional-chip">Fractional Ownership</span>
          {fractionalBreakdown.shareLabel ? <span className="fractional-chip-detail">{fractionalBreakdown.shareLabel}</span> : null}
        </div>
      ) : null}
      {fractionalPricingNote ? <p className="fractional-pricing-note">{fractionalPricingNote}</p> : null}

      <div className="detail-grid">
        <LeftDetailColumn
          primaryImageUrl={primaryImageUrl}
          galleryUrls={galleryUrls}
          fallbackImageUrl={fallbackImageUrl}
          title={listingRow.title || "Aircraft listing"}
          aircraftRows={aircraftRows}
          engineRows={engineRows}
          descriptionText={descriptionText}
          sourceUrl={sourceUrl}
          sourceLinkLabel={sourceLinkLabel}
          logbookUrls={logbookUrls}
          dealTier={detailDealTier}
        />
        <RightDetailColumn
          listingId={id}
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
        />
      </div>

      <style>{`
        .listing-title {
          margin: 0 0 1.25rem;
          font-size: clamp(2rem, 4vw, 3rem);
          line-height: 1.1;
          white-space: nowrap;
        }
        .asking-price-inline {
          font-size: clamp(1rem, 2vw, 1.45rem);
          font-weight: 700;
          color: #e5e7eb;
          margin-left: 0.25rem;
        }
        .asking-price-value {
          color: #22c55e;
          font-weight: 800;
        }
        .fractional-pricing-note {
          margin: -8px 0 14px;
          color: #f5d284;
          font-size: 0.95rem;
        }
        .fractional-chip-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: -4px 0 10px;
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
        .detail-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 1rem;
          align-items: start;
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
          .listing-title {
            white-space: normal;
          }
          .detail-grid {
            grid-template-columns: 1fr;
          }
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

function calculateTrueCost(askingPrice: number | null, deferredTotal: number | null, trueCost: number | null): number | null {
  if (typeof trueCost === "number") return trueCost
  if (typeof askingPrice !== "number" || typeof deferredTotal !== "number") return null
  return askingPrice + deferredTotal
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
  const { listing, scoreBreakdown, pricingConfidence, compInsights, askingPrice, trueCostEstimate, installedAvionicsValue, stcPremiumTotal, dataConfidence, compSource, marketPricing } = args

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

  if (typeof listing.deferred_total === "number" && listing.deferred_total > 0) {
    rows.push(["Deferred maintenance", safeDisplay(formatMoney(listing.deferred_total))])
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
  const parts: string[] = []
  parts.push(
    `${scoreBreakdown.primaryLabel} is a 0-100 investment signal built from three components: Market Opportunity (45%), Condition (35%), and Execution Readiness (20%).`
  )

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
    parts.push(
      `Current component scores are Market ${formatScore(marketScore)}, Condition ${formatScore(conditionScore)}, and Execution ${formatScore(executionScore)}. Weighted contributions are ${marketContribution.toFixed(1)} + ${conditionContribution.toFixed(1)} + ${executionContribution.toFixed(1)} = ${blended.toFixed(1)}.`
    )
  }
  if (dealComparisonSource) {
    parts.push(`Market pricing inputs are sourced from ${dealComparisonSource} using the comps waterfall (exact match first, then broader fallback tiers when needed).`)
  }
  if (dataConfidence) {
    parts.push(`Data confidence is ${dataConfidence}, which indicates how reliable the underlying listing and comparison data is.`)
  }
  if (pricingConfidence) {
    parts.push(`Pricing confidence is ${pricingConfidence}, reflecting asking-price and comparables completeness.`)
  }
  if (scoreExplanationCount > 0) {
    parts.push("The factor list below highlights the strongest positive and negative drivers behind this aircraft's score.")
  }
  return parts.join(" ")
}

