/**
 * General-aviation marketing stills (high-wing / Cessna-class), Unsplash CDN.
 * `next.config.ts` allowlists `images.unsplash.com`.
 *
 * Photo pages (Unsplash License): ramp
 * https://unsplash.com/photos/a-small-airplane-sitting-on-top-of-an-airport-tarmac-cbmjRCQzhGk
 * in-flight Cessna 172 SP: https://unsplash.com/photos/a-small-airplane-flying-through-a-cloudy-sky--kP9oWG-Yg8
 * cockpit: https://unsplash.com/photos/a-view-of-the-cockpit-of-a-small-plane-GKXSknPiMes
 * ramp (wide): https://unsplash.com/photos/white-airplane-on-gray-concrete-ground-under-white-clouds-during-daytime-ipDtDjBn5zs
 * nose: https://unsplash.com/photos/a-close-up-of-the-nose-of-an-airplane-4z2B04ZUy9g
 */
const q = "auto=format&fit=crop&w=2000&q=85"

export const HOME_GA_PHOTOS = {
  rampTarmac: `https://images.unsplash.com/photo-1642643629642-649a837ac0b5?${q}`,
  cessna172Inflight: `https://images.unsplash.com/photo-1691394045643-aafd8e17deab?${q}`,
  cockpit: `https://images.unsplash.com/photo-1681157405318-165c6c3a087b?${q}`,
  rampWide: `https://images.unsplash.com/photo-1593938345757-404e880d427d?${q}`,
  noseDetail: `https://images.unsplash.com/photo-1678116983444-bf5e8832392e?${q}`,
} as const
