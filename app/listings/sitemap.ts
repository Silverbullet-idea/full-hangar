import type { MetadataRoute } from "next"
import { createReadServerClient, isPublicSupabaseConfigured } from "../../lib/supabase/server"
import { toAbsoluteUrl } from "../../lib/seo/site"

/** Avoid baking an empty sitemap at build when env/DB is unavailable; regenerate per request. */
export const dynamic = "force-dynamic"

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
  const rows: ListingSitemapRow[] = []

  // Without anon URL+key we cannot call Supabase from this route; service-role alone is not enough for createServerClient().
  if (!isPublicSupabaseConfigured()) {
    console.warn(
      "[sitemap:listings] Skipping entries: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY for listing URLs.",
    )
    return []
  }

  try {
    const supabase = createReadServerClient()
    for (let offset = 0; offset < MAX_ROWS; offset += BATCH_SIZE) {
      const { data, error } = await supabase
        .from("public_listings")
        .select("id,source_id,last_seen_date")
        .eq("is_active", true)
        .order("last_seen_date", { ascending: false, nullsFirst: false })
        .range(offset, offset + BATCH_SIZE - 1)

      if (error) {
        console.error("[sitemap:listings] public_listings batch failed", { offset, message: error.message, code: error.code })
        break
      }
      const batch = (data ?? []) as ListingSitemapRow[]
      if (!batch.length) break
      rows.push(...batch)
      if (batch.length < BATCH_SIZE) break
    }
  } catch (error) {
    console.error("[sitemap:listings] Failed to generate dynamic listing sitemap entries", error)
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
