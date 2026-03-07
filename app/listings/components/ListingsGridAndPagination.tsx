import type { ReactNode } from 'react'

type LayoutMode = 'tiles' | 'rows' | 'compact'

type ListingsGridAndPaginationProps = {
  layoutMode: LayoutMode
  prioritizedListings: any[]
  paginatedListings: any[]
  totalFiltered: number
  safePage: number
  totalPages: number
  renderListingCard: (listing: any, mode: LayoutMode) => ReactNode
  setCurrentPage: (updater: (value: number) => number) => void
}

export default function ListingsGridAndPagination({
  layoutMode,
  prioritizedListings,
  paginatedListings,
  totalFiltered,
  safePage,
  totalPages,
  renderListingCard,
  setCurrentPage,
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
        {prioritizedListings.map((l) => renderListingCard(l, layoutMode))}
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
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="rounded border border-[#3A4454] px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40 hover:border-[#FF9900] hover:text-[#FF9900]"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="rounded border border-[#3A4454] px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40 hover:border-[#FF9900] hover:text-[#FF9900]"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </>
  )
}
