export default function ListingsLoading() {
  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
          @keyframes fh-listings-shimmer {
            0% { opacity: 0.5; }
            50% { opacity: 0.85; }
            100% { opacity: 0.5; }
          }
          .fh-listings-shimmer {
            animation: fh-listings-shimmer 1.4s ease-in-out infinite;
          }
        `,
        }}
      />
      <div className="min-h-[60vh] space-y-6">
        <div className="space-y-2">
          <div className="fh-listings-shimmer h-8 w-64 max-w-[80%] rounded-md bg-[#1c2128]" />
          <div className="fh-listings-shimmer h-4 w-full max-w-md rounded bg-[#1c2128]" />
        </div>
        <div className="flex flex-wrap gap-3 border-b border-[var(--fh-border)] pb-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={`bar-${i}`} className="fh-listings-shimmer h-9 w-24 rounded-lg bg-[#1c2128]" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={`sk-${i}`}
              className="overflow-hidden rounded-xl border border-[#30363d] bg-[#0d1117]"
            >
              <div className="fh-listings-shimmer aspect-[4/3] w-full bg-[#1c2128]" />
              <div className="space-y-3 p-3.5">
                <div className="fh-listings-shimmer h-5 w-[80%] rounded bg-[#1c2128]" />
                <div className="fh-listings-shimmer h-4 w-[55%] rounded bg-[#1c2128]" />
                <div className="flex justify-between gap-2">
                  <div className="fh-listings-shimmer h-10 w-10 rounded-full bg-[#1c2128]" />
                  <div className="fh-listings-shimmer h-6 w-20 rounded bg-[#1c2128]" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
