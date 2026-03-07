import Image from 'next/image'

type LayoutMode = 'tiles' | 'rows' | 'compact'

type ListingCardProps = {
  listingKey: string
  detailHref: string
  mode: LayoutMode
  imageUrl: string
  titleText: string
  locationText: string
  ownershipBadgeText?: string
  specRows: Array<[string, string]>
  onImageError: () => void
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
}) {
  const { mode, imageUrl, titleText, onImageError } = props
  const shouldShowImage = Boolean(imageUrl)

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
        loading="lazy"
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
          loading="lazy"
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
          loading="lazy"
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
  specRows,
  onImageError,
}: ListingCardProps) {
  const imageNode = renderImageNode({ mode, imageUrl, titleText, onImageError })

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
              <div className="truncate text-lg font-semibold text-white">{titleText}</div>
              {ownershipBadgeText ? (
                <span className="shrink-0 rounded border border-[#FF9900] bg-[#141922] px-1.5 py-0.5 text-[10px] font-semibold text-[#FF9900]">
                  {ownershipBadgeText}
                </span>
              ) : null}
            </div>
            <div className="mt-1 text-sm text-brand-muted">{locationText}</div>
            {renderSpecTable(listingKey, specRows)}
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
                <div className="truncate text-sm font-semibold text-white">{titleText}</div>
                {ownershipBadgeText ? (
                  <span className="shrink-0 rounded border border-[#FF9900] bg-[#141922] px-1 py-0.5 text-[9px] font-semibold text-[#FF9900]">
                    {ownershipBadgeText}
                  </span>
                ) : null}
              </div>
              <div className="truncate text-[11px] text-brand-muted">{locationText}</div>
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
        <div className="font-semibold text-white">{titleText}</div>
        {ownershipBadgeText ? (
          <span className="shrink-0 rounded border border-[#FF9900] bg-[#141922] px-1.5 py-0.5 text-[10px] font-semibold text-[#FF9900]">
            {ownershipBadgeText}
          </span>
        ) : null}
      </div>
      <div className="mt-1 text-sm text-brand-muted">{locationText}</div>
      {renderSpecTable(listingKey, specRows)}
    </a>
  )
}
