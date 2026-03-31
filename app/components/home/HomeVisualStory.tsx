import Image from "next/image"
import { HOME_STORY_IMAGES } from "./homePageImages"

function PipelineGraphic() {
  const steps = ["Ingest", "Normalize", "Score", "Explain"] as const
  return (
    <div
      className="rounded-2xl border border-[var(--fh-border)] bg-[var(--fh-bg2)] p-6 [data-theme=light]:bg-slate-50"
      aria-hidden
    >
      <p className="text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--fh-text-dim)]">
        How data becomes signal
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
        {steps.map((label, i) => (
          <div key={label} className="flex items-center gap-2 sm:gap-3">
            <div className="flex flex-col items-center gap-1">
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--fh-orange)]/40 bg-[var(--fh-orange)]/10 text-xs font-bold text-[var(--fh-orange)]">
                {i + 1}
              </span>
              <span className="text-[11px] font-semibold text-[var(--fh-text)] [data-theme=light]:text-slate-800">{label}</span>
            </div>
            {i < steps.length - 1 ? (
              <span className="hidden text-[var(--fh-text-dim)] sm:inline" aria-hidden>
                →
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

const tileSizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 35vw"

export default function HomeVisualStory() {
  return (
    <section id="how-it-works" className="mt-12 scroll-mt-24">
      <div className="mx-auto mb-8 max-w-3xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-muted">How it works</p>
        <h2
          className="mt-2 text-3xl font-extrabold leading-tight text-brand-white md:text-4xl"
          style={{ fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" }}
        >
          From scattered listings to a clear story
        </h2>
        <p className="mt-3 text-sm text-brand-muted md:text-base">
          We aggregate public marketplace data, enrich it where we can (registry, engine references, avionics parsing), then
          surface scores and comps you can actually read — not a black box.
        </p>
      </div>

      <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-12 lg:gap-5">
        <div className="lg:col-span-7">
          <div className="grid gap-3 sm:grid-cols-2">
            {HOME_STORY_IMAGES.map((tile) => (
              <figure
                key={tile.id}
                className="group overflow-hidden rounded-2xl border border-brand-dark bg-card-bg"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#0b1220]">
                  {tile.kind === "split" ? (
                    <div className="absolute inset-0 grid grid-cols-2 gap-px bg-brand-dark">
                      <div className="relative min-h-0 overflow-hidden">
                        <Image
                          src={tile.left.src}
                          alt={tile.left.alt}
                          fill
                          className="object-cover transition duration-500 group-hover:scale-[1.02]"
                          sizes={`(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 18vw`}
                        />
                      </div>
                      <div className="relative min-h-0 overflow-hidden">
                        <Image
                          src={tile.right.src}
                          alt={tile.right.alt}
                          fill
                          className="object-cover transition duration-500 group-hover:scale-[1.02]"
                          sizes={`(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 18vw`}
                        />
                      </div>
                    </div>
                  ) : (
                    <Image
                      src={tile.src}
                      alt={tile.alt}
                      fill
                      className="object-cover transition duration-500 group-hover:scale-[1.02]"
                      sizes={tileSizes}
                    />
                  )}
                </div>
                <figcaption className="border-t border-brand-dark p-3 text-center text-xs leading-relaxed text-brand-muted">
                  {tile.caption}
                </figcaption>
              </figure>
            ))}
          </div>
          <p className="mt-3 text-center text-[11px] text-brand-muted/80">
            Photos from{" "}
            <a href="https://unsplash.com" className="underline hover:text-brand-orange" target="_blank" rel="noreferrer">
              Unsplash
            </a>{" "}
            — GA / trainer–class listing style.
          </p>
        </div>
        <div className="flex flex-col gap-4 lg:col-span-5">
          <PipelineGraphic />
          <div className="rounded-2xl border border-brand-dark bg-card-bg p-5 text-center lg:text-left">
            <h3 className="text-sm font-bold text-brand-white">What we don&apos;t do</h3>
            <ul className="mt-3 space-y-2 text-sm text-brand-muted">
              <li>We don&apos;t replace a pre-purchase inspection or logbook review.</li>
              <li>We don&apos;t guarantee profit — we help you prioritize and model risk.</li>
              <li>We&apos;re not a broker or escrow agent — yet. Today we&apos;re intelligence.</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
