'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { FLIP_TIER_CONFIG } from '../../../lib/scoring/flipTierConfig'
import { formatMoney } from '../../../lib/listings/format'

type LayoutMode = 'tiles' | 'rows' | 'compact'

type ListingCardProps = {
  listingKey: string
  detailHref: string
  mode: LayoutMode
  imageUrl: string
  titleText: string
  locationText: string
  ownershipBadgeText?: string
  engineBadgeText?: string
  engineBadgeTitle?: string
  engineBadgeClass?: string
  flipTier?: string | null
  specRows: Array<[string, string]>
  onImageError: () => void
  /** Next/Image LCP hint for first screen of results (parent sets by index + layout). */
  imagePriority?: boolean
  /** Staggered entrance (tiles grid); capped in CSS. */
  tileStaggerIndex?: number
  /** Extended fields for Phase 2 tiles layout */
  tileMeta?: {
    hasDisclosedPrice: boolean
    daysOnMarket: number | null
    priceReduced: boolean
    priceReductionAmount: number | null
    trueCost: number | null
    askingPrice: number | null
    flipScore: number | null
    engineScore: number | null
    avionicsScore: number | null
    qualityScore: number | null
    marketValueScore: number | null
    executionScore: number | null
    totalTimeAirframe: number | null
    engineSmoh: number | null
    engineLifePct: number | null
    engineModelLabel: string | null
    sourceKey: string
    faaMatched: boolean
  }
}

function formatSourceLabel(raw: string): string {
  const k = raw.trim().toLowerCase().replace(/_/g, '-')
  const m: Record<string, string> = {
    'trade-a-plane': 'Trade-A-Plane',
    controller: 'Controller',
    aerotrader: 'AeroTrader',
    aircraftforsale: 'Aircraft For Sale',
    aso: 'ASO',
    globalair: 'GlobalAir',
    barnstormers: 'Barnstormers',
    avbuyer: 'AvBuyer',
    'controller_cdp': 'Controller',
    unknown: 'Listing',
  }
  return m[k] ?? raw
}

/** Match legacy bar fill: numeric scores clamp to [2,100] so tiny values stay visible. */
function pillarGaugePercent(score: number | null | undefined): number | null {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null
  return Math.max(2, Math.min(100, score))
}

const PILLAR_DONUT_R = 14
const PILLAR_DONUT_STROKE = 3.5
const PILLAR_DONUT_C = 2 * Math.PI * PILLAR_DONUT_R

type PillarDensity = 'tiles' | 'rows'

