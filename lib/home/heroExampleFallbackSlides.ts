import { HOME_GA_PHOTOS } from "@/lib/home/marketingGaPhotos"

export type HeroExampleCarouselSlide = {
  src: string
  alt: string
  label: string
}

/** Unsplash fallback when no live Cessna 172 passes gallery validation. */
export const HERO_EXAMPLE_CAROUSEL_FALLBACK_SLIDES: readonly HeroExampleCarouselSlide[] = [
  {
    src: HOME_GA_PHOTOS.rampTarmac,
    alt: "High-wing single on the ramp — typical seller listing lead photo",
    label: "Ramp",
  },
  {
    src: HOME_GA_PHOTOS.cessna172Inflight,
    alt: "Cessna 172–class aircraft in flight — air-to-air listing style",
    label: "In flight",
  },
  {
    src: HOME_GA_PHOTOS.cockpit,
    alt: "Light aircraft cockpit — panel and avionics listing photo",
    label: "Panel",
  },
  {
    src: HOME_GA_PHOTOS.rampWide,
    alt: "Single-engine aircraft on the ramp — exterior listing photo",
    label: "Exterior",
  },
  {
    src: HOME_GA_PHOTOS.noseDetail,
    alt: "Propeller and nose detail — supplementary listing photo",
    label: "Detail",
  },
]
