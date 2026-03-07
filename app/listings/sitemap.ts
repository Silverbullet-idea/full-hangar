import type { MetadataRoute } from "next"
import { createServerClient } from "../../lib/supabase/server"
import { toAbsoluteUrl } from "../../lib/seo/site"

type ListingSitemapRow = {
  id: string | null
  source_id: string | null
  last_seen_date: string | null
  created_at?: string | null
}

const BATCH_SIZE = 500
const MAX_ROWS = 20000

function normalizeLastModified(rawValue: string | null | undefined): Date {
  if (!rawValue) return new Date()
  const parsed = new Date(rawValue)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createServerClient()
  const rows: ListingSitemapRow[] = []

  try {
    for (let offset = 0; offset < MAX_ROWS; offset += BATCH_SIZE) {
      const { data, error } = await supabase
        .from("public_listings")
        .select("id,source_id,last_seen_date")
        .eq("is_active", true)
        .order("last_seen_date", { ascending: false, nullsFirst: false })
        .range(offset, offset + BATCH_SIZE - 1)

      if (error) break
      const batch = (data ?? []) as ListingSitemapRow[]
      if (!batch.length) break
      rows.push(...batch)
      if (batch.length < BATCH_SIZE) break
    }
  } catch {
    return []
  }

  return rows
    .map((row) => {
      const listingKey = String(row.source_id || row.id || "").trim()
      if (!listingKey) return null
      return {
        url: toAbsoluteUrl(`/listings/${listingKey}`),
        lastModified: normalizeLastModified(row.last_seen_date),
        changeFrequency: "daily" as const,
        priority: 0.7,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
}
