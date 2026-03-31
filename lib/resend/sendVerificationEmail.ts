import { Resend } from "resend"
import { WelcomeEmail } from "./templates/WelcomeEmail"

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

export async function sendWelcomeEmail(to: string, displayName: string) {
  if (!process.env.RESEND_API_KEY || !resend) {
    console.warn("[Resend] RESEND_API_KEY not set — skipping email")
    return
  }
  const fromDomain = process.env.RESEND_FROM_EMAIL ?? "noreply@full-hangar.com"
  await resend.emails.send({
    from: `Full Hangar <${fromDomain}>`,
    to,
    subject: "Welcome to Full Hangar",
    react: WelcomeEmail({ displayName }),
  })
}
