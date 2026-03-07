import Image from "next/image"
import Link from "next/link"

type HeroImage = {
  src: string
  alt: string
  href: string
  dealBadgeText: string
  dealBadgeTone: "exceptional" | "good" | "neutral"
}

type HomeHeroProps = {
  listingsCount: number
  heroImages: HeroImage[]
}

export default function HomeHero({ listingsCount, heroImages }: HomeHeroProps) {
  const leadImage = heroImages[0]
  const secondaryImages = heroImages.slice(1)

  return (
    <section className="relative overflow-hidden rounded-2xl border border-[#3A4454] bg-[#121923] p-5 md:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(255,153,0,0.14),transparent_45%),radial-gradient(circle_at_80%_100%,rgba(175,77,39,0.2),transparent_40%)]" />
      <div className="relative grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div>
          <div className="mb-4 inline-flex rounded-full border border-[#3A4454] bg-[#141c27] px-3 py-1 text-xs font-semibold tracking-wide text-[#FF9900]">
            Live market intelligence for aircraft buyers
          </div>
          <h1 className="text-3xl font-extrabold leading-tight text-white md:text-5xl">
            Find smarter aircraft deals before everyone else does.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-brand-muted md:text-base">
            Spot undervalued aircraft fast with market comps, risk context, and transparent scoring.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-brand-muted">
            <span className="rounded-full border border-[#3A4454] bg-[#162131] px-2.5 py-1">Real-time listing signals</span>
            <span className="rounded-full border border-[#3A4454] bg-[#162131] px-2.5 py-1">Transparent scoring</span>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              href="/listings"
              className="rounded-md bg-[#FF9900] px-4 py-2 text-sm font-bold !text-black transition hover:bg-[#AF4D27] hover:!text-white"
            >
              Browse Listings
            </Link>
            <a
              href="#how-we-score"
              className="rounded-md border border-[#3A4454] bg-[#161f2d] px-4 py-2 text-sm font-semibold text-[#d7deea] transition hover:border-[#FF9900] hover:text-[#FF9900]"
            >
              See How We Score
            </a>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-[#3A4454] bg-[#141c27] p-3">
              <div className="text-xs text-brand-muted">Tracked listings</div>
              <div className="mt-1 text-xl font-bold text-white">{listingsCount.toLocaleString()}</div>
            </div>
            <div className="rounded-lg border border-[#3A4454] bg-[#141c27] p-3">
              <div className="text-xs text-brand-muted">Focus</div>
              <div className="mt-1 text-sm font-semibold text-white">Undervalued deals under $50k</div>
            </div>
            <div className="rounded-lg border border-[#3A4454] bg-[#141c27] p-3">
              <div className="text-xs text-brand-muted">Decision support</div>
              <div className="mt-1 text-sm font-semibold text-white">Risk + pricing confidence included</div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {leadImage ? (
            <Link
              href={leadImage.href}
              className="group relative col-span-2 overflow-hidden rounded-xl border border-[#3A4454] bg-[#1A1A1A]"
            >
              <Image
                src={leadImage.src}
                alt={leadImage.alt}
                width={960}
                height={540}
                unoptimized
                priority
                className="h-60 w-full object-cover transition duration-500 group-hover:scale-[1.04] md:h-72"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-black/15 to-transparent" />
              <div className={`absolute right-[-8px] top-3 z-10 px-4 py-1 text-sm font-extrabold tracking-[0.01em] shadow-[0_10px_24px_rgba(0,0,0,0.45)] md:px-8 md:py-1.5 md:text-base ${badgeClassForTone(leadImage.dealBadgeTone)}`}>
                {leadImage.dealBadgeText}
              </div>
            </Link>
          ) : null}
          {secondaryImages.map((image, index) => (
            <Link
              key={`${image.src}-${index}`}
              href={image.href}
              className={`group relative overflow-hidden rounded-xl border border-[#3A4454] bg-[#1A1A1A] ${
                secondaryImages.length % 2 === 1 && index === secondaryImages.length - 1 ? "col-span-2" : ""
              }`}
            >
              <Image
                src={image.src}
                alt={image.alt}
                width={640}
                height={420}
                unoptimized
                priority={index === 0}
                className="h-32 w-full object-cover transition duration-300 group-hover:scale-[1.03] md:h-40"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
              <div className={`absolute right-[-8px] top-2 z-10 px-3 py-0.5 text-[10px] font-extrabold tracking-[0.01em] shadow-[0_8px_20px_rgba(0,0,0,0.45)] md:px-5 md:py-1 md:text-xs ${badgeClassForTone(image.dealBadgeTone)}`}>
                {image.dealBadgeText}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

function badgeClassForTone(tone: HeroImage["dealBadgeTone"]) {
  if (tone === "exceptional") {
    return "bg-[#0f7b2f] text-[#eaffee] [clip-path:polygon(10px_0,100%_0,calc(100%-10px)_50%,100%_100%,10px_100%,0_50%)]"
  }
  if (tone === "good") {
    return "bg-[#0b61b5] text-[#eaf4ff] [clip-path:polygon(10px_0,100%_0,calc(100%-10px)_50%,100%_100%,10px_100%,0_50%)]"
  }
  return "bg-[#af4d27] text-[#fff4ee] [clip-path:polygon(10px_0,100%_0,calc(100%-10px)_50%,100%_100%,10px_100%,0_50%)]"
}
