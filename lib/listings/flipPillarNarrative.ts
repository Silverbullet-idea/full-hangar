/**
 * Plain-language copy for listing-detail Flip Pillars accordions.
 * `basis` strings are produced by core/intelligence/flip_score.py (keep in sync).
 */

export type FlipPillarId = "p1" | "p2" | "p3" | "p4"

function pct(pts: number | null, max: number): number | null {
  if (typeof pts !== "number" || !Number.isFinite(pts) || max <= 0) return null
  return Math.max(0, Math.min(100, (pts / max) * 100))
}

function fallbackNarrative(pillar: FlipPillarId, pts: number | null, max: number): string {
  const p = pct(pts, max)
  const rounded = typeof pts === "number" && Number.isFinite(pts) ? Math.round(pts) : null

  const band =
    p === null
      ? "We don’t have enough structured data to break this down further; the score reflects what was available at compute time."
      : p >= 85
        ? "This pillar is near the top of its range for this listing."
        : p >= 50
          ? "This pillar sits in a solid mid range for this listing."
          : p >= 20
            ? "This pillar is on the lower side for this listing."
            : "This pillar contributes few points—often due to missing signals or tougher inputs in this area."

  const intro =
    pillar === "p1"
      ? "Pricing edge compares estimated all-in cost (asking price plus modeled deferred maintenance) to comparable market pricing when we have a reliable comp median."
      : pillar === "p2"
        ? "Airworthiness blends estimated engine life remaining (or hours toward overhaul) with overall risk and condition signals from the listing."
        : pillar === "p3"
          ? "Improvement room rewards avionics and condition headroom—more upside when the aircraft isn’t already a “finished” glass / high-condition example, unless risk caps apply."
          : "Exit liquidity reflects how quickly similar make/models typically trade, adjusted for days on market and how fresh the listing is."

  return `${intro} ${rounded !== null ? `This aircraft landed at ${rounded} of ${max} points here. ` : ""}${band}`
}

function narrativeP1(pts: number | null, max: number, basis: string): string | null {
  if (basis === "no_price") {
    return "Pricing edge needs a disclosed asking price. With no price, this pillar stays at zero."
  }
  if (basis.startsWith("true_cost_vs_comps:")) {
    const raw = basis.slice("true_cost_vs_comps:".length)
    const ratio = parseFloat(raw)
    if (!Number.isFinite(ratio)) return null
    const pctVs = Math.round(ratio * 100)
    let band: string
    if (ratio <= 0.72) {
      band =
        "Estimated all-in cost is well below the comp median—strong pricing edge for a flip-style buy (up to the full 35 points on this pillar)."
    } else if (ratio <= 0.8) {
      band = "All-in cost is meaningfully below typical comps—still a strong pricing signal."
    } else if (ratio <= 0.87) {
      band = "All-in cost is moderately below comps—a decent but not extreme edge."
    } else if (ratio <= 0.93) {
      band = "All-in cost is slightly below comps—a modest edge."
    } else if (ratio <= 0.98) {
      band = "All-in cost is roughly in line with comps—limited pricing edge."
    } else if (ratio <= 1.03) {
      band = "All-in cost is about at the comp median—little pricing edge."
    } else if (ratio <= 1.1) {
      band = "All-in cost runs above typical comps—weak pricing edge."
    } else {
      band = "All-in cost is materially above comps—minimal pricing edge on this pillar."
    }
    return `We compared estimated all-in cost to the comparable set (ratio ≈ ${pctVs}% of the median). ${band}`
  }
  if (basis.startsWith("deal_tier_fallback:")) {
    const tier = basis.slice("deal_tier_fallback:".length).replace(/_/g, " ").toLowerCase()
    const map: Record<string, string> = {
      "exceptional deal": "the listing’s deal tier suggested an exceptional value versus our internal benchmarks.",
      "good deal": "the listing’s deal tier suggested a good value versus benchmarks.",
      "fair market": "the listing’s deal tier looked close to fair market.",
      "above market": "the listing’s deal tier looked above typical market.",
      overpriced: "the listing’s deal tier looked stretched versus market.",
      "insufficient data": "comp coverage was thin, so we used the deal-tier fallback instead of a pure comp ratio.",
    }
    const tail = map[tier] ?? "we used the stored deal-tier signal because a reliable comp median wasn’t available."
    return `Without a solid comp median, ${tail}`
  }
  if (basis.startsWith("deal_rating_fallback:")) {
    const tag = basis.slice("deal_rating_fallback:".length)
    const human =
      tag === "numeric_exceptional"
        ? "a strong numeric deal rating"
        : tag === "numeric_good"
          ? "a solid numeric deal rating"
          : tag === "numeric_fair"
            ? "a middling numeric deal rating"
            : tag === "numeric_weak"
              ? "a weak numeric deal rating"
              : tag === "numeric_poor"
                ? "a poor numeric deal rating"
                : "available deal-rating signals"
    return `Comp median was missing, so pricing edge leaned on ${human} instead of a true-cost-to-comps ratio.`
  }
  if (basis.startsWith("deal_fallback:")) {
    return "Comp median and deal tier signals were unclear, so pricing edge used a conservative default until better market anchors exist."
  }
  return null
}

