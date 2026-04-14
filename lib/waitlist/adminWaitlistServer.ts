import { cookies, headers } from "next/headers";

export type WaitlistRequestRow = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  status: string;
  created_at: string | null;
};

function normalizeRows(payload: unknown): WaitlistRequestRow[] {
  if (!payload || typeof payload !== "object") return [];
  const raw = (payload as Record<string, unknown>).requests ?? (payload as Record<string, unknown>).rows;
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id ?? ""),
      full_name: String(row.name ?? row.full_name ?? ""),
      email: String(row.email ?? ""),
      role: String(row.role ?? ""),
      status: String(row.status ?? "pending").toLowerCase(),
      created_at:
        row.requested_at != null
          ? String(row.requested_at)
          : row.created_at != null
            ? String(row.created_at)
            : null,
    };
  });
}

/** Server-only fetch to the admin waitlist API (internal session cookie). */
export async function fetchAdminWaitlistFromApi(): Promise<{
  rows: WaitlistRequestRow[];
  pendingCount: number;
  approvedCount: number;
  total: number;
  error?: string;
}> {
  try {
    const h = await headers();
    const host = h.get("host") ?? "localhost:3001";
    const proto = h.get("x-forwarded-proto") ?? "http";
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.getAll().map((c) => `${c.name}=${c.value}`).join("; ");
    const base = `${proto}://${host}`;
    const res = await fetch(`${base}/api/admin/waitlist`, {
      headers: {
        Cookie: cookieHeader,
      },
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        rows: [],
        pendingCount: 0,
        approvedCount: 0,
        total: 0,
        error: typeof json.error === "string" ? json.error : `HTTP ${res.status}`,
      };
    }
    const rows = normalizeRows(json);
    const counts = json.counts as Record<string, unknown> | undefined;
    const pendingCount =
      typeof counts?.pending === "number"
        ? counts.pending
        : typeof json.pending_count === "number"
          ? json.pending_count
          : rows.filter((r) => r.status === "pending").length;
    const approvedCount =
      typeof counts?.approved === "number"
        ? counts.approved
        : typeof json.approved_count === "number"
          ? json.approved_count
          : rows.filter((r) => r.status === "approved").length;
    const total =
      typeof counts?.total === "number" ? counts.total : typeof json.total === "number" ? json.total : rows.length;
    return { rows, pendingCount, approvedCount, total };
  } catch (e) {
    return {
      rows: [],
      pendingCount: 0,
      approvedCount: 0,
      total: 0,
      error: e instanceof Error ? e.message : "fetch failed",
    };
  }
}

export async function fetchWaitlistPendingCountOnly(): Promise<number> {
  const { pendingCount } = await fetchAdminWaitlistFromApi();
  return pendingCount;
}
