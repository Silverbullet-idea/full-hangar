import type { SupabaseClient } from "@supabase/supabase-js"
import type Stripe from "stripe"
import { tierFromStripePriceId } from "@/lib/stripe/priceIds"
import type { SubscriptionTierId } from "@/lib/stripe/tiers"

function tierFromSubscription(sub: Stripe.Subscription): SubscriptionTierId | null {
  const metaTier = sub.metadata?.tier
  if (metaTier === "scout" || metaTier === "pro") {
    return metaTier
  }
  const priceId = sub.items.data[0]?.price?.id
  return tierFromStripePriceId(priceId)
}

function shouldClearTier(status: Stripe.Subscription.Status): boolean {
  return (
    status === "canceled" ||
    status === "incomplete_expired" ||
    status === "unpaid"
  )
}

export async function syncProfileFromStripeSubscription(
  supabase: SupabaseClient,
  args: {
    userId: string
    stripeCustomerId: string
    subscription: Stripe.Subscription
  },
): Promise<void> {
  const { userId, stripeCustomerId, subscription } = args
  const status = subscription.status
  const tier = shouldClearTier(status) ? null : tierFromSubscription(subscription)
  const periodEndUnix = subscription.items.data[0]?.current_period_end
  const periodEnd =
    typeof periodEndUnix === "number" && Number.isFinite(periodEndUnix)
      ? new Date(periodEndUnix * 1000).toISOString()
      : null

  const { error } = await supabase
    .from("user_profiles")
    .update({
      stripe_customer_id: stripeCustomerId,
      subscription_tier: tier,
      subscription_status: status,
      subscription_period_end: periodEnd,
    })
    .eq("id", userId)

  if (error) {
    throw new Error(`user_profiles update failed: ${error.message}`)
  }
}

export async function clearSubscriptionOnProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("user_profiles")
    .update({
      subscription_tier: null,
      subscription_status: "canceled",
      subscription_period_end: null,
    })
    .eq("id", userId)

  if (error) {
    throw new Error(`user_profiles clear subscription failed: ${error.message}`)
  }
}

export async function resolveUserIdForStripeCustomer(
  supabase: SupabaseClient,
  stripeCustomerId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("id")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle()

  if (error) {
    throw new Error(`resolve user by customer failed: ${error.message}`)
  }
  return data?.id ?? null
}