function narrativeP2(pts: number | null, max: number, basis: string): string | null {
  const m = basis.match(/^engine:(\d+)\+risk:(\d+)\((LOW|MODERATE|HIGH|CRITICAL)\)$/i)
  if (!m) return null
  const enginePts = Number(m[1])
  const riskPts = Number(m[2])
  const risk = m[3].toUpperCase()
  const riskLine =
    risk === "LOW"
      ? "Overall risk is low, so the maintenance side of this pillar could contribute more."
      : risk === "MODERATE"
        ? "Risk is moderate, so maintenance credit is tempered."
        : risk === "HIGH"
          ? "Higher risk trims how much we award for maintenance posture."
          : "Critical risk removes most of the maintenance cushion on this pillar."

  return `Up to 12 points come from engine-life / overhaul headroom; this listing received about ${enginePts}. Up to 8 points reflect risk and condition framing; here that’s about ${riskPts}. ${riskLine}`
}

function narrativeP3(pts: number | null, max: number, basis: string): string | null {
  if (basis === "critical_risk_no_headroom") {
    return "When overall risk is CRITICAL, we don’t award improvement headroom—there’s no score credit for upgrades until the risk picture improves."
  }
  const avMatch = basis.match(/avionics:(\d+)\(([^)]+)\)/)
  const condMatch = basis.match(/\+condition:(\d+)\(([^)]+)\)/)
  if (!avMatch) return null
  const avPts = Number(avMatch[1])
  const avTag = avMatch[2]

  let avSentence: string
  if (avTag === "glass_panel_neutral") {
    avSentence =
      "A modern glass-style panel was detected, so we don’t add avionics-upgrade headroom points (0 of 15 on that slice)."
  } else if (avTag.startsWith("steam_gauge:")) {
    const score = avTag.replace("steam_gauge:", "")
    avSentence = `Avionics look more “steam gauge” style (avionics score ≈ ${score}), so there’s room to capture value with upgrades—about ${avPts} of 15 points on that slice.`
  } else {
    avSentence = `Avionics headroom contributed about ${avPts} of 15 points (${avTag.replace(/_/g, " ")}).`
  }

  let condSentence = ""
  if (condMatch) {
    const condPts = Number(condMatch[1])
    const inner = condMatch[2]
    if (inner.startsWith("condition:")) {
      const cs = inner.replace("condition:", "")
      condSentence = `Condition score around ${cs} shaped about ${condPts} of 15 points on the condition slice.`
    } else if (inner.startsWith("risk_")) {
      condSentence = `Elevated risk capped the condition slice at about ${condPts} of 15 points (${inner.replace(/_/g, " ")}).`
    } else {
      condSentence = `The condition slice added about ${condPts} of 15 points (${inner.replace(/_/g, " ")}).`
    }
  }

  const total =
    typeof pts === "number" && Number.isFinite(pts) ? Math.round(pts) : "—"
  return `${avSentence} ${condSentence} Combined, improvement room totals ${total} of ${max} points.`.trim()
}

function narrativeP4(pts: number | null, max: number, basis: string): string | null {
  const m = basis.match(/^tier:(high|medium|low)\(base:(\d+)\)-dom:(\d+)\+fresh:(\d+)$/)
  if (!m) return null
  const tier = m[1]
  const base = Number(m[2])
  const domPen = Number(m[3])
  const fresh = Number(m[4])

  const tierHuman =
    tier === "high"
      ? "High-demand make/model family"
      : tier === "medium"
        ? "Moderate-demand make/model family"
        : "Narrower-demand make/model family"

  const domHuman =
    domPen === 0
      ? "days on market did not reduce the liquidity base"
      : domPen <= 2
        ? "moderate time on market trimmed a couple of points"
        : domPen <= 4
          ? "a long time on market took a larger bite out of liquidity"
          : "extended time on market weighed heavily on liquidity"

  const freshHuman = fresh > 0 ? " A very fresh listing earned a small bonus." : ""

  const total =
    typeof pts === "number" && Number.isFinite(pts) ? Math.round(pts) : "—"
  return `${tierHuman} starts from a ${base}-point liquidity base before DOM adjustments; ${domHuman}.${freshHuman} Your net on this pillar is ${total} of ${max} points.`
}

export function getFlipPillarNarrative(
  pillar: FlipPillarId,
  pts: number | null,
  max: number,
  basis?: string | null
): string {
  const b = (basis ?? "").trim()
  if (b) {
    let specific: string | null = null
    if (pillar === "p1") specific = narrativeP1(pts, max, b)
    else if (pillar === "p2") specific = narrativeP2(pts, max, b)
    else if (pillar === "p3") specific = narrativeP3(pts, max, b)
    else specific = narrativeP4(pts, max, b)
    if (specific) return specific
  }
  return fallbackNarrative(pillar, pts, max)
}
