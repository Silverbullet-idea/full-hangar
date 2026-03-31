import { redirect } from "next/navigation"
import { createSupabaseRscClient } from "@/lib/supabase/server"
import SavedSearchesClient from "./SavedSearchesClient"

export default async function SavedSearchesPage() {
  const supabase = await createSupabaseRscClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/account/login?returnTo=%2Faccount%2Fsearches")

  const { data: searches } = await supabase
    .from("saved_searches")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  return <SavedSearchesClient initialSearches={searches ?? []} />
}
