import { NextRequest, NextResponse } from "next/server"
import { runPriceAlertCron } from "@/lib/account/priceAlertCron"

export const maxDuration = 300

function authorizeCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) {
    return process.env.NODE_ENV !== "production"
  }
  const auth = request.headers.get("authorization")
  return auth === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await runPriceAlertCron()
    return NextResponse.json({
      ok: true,
      usersEmailed: result.usersEmailed,
      searchesUpdated: result.searchesUpdated,
      errors: result.errors,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
