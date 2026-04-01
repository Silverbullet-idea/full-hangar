import { createSupabaseRscClient } from "@/lib/supabase/server"
import SiteHeader from "./SiteHeader"

export default async function SiteHeaderShell() {
  const supabase = await createSupabaseRscClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let hasSellListings = false
  if (user) {
    const { count } = await supabase
      .from("seller_listings")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
    hasSellListings = (count ?? 0) > 0
  }

  return <SiteHeader hasSellListings={hasSellListings} />
}
