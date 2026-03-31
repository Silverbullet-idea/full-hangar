import { redirect } from "next/navigation"
import { createSupabaseRscClient } from "@/lib/supabase/server"
import AccountProfileClient from "./AccountProfileClient"

export default async function AccountProfilePage() {
  const supabase = await createSupabaseRscClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect("/account/login?returnTo=%2Faccount%2Fprofile")
  }

  const { data: profile } = await supabase.from("user_profiles").select("*").eq("id", user.id).maybeSingle()

  return <AccountProfileClient userEmail={user.email ?? ""} initialProfile={profile} />
}
