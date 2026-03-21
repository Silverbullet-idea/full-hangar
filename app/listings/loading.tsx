export default function ListingsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading listings">
      <div className="h-8 w-64 max-w-full animate-pulse rounded bg-[#2a3344]" />
      <div className="mb-6 h-24 w-full max-w-6xl animate-pulse rounded-lg border border-[#3A4454] bg-[#1A1A1A]" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-64 animate-pulse rounded-lg border border-[#3A4454] bg-[#141922]"
          />
        ))}
      </div>
    </div>
  )
}
