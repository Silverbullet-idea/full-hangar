import type { SupabaseClient } from "@supabase/supabase-js"
import { sendApprovalEmail } from "@/lib/email/sendApprovalEmail"

export type WaitlistRequestRow = {
  id: string
  email: string
  status: string
  notes: string | null
}

export async function approveWaitlistRequest(
  db: SupabaseClient,
  row: WaitlistRequestRow,
  approvedBy: string,
): Promise<void> {
  const emailNorm = row.email.trim().toLowerCase()

  await db
    .from("waitlist_requests")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: approvedBy,
    })
    .eq("id", row.id)

  const { data: authUid, error: rpcErr } = await db.rpc("auth_user_id_by_email", { _email: emailNorm })
  if (rpcErr) {
    console.error("[approveWaitlistRequest] auth_user_id_by_email:", rpcErr.message)
  }

  const uid = typeof authUid === "string" ? authUid : null
  if (uid) {
    await db
      .from("user_profiles")
      .update({
        access_status: "approved",
        access_granted_at: new Date().toISOString(),
        email: emailNorm,
      })
      .eq("id", uid)
  } else {
    const noteLine = "pre-approved: account not yet created"
    const nextNotes = row.notes?.includes(noteLine)
      ? row.notes
      : row.notes
        ? `${row.notes}\n${noteLine}`
        : noteLine
    await db.from("waitlist_requests").update({ notes: nextNotes }).eq("id", row.id)
  }

  await sendApprovalEmail(emailNorm)
}
