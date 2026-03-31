import { redirect } from "next/navigation"
import { createSupabaseRscClient } from "@/lib/supabase/server"
import AccountDashboardClient from "./AccountDashboardClient"

export default async function AccountPage() {
  const supabase = await createSupabaseRscClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect("/account/login?returnTo=%2Faccount")
  }

  const { data: profile } = await supabase.from("user_profiles").select("*").eq("id", user.id).maybeSingle()

  const [searchesQ, scenariosQ] = await Promise.all([
    supabase.from("saved_searches").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("deal_desk_scenarios").select("id", { count: "exact", head: true }).eq("user_id", user.id),
  ])

  return (
    <AccountDashboardClient
      userEmail={user.email ?? ""}
      profile={profile}
      searchCount={searchesQ.count ?? 0}
      scenarioCount={scenariosQ.count ?? 0}
      memberSince={(profile?.created_at as string | undefined) ?? new Date().toISOString()}
    />
  )
}
