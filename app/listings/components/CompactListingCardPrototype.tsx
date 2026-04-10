import { FLIP_TIER_CONFIG } from '../../../lib/scoring/flipTierConfig'

const PLACEHOLDER_ROWS: Array<[string, string]> = [
  ['Field A', '—'],
  ['Field B', '—'],
  ['Field C', '—'],
]

function SpecTable({
  listingKey,
  rows,
}: {
  listingKey: string
  rows: Array<[string, string]>
}) {
  return (
    <table
      className="w-full border-collapse rounded-md border border-[#3A4454] bg-[#141922] text-[10px]"
      style={{ fontFamily: 'var(--font-dm-sans), system-ui' }}
    >
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={`${listingKey}-${label}`} className="border-b border-[#2d394a] last:border-b-0">
            <th className="w-[42%] px-2 py-1.5 text-left font-medium text-[#9CA3AF]">{label}</th>
            <td
              className={`px-2 py-1.5 text-right font-semibold ${
                label === 'Price' ? 'text-[#22c55e]' : 'text-white'
              }`}
            >
              {value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export type CompactListingCardPrototypeProps = {
  listingKey: string
  titleText: string
  locationText: string
  nNumber: string
  priceDisplay: string
  flipScoreDisplay: string
  /** When set, shows tier chip like production compact cards */
  flipTier?: keyof typeof FLIP_TIER_CONFIG | null
  ownershipBadgeText?: string
  engineBadgeText?: string
  engineBadgeClass?: string
  engineBadgeTitle?: string
  /** Replace default Field A/B/C placeholders */
  placeholderRows?: Array<[string, string]>
}

export default function CompactListingCardPrototype({
  listingKey,
  titleText,
  locationText,
  nNumber,
  priceDisplay,
  flipScoreDisplay,
  flipTier,
  ownershipBadgeText,
  engineBadgeText,
  engineBadgeClass,
  engineBadgeTitle,
  placeholderRows = PLACEHOLDER_ROWS,
}: CompactListingCardPrototypeProps) {
  const flipKey = flipTier != null ? String(flipTier).trim().toUpperCase() : ''
  const flipCfg = flipKey ? FLIP_TIER_CONFIG[flipKey] : null
  const flipChipClass =
    flipCfg != null
      ? `shrink-0 rounded border px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${flipCfg.bg} ${flipCfg.text} ring-1 ${flipCfg.ring}`
      : null

  const coreRows: Array<[string, string]> = [
    ['N-Number', nNumber],
    ['Price', priceDisplay],
    ['Flip score', flipScoreDisplay],
    ...placeholderRows,
  ]

  return (
    <div
      className="block rounded-md border border-[#3A4454] bg-[#1a1a1a] p-2 transition-colors hover:border-brand-burn"
      role="article"
      aria-label={`Prototype listing card: ${titleText}`}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
            <div
              className="min-w-0 flex-1 basis-[8rem] text-sm font-semibold leading-snug text-white [overflow-wrap:anywhere] whitespace-normal"
              style={{ fontFamily: 'var(--font-dm-sans), system-ui' }}
            >
              {titleText}
            </div>
            {ownershipBadgeText ? (
              <span className="shrink-0 rounded border border-[#FF9900] bg-[#141922] px-1 py-0.5 text-[9px] font-semibold text-[#FF9900]">
                {ownershipBadgeText}
              </span>
            ) : null}
            {flipChipClass && flipCfg ? (
              <span className={flipChipClass} aria-label={`Flip tier ${flipCfg.label}`}>
                {flipCfg.label}
              </span>
            ) : null}
            {engineBadgeText ? (
              <span
                className={`shrink-0 rounded border px-1 py-0.5 text-[9px] font-semibold ${
                  engineBadgeClass ?? 'border-[#3A4454] bg-[#141922] text-[#B2B2B2]'
                }`}
                title={engineBadgeTitle}
              >
                {engineBadgeText}
              </span>
            ) : null}
          </div>
          <div
            className="mt-1 text-[11px] leading-snug text-brand-muted [overflow-wrap:anywhere] whitespace-normal"
            style={{ fontFamily: 'var(--font-dm-sans), system-ui' }}
          >
            {locationText}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <SpecTable listingKey={listingKey} rows={coreRows} />
        </div>
      </div>
    </div>
  )
}
