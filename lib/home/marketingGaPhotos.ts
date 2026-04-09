/**
 * General-aviation marketing stills (high-wing / Cessna-class), Unsplash CDN.
 * `next.config.ts` allowlists `images.unsplash.com`.
 * Keep in sync with `app/components/home/homePageImages.ts` (shared GA keys).
 */
const q = "auto=format&fit=crop&w=2000&q=85"

export const HOME_GA_PHOTOS = {
  rampTarmac: `https://images.unsplash.com/photo-1715792325130-21450778b2d4?${q}`,
  cessna172Inflight: `https://images.unsplash.com/photo-1690944210909-9a97ba72a50b?${q}`,
  cockpit: `https://images.unsplash.com/photo-1681157403941-44ce5a577b90?${q}`,
  rampWide: `https://images.unsplash.com/photo-1755772210243-ef53084e5e06?${q}`,
  noseDetail: `https://images.unsplash.com/photo-1764675904045-c8ebfb6be52c?${q}`,
} as const
