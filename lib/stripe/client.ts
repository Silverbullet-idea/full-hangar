import Stripe from "stripe"

let stripe: Stripe | null = null

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim()
  if (!key) {
    throw new Error("Missing STRIPE_SECRET_KEY")
  }
  if (!stripe) {
    stripe = new Stripe(key, { typescript: true })
  }
  return stripe
}