function PillarScoreGauge({
  instanceId,
  letter,
  label,
  score,
  gradientFrom,
  gradientTo,
  tooltipHint,
  gaugesRevealed,
  density,
  trackStroke,
}: {
  instanceId: string
  letter: string
  label: string
  score: number | null
  gradientFrom: string
  gradientTo: string
  tooltipHint: string
  gaugesRevealed: boolean
  density: PillarDensity
  trackStroke: string
}) {
  const pct = pillarGaugePercent(score)
  const showProgress = pct != null
  const revealedPct = gaugesRevealed && showProgress ? pct : 0
  const dashOffset = PILLAR_DONUT_C * (1 - revealedPct / 100)
  const gradId = `${instanceId}-stroke-grad`
  const tooltipBody = `${label}${score != null ? `, ${Math.round(score)} out of 100` : ', no score'}. ${tooltipHint}`
  const tooltipSrId = `${instanceId}-tip`
  const sizePx = density === 'tiles' ? 36 : 40
  const centerFont = density === 'tiles' ? '11px' : '12px'
  const letterSize = '10px'
  const labelSize = density === 'tiles' ? '8px' : '9px'
  const letterColorClass = density === 'tiles' ? 'text-[var(--fh-text-dim)]' : 'text-[#9ca3af]'
  const centerColorClass = density === 'tiles' ? 'text-[var(--fh-text)]' : 'text-white'
  const labelColorClass = density === 'tiles' ? 'text-[var(--fh-text-muted)]' : 'text-[#94a3b8]'

  return (
    <div
      className="group/pillar relative flex min-w-0 flex-1 flex-col items-center gap-0.5"
      role="group"
      aria-describedby={tooltipSrId}
    >
      <span
        className={`font-bold leading-none ${letterColorClass}`}
        style={{
          fontFamily: 'var(--font-barlow-condensed), system-ui',
          fontSize: letterSize,
        }}
      >
        {letter}
      </span>
      <div className="relative shrink-0" style={{ width: sizePx, height: sizePx }}>
        <svg
          width={sizePx}
          height={sizePx}
          viewBox="0 0 40 40"
          className="block"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={gradientFrom} />
              <stop offset="100%" stopColor={gradientTo} />
            </linearGradient>
          </defs>
          <g transform="rotate(-90 20 20)">
            <circle
              cx="20"
              cy="20"
              r={PILLAR_DONUT_R}
              fill="none"
              stroke={trackStroke}
              strokeWidth={PILLAR_DONUT_STROKE}
            />
            {showProgress ? (
              <circle
                cx="20"
                cy="20"
                r={PILLAR_DONUT_R}
                fill="none"
                stroke={`url(#${gradId})`}
                strokeWidth={PILLAR_DONUT_STROKE}
                strokeLinecap="round"
                strokeDasharray={PILLAR_DONUT_C}
                strokeDashoffset={dashOffset}
                style={{
                  transition: 'stroke-dashoffset 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}
              />
            ) : null}
          </g>
        </svg>
        <span
          className={`pointer-events-none absolute inset-0 flex items-center justify-center font-extrabold ${centerColorClass}`}
          style={{
            fontFamily: 'var(--font-barlow-condensed), system-ui',
            fontSize: centerFont,
            lineHeight: 1,
          }}
        >
          {score != null ? Math.round(score) : '—'}
        </span>
      </div>
      <span
        className={`max-w-[56px] text-center leading-tight ${labelColorClass}`}
        style={{ fontFamily: 'var(--font-dm-sans), system-ui', fontSize: labelSize }}
      >
        {label}
      </span>
      <div id={tooltipSrId} role="tooltip" className="sr-only">
        {tooltipBody}
      </div>
      <div
        className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-10 max-w-[200px] -translate-x-1/2 whitespace-normal rounded border border-[var(--fh-border)] bg-[var(--fh-bg2)] px-2 py-1 text-[10px] leading-snug text-[var(--fh-text-dim)] opacity-0 shadow-lg transition-opacity group-hover/pillar:opacity-100"
        style={{ fontFamily: 'var(--font-dm-sans)' }}
        aria-hidden="true"
      >
        <span className="font-semibold text-[var(--fh-text)]">{label}</span>
        {score != null ? ` · ${Math.round(score)}` : ''}
        <span className="mt-0.5 block text-[9px] text-[var(--fh-text-muted)]">{tooltipHint}</span>
      </div>
    </div>
  )
}

const LISTING_PILLAR_DEFS: Array<{
  suffix: string
  letter: string
  label: string
  pick: (m: NonNullable<ListingCardProps['tileMeta']>) => number | null
  from: string
  to: string
  hint: string
}> = [
  {
    suffix: 'E',
    letter: 'E',
    label: 'Engine',
    pick: (m) => m.engineScore,
    from: '#22c55e',
    to: '#059669',
    hint: 'Overhaul timing, hours, and model fit vs. market.',
  },
  {
    suffix: 'A',
    letter: 'A',
    label: 'Avionics',
    pick: (m) => m.avionicsScore,
    from: '#3b82f6',
    to: '#7c3aed',
    hint: 'Panel depth, ADS-B, autopilot, and installed value.',
  },
  {
    suffix: 'Q',
    letter: 'Q',
    label: 'Quality',
    pick: (m) => m.qualityScore,
    from: '#FF9900',
    to: '#AF4D27',
    hint: 'Listing completeness, photos, and description signal.',
  },
  {
    suffix: 'V',
    letter: 'V',
    label: 'Value',
    pick: (m) => m.marketValueScore,
    from: '#f59e0b',
    to: '#d97706',
    hint: 'Price vs. comps and market opportunity.',
  },
  {
    suffix: 'S',
    letter: 'S',
    label: 'STC / Mods',
    pick: (m) => m.executionScore,
    from: '#ec4899',
    to: '#be185d',
    hint: 'STC and modification value contribution.',
  },
]

function renderListingPillarGauges(
  pillarIdBase: string,
  m: NonNullable<ListingCardProps['tileMeta']>,
  gaugesRevealed: boolean,
  density: PillarDensity,
  rowClassName: string,
  trackStroke: string,
) {
  return (
    <div className={rowClassName}>
      {LISTING_PILLAR_DEFS.map((def) => (
        <PillarScoreGauge
          key={def.suffix}
          instanceId={`${pillarIdBase}-p-${def.suffix}`}
          letter={def.letter}
          label={def.label}
          score={def.pick(m)}
          gradientFrom={def.from}
          gradientTo={def.to}
          tooltipHint={def.hint}
          gaugesRevealed={gaugesRevealed}
          density={density}
          trackStroke={trackStroke}
        />
      ))}
    </div>
  )
}

function renderSpecTable(listingKey: string, rows: Array<[string, string]>, compact = false) {
  return (
    <table className={`mt-2 w-full border-collapse rounded-md border border-[#3A4454] bg-[#141922] ${compact ? 'text-[10px]' : 'text-[12px]'}`}>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={`${listingKey}-${label}`} className="border-b border-[#2d394a] last:border-b-0">
            <th className="w-[42%] px-2 py-1.5 text-left font-medium text-[#9CA3AF]">{label}</th>
            <td className={`px-2 py-1.5 text-right font-semibold ${label === 'Price' ? 'text-[#22c55e]' : 'text-white'}`}>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function renderImageNode(props: {
  mode: LayoutMode
  imageUrl: string
  titleText: string
  onImageError: () => void
  tileCover?: boolean
  priority?: boolean
}) {
  const { mode, imageUrl, titleText, onImageError, tileCover, priority = false } = props
  const shouldShowImage = Boolean(imageUrl)
  const lazyOrPriority = priority ? { priority: true as const } : { loading: 'lazy' as const }

  if (tileCover && shouldShowImage) {
    return (
      <Image
        src={`/api/image-proxy?url=${encodeURIComponent(imageUrl)}`}
        alt={`${titleText} listing photo`.trim()}
        width={640}
        height={360}
        sizes="(max-width: 768px) 100vw, 400px"
        unoptimized
        className="h-full w-full object-cover transition-transform duration-[400ms] group-hover:scale-[1.04]"
        {...lazyOrPriority}
        onError={onImageError}
      />
    )
  }

  if (mode === 'compact') {
    return shouldShowImage ? (
      <Image
        src={`/api/image-proxy?url=${encodeURIComponent(imageUrl)}`}
        alt={`${titleText} listing photo`.trim()}
        width={112}
        height={84}
        sizes="112px"
        unoptimized
        className="h-[84px] w-28 shrink-0 rounded bg-[#0f141d] object-contain"
        {...lazyOrPriority}
        onError={onImageError}
      />
    ) : (
      <div className="flex h-[84px] w-28 shrink-0 items-center justify-center rounded border border-[#3A4454] bg-[#141922] text-[11px] text-[#B2B2B2]">
        No photo
      </div>
    )
  }

  if (shouldShowImage) {
    if (mode === 'rows') {
      return (
        <Image
          src={`/api/image-proxy?url=${encodeURIComponent(imageUrl)}`}
          alt={`${titleText} listing photo`.trim()}
          width={288}
          height={216}
          sizes="(max-width: 1024px) 100vw, 288px"
          unoptimized
          className="h-[216px] w-full rounded bg-[#0f141d] object-contain lg:w-72"
          {...lazyOrPriority}
          onError={onImageError}
        />
      )
    }

    return (
      <div className="relative mb-3 aspect-[4/3] w-full overflow-hidden rounded bg-[#0f141d]">
        <Image
          src={`/api/image-proxy?url=${encodeURIComponent(imageUrl)}`}
          alt={`${titleText} listing photo`.trim()}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
          unoptimized
          className="object-contain"
          {...lazyOrPriority}
          onError={onImageError}
        />
      </div>
    )
  }

  return (
    <div className={mode === 'rows'
      ? 'flex h-[216px] w-full items-center justify-center rounded border border-[#3A4454] bg-[#141922] text-[#B2B2B2] lg:w-72'
      : 'mb-3 flex aspect-[4/3] w-full items-center justify-center rounded border border-[#3A4454] bg-[#141922] text-[#B2B2B2]'}>
      Photo unavailable
    </div>
  )
}

export default function ListingCard({
  listingKey,
  detailHref,
  mode,
  imageUrl,
  titleText,
  locationText,
  ownershipBadgeText,
  engineBadgeText,
  engineBadgeTitle,
  engineBadgeClass,
  flipTier,
  specRows,
  onImageError,
  imagePriority = false,
  tileStaggerIndex = 0,
  tileMeta,
}: ListingCardProps) {
  const suppressTierForNoPrice = tileMeta != null && !tileMeta.hasDisclosedPrice
  const flipKey = String(flipTier ?? '').trim().toUpperCase()
  const flipCfg = FLIP_TIER_CONFIG[flipKey]
  const showFlipScore =
    tileMeta != null &&
    tileMeta.hasDisclosedPrice &&
    typeof tileMeta.flipScore === 'number' &&
    Number.isFinite(tileMeta.flipScore) &&
    flipCfg != null
  const rowCompactFlipChip =
    showFlipScore &&
    flipCfg &&
    `shrink-0 rounded border px-1.5 py-0.5 font-semibold uppercase tracking-wide ${flipCfg.bg} ${flipCfg.text} ring-1 ${flipCfg.ring}`

  const [pillarBarsRevealed, setPillarBarsRevealed] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => setPillarBarsRevealed(true), 300)
    return () => window.clearTimeout(id)
  }, [])

  if (mode === 'tiles' && tileMeta) {
    const m = tileMeta
    const dom =
      typeof m.daysOnMarket === 'number' && Number.isFinite(m.daysOnMarket) && m.daysOnMarket >= 0
        ? m.daysOnMarket
        : null
    const dropAmt =
      m.priceReduced && typeof m.priceReductionAmount === 'number' && m.priceReductionAmount > 0
        ? m.priceReductionAmount
        : null
    const exceptional = showFlipScore && flipKey === 'HOT'
    const ribbonUndisclosed = !m.hasDisclosedPrice
    let ribbonClass =
      'border border-[rgba(122,138,158,0.35)] text-[var(--fh-text-dim)]'
    let scoreBadgeColor = 'var(--fh-text-muted)'
    if (ribbonUndisclosed) {
      ribbonClass = 'border border-[rgba(122,138,158,0.4)] text-[var(--fh-text-dim)]'
      scoreBadgeColor = 'var(--fh-text-muted)'
    } else if (showFlipScore && flipKey === 'HOT') {
      ribbonClass = 'border border-[rgba(249,115,22,0.55)] text-[#f97316]'
      scoreBadgeColor = '#f97316'
    } else if (showFlipScore && flipKey === 'GOOD') {
      ribbonClass = 'border border-[rgba(16,185,129,0.55)] text-[#10b981]'
      scoreBadgeColor = '#10b981'
    } else if (showFlipScore && flipKey === 'FAIR') {
      ribbonClass = 'border border-[rgba(251,191,36,0.55)] text-[#fbbf24]'
      scoreBadgeColor = '#fbbf24'
    } else if (showFlipScore && flipKey === 'PASS') {
      ribbonClass = 'border border-[rgba(148,163,184,0.55)] text-[#94a3b8]'
      scoreBadgeColor = '#94a3b8'
    }

    const ribbonText = ribbonUndisclosed
      ? 'PRICE UNDISCLOSED'
      : showFlipScore && flipCfg
        ? flipCfg.label.toUpperCase()
        : ''

    const locLine = `${locationText} — ${formatSourceLabel(m.sourceKey)}`
    const delayMs = Math.min(tileStaggerIndex, 6) * 50
    const pillarIdBase = listingKey.replace(/[^a-zA-Z0-9_-]/g, '_')

    return (
      <article
        className={`fh-listing-card-enter group overflow-hidden rounded-xl border bg-[var(--fh-bg2)] transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-[2px] hover:border-[var(--fh-border-orange)] hover:shadow-[0_8px_32px_rgba(0,0,0,0.5)] ${exceptional ? 'border-[rgba(249,115,22,0.35)] hover:border-[rgba(249,115,22,0.55)]' : 'border-[var(--fh-border)]'}`}
        style={{ animationDelay: `${delayMs}ms` }}
      >
        <Link href={detailHref} className="block text-inherit no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fh-orange)]">
          <div className="relative h-[180px] overflow-hidden bg-[var(--fh-bg3)]">
            {imageUrl ? (
              renderImageNode({
                mode,
                imageUrl,
                titleText,
                onImageError,
                tileCover: true,
                priority: imagePriority,
              })
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[var(--fh-bg4)] to-[var(--fh-bg)] text-4xl text-[var(--fh-text-muted)]">
                ✈
              </div>
            )}
            {ribbonText ? (
              <div
                className={`absolute left-2.5 top-2.5 z-[2] flex max-w-[calc(100%-56px)] items-center gap-1.5 rounded-[20px] px-2.5 py-1 backdrop-blur-md ${ribbonClass}`}
                style={{
                  fontFamily: 'var(--font-dm-sans), system-ui',
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.5px',
                  backdropFilter: 'blur(8px)',
                  background: 'rgba(0,0,0,0.7)',
                }}
              >
                <span className="inline-block h-[5px] w-[5px] shrink-0 rounded-full bg-current" />
                <span className="truncate">{ribbonText}</span>
              </div>
            ) : null}
            {showFlipScore ? (
              <div
                className="absolute right-2.5 top-2.5 z-[2] flex h-10 w-10 items-center justify-center rounded-full border-2 border-current backdrop-blur-md"
                style={{
                  color: scoreBadgeColor,
                  background: 'rgba(0,0,0,0.7)',
                  backdropFilter: 'blur(8px)',
                  fontFamily: 'var(--font-barlow-condensed), system-ui',
                  fontSize: 16,
                  fontWeight: 800,
                }}
                aria-label={`Flip opportunity score: ${Math.round(m.flipScore!)} out of 100, tier: ${flipKey}`}
              >
                {Math.round(m.flipScore!)}
              </div>
            ) : ribbonUndisclosed ? (
              <div
                className="absolute right-2.5 top-2.5 z-[2] flex h-10 w-10 items-center justify-center rounded-full border-2 border-current backdrop-blur-md text-[10px] font-bold"
                style={{
                  color: scoreBadgeColor,
                  background: 'rgba(0,0,0,0.7)',
                  backdropFilter: 'blur(8px)',
                  fontFamily: 'var(--font-barlow-condensed), system-ui',
                  fontWeight: 800,
                }}
                aria-label="Flip score not available — price undisclosed"
              >
                N/A
              </div>
            ) : null}
            {showFlipScore ? (
              <span
                className="absolute right-2.5 top-[54px] z-[2] text-[8px] text-[var(--fh-text-muted)]"
                style={{ fontFamily: 'var(--font-dm-sans), system-ui' }}
              >
                FLIP
              </span>
            ) : null}
            {dom != null ? (
              <div
                className="absolute bottom-2.5 left-2.5 z-[2] rounded-md px-2 py-0.5 backdrop-blur-md"
                style={{
                  background: 'rgba(0,0,0,0.75)',
                  fontFamily: 'var(--font-dm-sans), system-ui',
                  fontSize: '10px',
                  color: 'var(--fh-text-dim)',
                }}
              >
                📅 {dom} days listed
              </div>
            ) : null}
            {dropAmt != null ? (
              <div
                className="absolute bottom-2.5 right-2.5 z-[2] rounded-md px-2 py-0.5 text-[9px] font-bold text-white"
                style={{ background: 'rgba(239,68,68,0.85)' }}
              >
                ↓ {formatMoney(dropAmt)} drop
              </div>
            ) : null}
          </div>

          <div className="px-3.5 pb-0 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                className="min-w-0 flex-1 pr-1 text-[19px] font-bold leading-tight text-[var(--fh-text)]"
                style={{ fontFamily: 'var(--font-barlow-condensed), system-ui' }}
                suppressHydrationWarning
              >
                {titleText}
              </h2>
              {ownershipBadgeText ? (
                <span className="shrink-0 rounded border border-[var(--fh-orange)] bg-[var(--fh-bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--fh-orange)]">
                  {ownershipBadgeText}
                </span>
              ) : null}
            </div>
            <p
              className="mt-1 text-[11px] text-[var(--fh-text-muted)]"
              style={{ fontFamily: 'var(--font-dm-sans), system-ui' }}
              suppressHydrationWarning
            >
              📍 {locLine}
            </p>
            {m.hasDisclosedPrice && typeof m.askingPrice === 'number' ? (
              <>
                <p
                  className="mt-2 text-[26px] font-extrabold text-[var(--fh-orange)]"
                  style={{ fontFamily: 'var(--font-barlow-condensed), system-ui' }}
                >
                  {formatMoney(m.askingPrice)}
                </p>
                {typeof m.trueCost === 'number' && m.trueCost > 0 ? (
                  <p className="mt-0.5 text-[10px] text-[var(--fh-text-muted)]" style={{ fontFamily: 'var(--font-dm-sans)' }}>
                    True cost est. ~{formatMoney(m.trueCost)}…
                  </p>
                ) : null}
              </>
            ) : (
              <div className="mt-2 space-y-2">
                <span className="inline-block rounded-full border border-[var(--fh-border)] bg-[var(--fh-bg3)] px-3 py-1 text-xs text-[var(--fh-text-dim)]">
                  Call for Price
                </span>
                <div
                className="border-l-2 border-[rgba(122,138,158,0.3)] bg-[rgba(122,138,158,0.08)] px-2 py-1.5 text-[10px] italic text-[var(--fh-text-muted)]"
                style={{ fontFamily: 'var(--font-dm-sans)' }}
              >
                  ⚠ Deal scoring requires a disclosed price…
                </div>
              </div>
            )}

            <div
              className="mt-2.5 grid grid-cols-2 gap-x-2.5 gap-y-1.5"
              style={{ columnGap: '10px', rowGap: '6px' }}
            >
              {(
                [
                  ['TOTAL TIME', typeof m.totalTimeAirframe === 'number' ? `${Math.round(m.totalTimeAirframe).toLocaleString('en-US')} hrs` : '—', 'normal'],
                  ['ENGINE SMOH', typeof m.engineSmoh === 'number' ? `${Math.round(m.engineSmoh).toLocaleString('en-US')} hrs` : '—', 'normal'],
                  ['ENGINE MDL', m.engineModelLabel?.trim() || '—', 'normal'],
                  [
                    'ENG LIFE',
                    typeof m.engineLifePct === 'number' && Number.isFinite(m.engineLifePct)
                      ? `${Math.round(m.engineLifePct * 100)}% left`
                      : '—',
                    m.engineLifePct != null && m.engineLifePct < 0.25
                      ? 'bad'
                      : m.engineLifePct != null && m.engineLifePct >= 0.5
                        ? 'good'
                        : m.engineLifePct != null
                          ? 'warn'
                          : 'normal',
                  ],
                ] as const
              ).map(([lab, val, tone]) => (
                <div key={lab}>
                  <div
                    className="text-[9px] font-bold uppercase tracking-wide text-[var(--fh-text-muted)]"
                    style={{ fontFamily: 'var(--font-dm-sans), system-ui' }}
                  >
                    {lab}
                  </div>
                  <div
                    className={`text-xs font-medium ${
                      tone === 'good'
                        ? 'text-[var(--fh-green)]'
                        : tone === 'warn'
                          ? 'text-[var(--fh-amber)]'
                          : tone === 'bad'
                            ? 'text-[var(--fh-red)]'
                            : 'text-[var(--fh-text)]'
                    }`}
                    style={{ fontFamily: 'var(--font-dm-sans), system-ui' }}
                  >
                    {val}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-[var(--fh-border)] px-3.5 py-2.5">
            {m.hasDisclosedPrice ? (
              renderListingPillarGauges(
                pillarIdBase,
                m,
                pillarBarsRevealed,
                'tiles',
                'flex items-start justify-between gap-0.5 sm:gap-1',
                'var(--fh-border)',
              )
            ) : (
              <p className="text-center text-[11px] text-[var(--fh-text-muted)]" style={{ fontFamily: 'var(--font-dm-sans)' }}>
                📊 Aircraft intelligence available — flip score unlocks when price is disclosed.
              </p>
            )}
          </div>
        </Link>

        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--fh-border)] bg-[var(--fh-bg3)] px-3.5 py-2">
          <span
            className="rounded border border-[var(--fh-border)] bg-[var(--fh-bg)] px-2 py-0.5 text-[10px] text-[var(--fh-text-dim)]"
            style={{ fontFamily: 'var(--font-dm-sans), monospace' }}
          >
            {formatSourceLabel(m.sourceKey)}
          </span>
          {m.faaMatched ? (
            <span
              className="rounded border border-[rgba(34,197,94,0.35)] bg-[var(--fh-green-dim)] px-2 py-0.5 text-[10px] text-[var(--fh-green)]"
              style={{ fontFamily: 'var(--font-dm-sans)' }}
            >
              N# matched
            </span>
          ) : null}
          <button
            type="button"
            className="ml-auto rounded border border-[var(--fh-border)] px-2 py-1 text-[10px] font-semibold text-[var(--fh-text-dim)] transition-colors hover:border-[var(--fh-orange)] hover:bg-[var(--fh-orange-dim)] hover:text-[var(--fh-orange)]"
            style={{ fontFamily: 'var(--font-dm-sans)' }}
            onClick={(e) => e.preventDefault()}
          >
            + Watch
          </button>
          <Link
            href={detailHref}
            className="rounded border border-[var(--fh-border-orange)] bg-[var(--fh-orange-dim)] px-2.5 py-1 text-[10px] font-semibold text-[var(--fh-orange)] transition-colors hover:brightness-110"
            style={{ fontFamily: 'var(--font-dm-sans)' }}
          >
            View Report →
          </Link>
        </div>
      </article>
    )
  }

  const imageNode = renderImageNode({ mode, imageUrl, titleText, onImageError, priority: imagePriority })
  const pillarIdBaseRows = listingKey.replace(/[^a-zA-Z0-9_-]/g, '_')

  if (mode === 'rows') {
    return (
      <a
        href={detailHref}
        className="block rounded-lg border border-[#3A4454] bg-[#1a1a1a] p-3 transition-colors hover:border-brand-burn"
      >
        <div className="flex flex-col gap-3 lg:flex-row">
          {imageNode}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="truncate text-lg font-semibold text-white" suppressHydrationWarning>{titleText}</div>
              {ownershipBadgeText ? (
                <span className="shrink-0 rounded border border-[#FF9900] bg-[#141922] px-1.5 py-0.5 text-[10px] font-semibold text-[#FF9900]">
                  {ownershipBadgeText}
                </span>
              ) : null}
              {suppressTierForNoPrice ? (
                <span className="shrink-0 rounded border border-[rgba(122,138,158,0.45)] bg-[#141922] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#9ca3af]">
                  Price undisclosed
                </span>
              ) : rowCompactFlipChip ? (
                <span
                  className={`text-[10px] ${rowCompactFlipChip}`}
                  aria-label={`Flip opportunity score: ${Math.round(tileMeta!.flipScore!)} out of 100, tier: ${flipKey}`}
                >
                  {flipCfg!.label}
                </span>
              ) : null}
              {engineBadgeText ? (
                <span
                  className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${engineBadgeClass ?? 'border-[#3A4454] bg-[#141922] text-[#B2B2B2]'}`}
                  title={engineBadgeTitle}
                >
                  {engineBadgeText}
                </span>
              ) : null}
            </div>
            <div className="mt-1 text-sm text-brand-muted" suppressHydrationWarning>{locationText}</div>
            {renderSpecTable(listingKey, specRows)}
            {tileMeta != null && tileMeta.hasDisclosedPrice
              ? renderListingPillarGauges(
                  pillarIdBaseRows,
                  tileMeta,
                  pillarBarsRevealed,
                  'rows',
                  'mt-3 flex flex-wrap items-start justify-between gap-x-1 gap-y-2 border-t border-[#2d394a] pt-3',
                  '#4b5563',
                )
              : tileMeta != null ? (
                  <p
                    className="mt-3 border-t border-[#2d394a] pt-3 text-center text-[11px] text-[#94a3b8]"
                    style={{ fontFamily: 'var(--font-dm-sans), system-ui' }}
                  >
                    Aircraft intelligence available — flip score unlocks when price is disclosed.
                  </p>
                ) : null}
          </div>
        </div>
      </a>
    )
  }

  if (mode === 'compact') {
    return (
      <a
        href={detailHref}
        className="block rounded-md border border-[#3A4454] bg-[#1a1a1a] p-2 transition-colors hover:border-brand-burn"
      >
        <div className="flex items-start gap-2">
          <div className="w-28 shrink-0">
            {imageNode}
            <div className="mt-1 min-w-0">
              <div className="flex items-center gap-1">
                <div className="truncate text-sm font-semibold text-white" suppressHydrationWarning>{titleText}</div>
                {ownershipBadgeText ? (
                  <span className="shrink-0 rounded border border-[#FF9900] bg-[#141922] px-1 py-0.5 text-[9px] font-semibold text-[#FF9900]">
                    {ownershipBadgeText}
                  </span>
                ) : null}
                {suppressTierForNoPrice ? (
                  <span className="shrink-0 rounded border border-[rgba(122,138,158,0.45)] bg-[#141922] px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#9ca3af]">
                    Undisclosed
                  </span>
                ) : rowCompactFlipChip ? (
                  <span
                    className={`text-[9px] ${rowCompactFlipChip}`}
                    aria-label={`Flip opportunity score: ${Math.round(tileMeta!.flipScore!)} out of 100, tier: ${flipKey}`}
                  >
                    {flipCfg!.label}
                  </span>
                ) : null}
                {engineBadgeText ? (
                  <span
                    className={`shrink-0 rounded border px-1 py-0.5 text-[9px] font-semibold ${engineBadgeClass ?? 'border-[#3A4454] bg-[#141922] text-[#B2B2B2]'}`}
                    title={engineBadgeTitle}
                  >
                    {engineBadgeText}
                  </span>
                ) : null}
              </div>
              <div className="truncate text-[11px] text-brand-muted" suppressHydrationWarning>{locationText}</div>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            {renderSpecTable(listingKey, specRows, true)}
          </div>
        </div>
      </a>
    )
  }

  return (
    <a
      href={detailHref}
      className="block rounded-lg border border-brand-dark bg-[#1a1a1a] p-4 transition-colors hover:border-brand-burn"
    >
      {imageNode}
      <div className="flex items-center gap-2">
        <div className="font-semibold text-white" suppressHydrationWarning>{titleText}</div>
        {ownershipBadgeText ? (
          <span className="shrink-0 rounded border border-[#FF9900] bg-[#141922] px-1.5 py-0.5 text-[10px] font-semibold text-[#FF9900]">
            {ownershipBadgeText}
          </span>
        ) : null}
        {suppressTierForNoPrice ? (
          <span className="shrink-0 rounded border border-[rgba(122,138,158,0.45)] bg-[#141922] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#9ca3af]">
            Price undisclosed
          </span>
        ) : rowCompactFlipChip ? (
          <span
            className={`text-[10px] ${rowCompactFlipChip}`}
            aria-label={`Flip opportunity score: ${Math.round(tileMeta!.flipScore!)} out of 100, tier: ${flipKey}`}
          >
            {flipCfg!.label}
          </span>
        ) : null}
        {engineBadgeText ? (
          <span
            className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${engineBadgeClass ?? 'border-[#3A4454] bg-[#141922] text-[#B2B2B2]'}`}
            title={engineBadgeTitle}
          >
            {engineBadgeText}
          </span>
        ) : null}
      </div>
      <div className="mt-1 text-sm text-brand-muted" suppressHydrationWarning>{locationText}</div>
      {renderSpecTable(listingKey, specRows)}
    </a>
  )
}
