/**
 * General-aviation listing-style photos (Unsplash CDN).
 * `next.config.ts` allowlists `images.unsplash.com`.
 */
const q = "auto=format&fit=crop&w=2000&q=85"

export const HOME_GA_PHOTOS = {
  rampTarmac: `https://images.unsplash.com/photo-1642643629642-649a837ac0b5?${q}`,
  cessna172Inflight: `https://images.unsplash.com/photo-1691394045643-aafd8e17deab?${q}`,
  cockpit: `https://images.unsplash.com/photo-1681157405318-165c6c3a087b?${q}`,
  rampWide: `https://images.unsplash.com/photo-1593938345757-404e880d427d?${q}`,
  noseDetail: `https://images.unsplash.com/photo-1678116983444-bf5e8832392e?${q}`,
  analyticsScreen: `https://images.unsplash.com/photo-1551288049-bebda4e38f71?${q}`,
  handshake: `https://images.unsplash.com/photo-1521791136064-7986c2920216?${q}`,
} as const

export type HomeStoryTile =
  | {
      kind: "single"
      id: string
      src: string
      alt: string
      caption: string
    }
  | {
      kind: "split"
      id: string
      caption: string
      left: { src: string; alt: string }
      right: { src: string; alt: string }
    }

/** “How it works” grid — each visual aligned to its caption. */
export const HOME_STORY_IMAGES: readonly HomeStoryTile[] = [
  {
    kind: "single",
    id: "ramp",
    src: HOME_GA_PHOTOS.rampTarmac,
    alt: "High-wing single-engine aircraft on the ramp — typical marketplace listing lead photo",
    caption: "Listings from the marketplaces buyers already use — normalized into one place.",
  },
  {
    kind: "split",
    id: "panel-powerplant",
    caption: "Panel and powerplant signals extracted from descriptions — not guesswork.",
    left: {
      src: HOME_GA_PHOTOS.cockpit,
      alt: "Light aircraft cockpit — glass and steam gauges we read from listing text",
    },
    right: {
      src: HOME_GA_PHOTOS.noseDetail,
      alt: "Propeller and engine area — powerplant cues from photos and descriptions",
    },
  },
  {
    kind: "single",
    id: "analytics",
    src: HOME_GA_PHOTOS.analyticsScreen,
    alt: "Data charts on a laptop — analogous to traceable scores, comps, and confidence signals",
    caption: "Scores and comps you can trace — triage before logbooks and PPI.",
  },
  {
    kind: "single",
    id: "handshake",
    src: HOME_GA_PHOTOS.handshake,
    alt: "Two people shaking hands in a professional setting",
    caption: "Built for serious buyers and sellers who want clarity, not hype.",
  },
]
