import type { MetadataRoute } from "next"
import { toAbsoluteUrl } from "../lib/seo/site"

const CATEGORY_LANDING_PATHS = [
  "/listings?category=single",
  "/listings?category=multi",
  "/listings?category=se_turboprop",
  "/listings?category=me_turboprop",
  "/listings?category=jet",
  "/listings?category=helicopter",
  "/listings?category=lsp",
  "/listings?category=sea",
]

const CURATED_MAKE_LANDING_PATHS = [
  "/listings?make=Cessna",
  "/listings?make=Piper",
  "/listings?make=Beechcraft",
  "/listings?make=Cirrus",
  "/listings?make=Mooney",
  "/listings?make=Diamond",
]

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const baseEntries: MetadataRoute.Sitemap = [
    {
      url: toAbsoluteUrl("/"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: toAbsoluteUrl("/listings"),
      lastModified: now,
      changeFrequency: "hourly",
      priority: 0.95,
    },
    {
      url: toAbsoluteUrl("/privacy"),
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.25,
    },
    {
      url: toAbsoluteUrl("/terms"),
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.25,
    },
  ]

  const curatedEntries = [...CATEGORY_LANDING_PATHS, ...CURATED_MAKE_LANDING_PATHS].map((path) => ({
    url: toAbsoluteUrl(path),
    lastModified: now,
    changeFrequency: "daily" as const,
    priority: 0.8,
  }))

  return [...baseEntries, ...curatedEntries]
}
