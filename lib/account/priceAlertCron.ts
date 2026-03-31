import { getListingsPage } from "@/lib/db/listingsRepository"
import { savedListingsHref, savedSearchFiltersToListingsPageQuery } from "@/lib/listings/savedSearchFilters"
import { createPrivilegedServerClient } from "@/lib/supabase/server"
import { toAbsoluteUrl } from "@/lib/seo/site"
import { sendPriceAlertDigestEmail } from "@/lib/resend/sendPriceAlertDigest"

const COOLDOWN_MS = 20 * 60 * 60 * 1000
const DIGEST_PAGE_SIZE = 8

type SavedSearchRow = {
  id: string
  user_id: string
  name: string
  filters: unknown
  alert_enabled: boolean
  last_alerted_at: string | null
}

export type PriceAlertCronResult = {
  usersEmailed: number
  searchesUpdated: number
  errors: string[]
}

function rowPrice(row: Record<string, unknown>): number | null {
  const a = row.asking_price
  const p = row.price_asking
  if (typeof a === "number" && Number.isFinite(a)) return a
  if (typeof p === "number" && Number.isFinite(p)) return p
  return null
}

export async function runPriceAlertCron(): Promise<PriceAlertCronResult> {
  const errors: string[] = []
  let usersEmailed = 0
  let searchesUpdated = 0

  const supabase = createPrivilegedServerClient()
  const { data: searches, error: listError } = await supabase
    .from("saved_searches")
    .select("id, user_id, name, filters, alert_enabled, last_alerted_at")
    .eq("alert_enabled", true)

  if (listError) {
    errors.push(listError.message)
    return { usersEmailed: 0, searchesUpdated: 0, errors }
  }

  const rows = (searches ?? []) as SavedSearchRow[]
  const byUser = new Map<string, SavedSearchRow[]>()
  for (const s of rows) {
    const list = byUser.get(s.user_id) ?? []
    list.push(s)
    byUser.set(s.user_id, list)
  }

  const now = Date.now()

  for (const [userId, userSearches] of byUser) {
    const { data: profileRow } = await supabase
      .from("user_profiles")
      .select("subscription_status")
      .eq("id", userId)
      .maybeSingle()

    if (!profileRow?.subscription_status || profileRow.subscription_status !== "active") {
      continue
    }

    const sections: Array<{
      searchId: string
      searchName: string
      listingsHref: string
      lines: Array<{
        listingId: string
        title: string
        href: string
        priceLabel: string
        flipLabel: string
        priceAtAlert: number | null
      }>
    }> = []
    const toUpdate: string[] = []

    for (const s of userSearches) {
      const last = s.last_alerted_at ? Date.parse(s.last_alerted_at) : 0
      if (Number.isFinite(last) && now - last < COOLDOWN_MS) continue

      const base = savedSearchFiltersToListingsPageQuery(s.filters)
      try {
        const { rows: listingRows } = await getListingsPage({
          ...base,
          page: 1,
          pageSize: DIGEST_PAGE_SIZE,
          sortBy: "flip_desc",
        })
        if (!listingRows.length) continue

        const lines = listingRows.slice(0, 5).map((r) => {
          const rec = r as Record<string, unknown>
          const id = String(rec.id ?? "")
          const title = String(rec.title ?? "Aircraft listing").slice(0, 120)
          const price = rowPrice(rec)
          const priceLabel =
            typeof price === "number" ? `$${Math.round(price).toLocaleString("en-US")}` : "Call / undisclosed"
          const flip = rec.flip_score
          const flipLabel =
            typeof flip === "number" && Number.isFinite(flip) ? `Flip ${flip.toFixed(1)}` : "Flip —"
          return {
            listingId: id,
            title,
            href: toAbsoluteUrl(`/listings/${id}`),
            priceLabel,
            flipLabel,
            priceAtAlert: typeof price === "number" ? price : null,
          }
        })

        sections.push({
          searchId: s.id,
          searchName: s.name || "Saved search",
          listingsHref: toAbsoluteUrl(savedListingsHref(s.filters)),
          lines,
        })
        toUpdate.push(s.id)
      } catch (e) {
        errors.push(`${s.id}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    if (!sections.length) continue

    const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(userId)
    const email = userData?.user?.email?.trim()
    if (userErr || !email) {
      errors.push(`user ${userId}: ${userErr?.message ?? "no email"}`)
      continue
    }

    const displayName =
      userData.user.user_metadata?.full_name ??
      userData.user.user_metadata?.name ??
      email.split("@")[0] ??
      "there"

    try {
      await sendPriceAlertDigestEmail({
        to: email,
        displayName: String(displayName),
        sections: sections.map((s) => ({
          searchName: s.searchName,
          listingsHref: s.listingsHref,
          lines: s.lines.map(({ title, href, priceLabel, flipLabel }) => ({
            title,
            href,
            priceLabel,
            flipLabel,
          })),
        })),
      })
      usersEmailed += 1
    } catch (e) {
      errors.push(`email ${email}: ${e instanceof Error ? e.message : String(e)}`)
      continue
    }

    for (const sec of sections) {
      for (const line of sec.lines) {
        if (!line.listingId) continue
        await supabase.from("price_alert_log").insert({
          search_id: sec.searchId,
          listing_id: line.listingId,
          price_at_alert: line.priceAtAlert,
          delivered: true,
        })
      }
    }

    const ts = new Date().toISOString()
    for (const id of toUpdate) {
      await supabase.from("saved_searches").update({ last_alerted_at: ts, updated_at: ts }).eq("id", id)
      searchesUpdated += 1
    }
  }

  return { usersEmailed, searchesUpdated, errors }
}
