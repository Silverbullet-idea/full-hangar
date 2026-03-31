import { NextRequest, NextResponse } from "next/server"
import {
  createPrivilegedServerClient,
  createRouteHandlerSupabaseClient,
  mergeSupabaseRouteCookies,
} from "@/lib/supabase/server"
import { getStripe } from "@/lib/stripe/client"
import { stripePriceIdForTier } from "@/lib/stripe/priceIds"
import type { SubscriptionTierId } from "@/lib/stripe/tiers"
import { toAbsoluteUrl } from "@/lib/seo/site"

function isTier(v: unknown): v is SubscriptionTierId {
  return v === "scout" || v === "pro"
}

export async function POST(request: NextRequest) {
  const cookieResponse = NextResponse.next({ request: { headers: request.headers } })
  const supabase = createRouteHandlerSupabaseClient(request, cookieResponse)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const tierRaw =
    typeof body === "object" && body !== null && "tier" in body
      ? (body as { tier?: unknown }).tier
      : undefined
  if (!isTier(tierRaw)) {
    return NextResponse.json({ error: "Body must include tier: scout | pro" }, { status: 400 })
  }

  let priceId: string
  try {
    priceId = stripePriceIdForTier(tierRaw)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return mergeSupabaseRouteCookies(
      cookieResponse,
      NextResponse.json({ error: "Stripe is not configured", detail: message }, { status: 503 }),
    )
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

  let stripeCustomerId = profile?.stripe_customer_id?.trim() ?? null

  try {
    const stripe = getStripe()
    const privileged = createPrivilegedServerClient()

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      })
      stripeCustomerId = customer.id
      const { error: upErr } = await privileged
        .from("user_profiles")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("id", user.id)
      if (upErr) {
        return mergeSupabaseRouteCookies(
          cookieResponse,
          NextResponse.json({ error: upErr.message }, { status: 500 }),
        )
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: toAbsoluteUrl("/account/alerts?subscribed=true"),
      cancel_url: toAbsoluteUrl("/account/alerts"),
      metadata: { supabase_user_id: user.id },
      subscription_data: {
        metadata: { supabase_user_id: user.id, tier: tierRaw },
      },
    })

    if (!session.url) {
      return mergeSupabaseRouteCookies(
        cookieResponse,
        NextResponse.json({ error: "Checkout session missing URL" }, { status: 500 }),
      )
    }

    return mergeSupabaseRouteCookies(
      cookieResponse,
      NextResponse.json({ url: session.url }),
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return mergeSupabaseRouteCookies(
      cookieResponse,
      NextResponse.json({ error: message }, { status: 500 }),
    )
  }
}
