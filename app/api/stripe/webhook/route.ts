import { NextRequest, NextResponse } from "next/server"
import type Stripe from "stripe"
import { getStripe } from "@/lib/stripe/client"
import {
  clearSubscriptionOnProfile,
  resolveUserIdForStripeCustomer,
  syncProfileFromStripeSubscription,
} from "@/lib/stripe/syncProfileSubscription"
import { createPrivilegedServerClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  if (!webhookSecret) {
    return NextResponse.json({ error: "Missing STRIPE_WEBHOOK_SECRET" }, { status: 500 })
  }

  const signature = request.headers.get("stripe-signature")
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 })
  }

  const rawBody = await request.text()
  let event: Stripe.Event
  try {
    const stripe = getStripe()
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Webhook signature verification failed: ${message}` }, { status: 400 })
  }

  const supabase = createPrivilegedServerClient()
  const stripe = getStripe()

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode !== "subscription") {
          break
        }
        const userId = session.metadata?.supabase_user_id?.trim()
        const customerRaw = session.customer
        const customerId =
          typeof customerRaw === "string" ? customerRaw : customerRaw?.id ?? null
        const subRaw = session.subscription
        const subscriptionId =
          typeof subRaw === "string" ? subRaw : subRaw && "id" in subRaw ? subRaw.id : null

        if (!customerId || !subscriptionId) {
          console.error("[stripe webhook] checkout.session.completed missing customer or subscription")
          break
        }

        let resolvedUserId = userId ?? null
        if (!resolvedUserId) {
          resolvedUserId = await resolveUserIdForStripeCustomer(supabase, customerId)
        }
        if (!resolvedUserId) {
          console.error("[stripe webhook] checkout.session.completed could not resolve user id")
          break
        }

        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        await syncProfileFromStripeSubscription(supabase, {
          userId: resolvedUserId,
          stripeCustomerId: customerId,
          subscription,
        })
        break
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription
        const customerRaw = subscription.customer
        const customerId =
          typeof customerRaw === "string" ? customerRaw : customerRaw?.id ?? null
        if (!customerId) break

        let userId = subscription.metadata?.supabase_user_id?.trim() ?? null
        if (!userId) {
          userId = await resolveUserIdForStripeCustomer(supabase, customerId)
        }
        if (!userId) {
          console.error("[stripe webhook] customer.subscription.updated could not resolve user id")
          break
        }

        await syncProfileFromStripeSubscription(supabase, {
          userId,
          stripeCustomerId: customerId,
          subscription,
        })
        break
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription
        const customerRaw = subscription.customer
        const customerId =
          typeof customerRaw === "string" ? customerRaw : customerRaw?.id ?? null
        if (!customerId) break

        let userId = subscription.metadata?.supabase_user_id?.trim() ?? null
        if (!userId) {
          userId = await resolveUserIdForStripeCustomer(supabase, customerId)
        }
        if (!userId) {
          console.error("[stripe webhook] customer.subscription.deleted could not resolve user id")
          break
        }

        await clearSubscriptionOnProfile(supabase, userId)
        break
      }
      default:
        break
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error("[stripe webhook]", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
