import { Resend } from "resend"

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

const LISTINGS_URL = "https://full-hangar.com/listings"

function buildHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Full Hangar — Access approved</title>
</head>
<body style="margin:0;padding:0;background-color:#0d1117;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#e6edf3;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#0d1117;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:520px;background-color:#161b22;border-radius:12px;border:1px solid #30363d;padding:32px 28px;">
          <tr>
            <td>
              <p style="margin:0 0 8px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#FF9900;">Full Hangar</p>
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#f0f6fc;">Your access has been approved</h1>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#8b949e;">
                You can now browse live aircraft listings, deal scores, and market intelligence across the platform.
              </p>
              <a href="${LISTINGS_URL}" style="display:inline-block;padding:14px 24px;background-color:#FF9900;color:#0d1117;text-decoration:none;font-weight:600;font-size:15px;border-radius:8px;">
                Open listings
              </a>
              <p style="margin:28px 0 0;font-size:13px;color:#6e7681;">
                full-hangar.com
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export async function sendApprovalEmail(to: string): Promise<void> {
  if (!process.env.RESEND_API_KEY || !resend) {
    console.warn("[Resend] RESEND_API_KEY not set — skipping approval email")
    return
  }
  try {
    await resend.emails.send({
      from: "Full Hangar <no-reply@full-hangar.com>",
      to,
      subject: "You're in — Full Hangar access approved",
      html: buildHtml(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`Approval email failed for [${to}]: ${message}`)
  }
}
