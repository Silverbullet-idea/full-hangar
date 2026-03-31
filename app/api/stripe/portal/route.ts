import { NextRequest, NextResponse } from "next/server"
import {
  createRouteHandlerSupabaseClient,
  mergeSupabaseRouteCookies,
} from "@/lib/supabase/server"
import { getStripe } from "@/lib/stripe/client"
import { toAbsoluteUrl } from "@/lib/seo/site"

export async function POST(request: NextRequest) {
  const cookieResponse = NextResponse.next({ request: { headers: request.headers } })
  const supabase = createRouteHandlerSupabaseClient(request, cookieResponse)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: profile, error: profileErr } = await supabase
    .from("user_profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle()

  if (profileErr) {
    return mergeSupabaseRouteCookies(
      cookieResponse,
      NextResponse.json({ error: profileErr.message }, { status: 500 }),
    )
  }

  const customerId = profile?.stripe_customer_id?.trim()
  if (!customerId) {
    return mergeSupabaseRouteCookies(
      cookieResponse,
      NextResponse.json({ error: "No Stripe customer on file" }, { status: 400 }),
    )
  }

  try {
    const stripe = getStripe()
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: toAbsoluteUrl("/account/alerts"),
    })
    return mergeSupabaseRouteCookies(cookieResponse, NextResponse.json({ url: portal.url }))
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return mergeSupabaseRouteCookies(
      cookieResponse,
      NextResponse.json({ error: message }, { status: 500 }),
    )
  }
}
