import type { SubscriptionTierId } from "@/lib/stripe/tiers"

export function stripePriceIdForTier(tier: SubscriptionTierId): string {
  const envKey = tier === "scout" ? "STRIPE_PRICE_SCOUT" : "STRIPE_PRICE_PRO"
  const id = process.env[envKey]?.trim()
  if (!id) {
    throw new Error(`Missing ${envKey}`)
  }
  return id
}

export function tierFromStripePriceId(priceId: string | undefined): SubscriptionTierId | null {
  if (!priceId) return null
  const scout = process.env.STRIPE_PRICE_SCOUT?.trim()
  const pro = process.env.STRIPE_PRICE_PRO?.trim()
  if (priceId === scout) return "scout"
  if (priceId === pro) return "pro"
  return null
}
