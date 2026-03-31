import { redirect } from "next/navigation"
import { createSupabaseRscClient } from "@/lib/supabase/server"
import ScenariosListClient from "./ScenariosListClient"

export default async function ScenariosPage() {
  const supabase = await createSupabaseRscClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/account/login?returnTo=%2Faccount%2Fscenarios")

  const { data: scenarios } = await supabase
    .from("deal_desk_scenarios")
    .select("id, label, listing_id, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })

  return <ScenariosListClient initialScenarios={scenarios ?? []} />
}
