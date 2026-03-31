export type SubscriptionTierId = "scout" | "pro"

export type SubscriptionTierCard = {
  id: SubscriptionTierId
  /** Card / marketing title */
  displayName: string
  /** Monthly price in USD (single source of truth for UI labels) */
  monthlyUsd: number
  /** Bullet features for pricing card */
  features: readonly string[]
}

export const SUBSCRIPTION_TIER_CARDS: readonly SubscriptionTierCard[] = [
  {
    id: "scout",
    displayName: "Deal Scout",
    monthlyUsd: 49,
    features: [
      "Daily email digest of top undervalued listings matching your saved searches",
      "Saved search alert toggles",
      "Up to 5 saved searches",
    ],
  },
  {
    id: "pro",
    displayName: "Deal Pro",
    monthlyUsd: 99,
    features: [
      "Everything in Deal Scout",
      "Immediate alerts when a HOT-tier listing matches your filters",
      "Unlimited saved searches",
      "Priority access to new features",
    ],
  },
] as const

export function getTierCard(id: SubscriptionTierId): SubscriptionTierCard {
  const card = SUBSCRIPTION_TIER_CARDS.find((t) => t.id === id)
  if (!card) {
    throw new Error(`Unknown tier: ${id}`)
  }
  return card
}

export function formatSubscribeCta(monthlyUsd: number): string {
  return `Subscribe — $${monthlyUsd}/mo`
}

export function tierBadgeLabel(tier: SubscriptionTierId): string {
  return tier === "scout" ? "Deal Scout" : "Deal Pro"
}
