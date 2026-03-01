import Link from "next/link"

export default function PaginationControls({ page, hasNextPage, searchParams }) {
  const prevParams = new URLSearchParams(searchParams)
  prevParams.set("page", String(Math.max(1, page - 1)))
  const nextParams = new URLSearchParams(searchParams)
  nextParams.set("page", String(page + 1))

  return (
    <div className="pagination">
      {page > 1 ? (
        <Link className="button-link" href={`/listings?${prevParams.toString()}`}>
          Previous
        </Link>
      ) : (
        <span className="button-link subtle">Previous</span>
      )}
      <span className="subtle">Page {page}</span>
      {hasNextPage ? (
        <Link className="button-link" href={`/listings?${nextParams.toString()}`}>
          Next
        </Link>
      ) : (
        <span className="button-link subtle">Next</span>
      )}
    </div>
  )
}
