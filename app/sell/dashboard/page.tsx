import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { createSupabaseRscClient } from "@/lib/supabase/server"
import { getSellerListings } from "@/lib/sell/dashboardRepository"
import SellerDashboardClient from "./SellerDashboardClient"

export const metadata: Metadata = {
  title: "My listings — FullHangar",
}

export default async function SellDashboardPage() {
  const supabase = await createSupabaseRscClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect("/account/login?returnTo=%2Fsell%2Fdashboard")
  }

  const listings = await getSellerListings()
  return <SellerDashboardClient initialListings={listings} />
}
