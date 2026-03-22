import type { ReactNode } from 'react'
import Link from "next/link"

type LayoutMode = 'tiles' | 'rows' | 'compact'

type ListingsGridAndPaginationProps = {
  layoutMode: LayoutMode
  prioritizedListings: any[]
  paginatedListings: any[]
  totalFiltered: number
  safePage: number
  totalPages: number
  renderListingCard: (listing: any, mode: LayoutMode, listingIndex: number) => ReactNode
  buildPageHref: (page: number) => string
  noPriceDividerIndex?: number
  noPriceCountOnPage?: number
}

export default function ListingsGridAndPagination({
  layoutMode,
  prioritizedListings,
  paginatedListings,
  totalFiltered,
  safePage,
  totalPages,
  renderListingCard,
  buildPageHref,
  noPriceDividerIndex = -1,
  noPriceCountOnPage = 0,
}: ListingsGridAndPaginationProps) {
  return (
    <>
      <div
        className={
          layoutMode === 'tiles'
            ? "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-2"
            : layoutMode === 'rows'
              ? "flex flex-col gap-3"
              : "flex flex-col gap-2"
        }
      >
        {prioritizedListings.flatMap((l, i) => {
          const nodes: ReactNode[] = []
          if (
            noPriceDividerIndex >= 0 &&
            i === noPriceDividerIndex &&
            noPriceCountOnPage > 0
          ) {
            nodes.push(
              <div key={`no-price-divider-${i}`} className="fh-no-price-divider">
                <span className="shrink-0 text-center">
                  ↓ {noPriceCountOnPage} listings with undisclosed price — not scored, sorted last
                </span>
              </div>
            )
          }
          nodes.push(renderListingCard(l, layoutMode, i))
          return nodes
        })}
      </div>
      {!paginatedListings.length && (
        <div className="mt-8 rounded-lg border border-brand-dark bg-[#1a1a1a] p-6 text-center text-brand-muted">
          No listings match the current filters.
        </div>
      )}
      {totalFiltered > 0 && (
        <div className="mt-6 flex flex-col items-center justify-between gap-3 rounded-lg border border-[#3A4454] bg-[#1A1A1A] p-3 text-sm text-[#B2B2B2] sm:flex-row">
          <div>
            Page {safePage} of {totalPages}
          </div>
          <div className="flex items-center gap-2">
            {safePage <= 1 ? (
              <span className="rounded border border-[#3A4454] px-3 py-1.5 text-xs opacity-40">Previous</span>
            ) : (
              <Link
                prefetch={false}
                href={buildPageHref(Math.max(1, safePage - 1))}
                className="rounded border border-[#3A4454] px-3 py-1.5 text-xs hover:border-[#FF9900] hover:text-[#FF9900]"
              >
                Previous
              </Link>
            )}
            {safePage >= totalPages ? (
              <span className="rounded border border-[#3A4454] px-3 py-1.5 text-xs opacity-40">Next</span>
            ) : (
              <Link
                prefetch={false}
                href={buildPageHref(Math.min(totalPages, safePage + 1))}
                className="rounded border border-[#3A4454] px-3 py-1.5 text-xs hover:border-[#FF9900] hover:text-[#FF9900]"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  )
}
