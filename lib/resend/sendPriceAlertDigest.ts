import { Resend } from "resend"
import { PriceAlertDigestEmail, type PriceAlertSection } from "./templates/PriceAlertDigestEmail"

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

export async function sendPriceAlertDigestEmail(args: {
  to: string
  displayName: string
  sections: PriceAlertSection[]
}) {
  if (!process.env.RESEND_API_KEY || !resend) {
    console.warn("[Resend] RESEND_API_KEY not set — skipping price alert digest")
    return
  }
  if (!args.sections.length) return
  const fromDomain = process.env.RESEND_FROM_EMAIL ?? "noreply@full-hangar.com"
  await resend.emails.send({
    from: `Full Hangar <${fromDomain}>`,
    to: args.to,
    subject: `Full Hangar: ${args.sections.length} saved search${args.sections.length > 1 ? "es" : ""} with matches`,
    react: PriceAlertDigestEmail({ displayName: args.displayName, sections: args.sections }),
  })
}
