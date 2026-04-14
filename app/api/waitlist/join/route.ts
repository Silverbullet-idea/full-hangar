import { NextRequest, NextResponse } from "next/server"
import { createPrivilegedServerClient } from "@/lib/supabase/server"

const ROLES = new Set(["buyer", "seller", "broker"])

export async function POST(request: NextRequest) {
  let body: { name?: unknown; email?: unknown; role?: unknown }
  try {
    body = (await request.json()) as { name?: unknown; email?: unknown; role?: unknown }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const name = typeof body.name === "string" ? body.name.trim() : ""
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const role = typeof body.role === "string" ? body.role.trim() : ""

  if (!name || !email || !role) {
    return NextResponse.json({ error: "name, email, and role are required" }, { status: 400 })
  }
  if (!ROLES.has(role)) {
    return NextResponse.json({ error: "role must be buyer, seller, or broker" }, { status: 400 })
  }

  try {
    const db = createPrivilegedServerClient()
    const { error } = await db.from("waitlist_requests").upsert(
      {
        name,
        email,
        role,
        status: "pending",
        requested_at: new Date().toISOString(),
        approved_at: null,
        approved_by: null,
      },
      { onConflict: "email" },
    )

    if (error) {
      console.error("[waitlist/join]", error.message)
      return NextResponse.json({ error: "Unable to join waitlist" }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: "You're on the list" })
  } catch (e) {
    console.error("[waitlist/join]", e)
    return NextResponse.json({ error: "Unable to join waitlist" }, { status: 500 })
  }
}
