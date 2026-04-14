"use client";

import { useCallback, useMemo, useState } from "react";
import type { WaitlistRequestRow } from "@/lib/waitlist/adminWaitlistServer";

type Tab = "all" | "pending" | "approved";

function roleBadge(role: string) {
  const r = role.toLowerCase();
  if (r === "seller" || r.includes("sell")) {
    return <span className="rounded-full bg-[#FF9900]/15 px-2 py-0.5 text-[11px] font-semibold text-[#FF9900]">Seller</span>;
  }
  if (r === "broker" || r.includes("broker") || r.includes("dealer")) {
    return <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] font-semibold text-violet-300">Broker</span>;
  }
  return <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-300">Buyer</span>;
}

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "approved") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
        <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-7.25 7.25a1 1 0 01-1.414 0l-3-3a1 1 0 111.414-1.414l2.293 2.293 6.543-6.543a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
        Approved
      </span>
    );
  }
  return (
    <span className="rounded-full bg-violet-500/12 px-2 py-0.5 text-[11px] font-medium text-violet-300">Pending</span>
  );
}

function formatRequested(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

type Props = {
  initialRows: WaitlistRequestRow[];
  loadError?: string;
};

export default function WaitlistManager({ initialRows, loadError }: Props) {
  const [rows, setRows] = useState<WaitlistRequestRow[]>(initialRows);
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [toastError, setToastError] = useState<string | null>(null);

  const pendingCount = useMemo(() => rows.filter((r) => r.status === "pending").length, [rows]);
  const approvedCount = useMemo(() => rows.filter((r) => r.status === "approved").length, [rows]);
  const total = rows.length;

  const tabCounts = useMemo(
    () => ({
      all: total,
      pending: pendingCount,
      approved: approvedCount,
    }),
    [total, pendingCount, approvedCount],
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows;
    if (tab === "pending") list = list.filter((r) => r.status === "pending");
    if (tab === "approved") list = list.filter((r) => r.status === "approved");
    if (!q) return list;
    return list.filter(
      (r) => r.full_name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q),
    );
  }, [rows, tab, search]);

  const showToast = useCallback((message: string) => {
    setToastError(message);
    window.setTimeout(() => setToastError(null), 5000);
  }, []);

  const approveOne = async (id: string) => {
    const previous = rows;
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: "approved" } : r)));
    try {
      const res = await fetch("/api/admin/waitlist/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`);
    } catch (e) {
      setRows(previous);
      showToast(e instanceof Error ? e.message : "Approve failed");
    }
  };

  const approveAllPending = async () => {
    const pendingIds = rows.filter((r) => r.status === "pending").map((r) => r.id);
    if (pendingIds.length === 0) return;
    const previous = rows;
    setRows((prev) => prev.map((r) => (r.status === "pending" ? { ...r, status: "approved" } : r)));
    try {
      const res = await fetch("/api/admin/waitlist/approve-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) return;

      for (const id of pendingIds) {
        const r = await fetch("/api/admin/waitlist/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        const rowPayload = (await r.json().catch(() => ({}))) as { error?: string };
        if (!r.ok) throw new Error(rowPayload.error ?? payload.error ?? `Approve failed for ${id}`);
      }
    } catch (e) {
      setRows(previous);
      showToast(e instanceof Error ? e.message : "Bulk approve failed");
    }
  };

  return (
    <div className="space-y-4">
      {toastError ? (
        <div className="fixed bottom-6 right-6 z-[200] max-w-sm rounded border border-red-500/40 bg-[#1a0a0a] px-4 py-3 text-sm text-red-200 shadow-lg">
          {toastError}
        </div>
      ) : null}

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Access Requests</h1>
        <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
          {pendingCount} pending
        </span>
      </header>

      {loadError ? (
        <p className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Could not load waitlist ({loadError}). Approve actions may fail until the API is available.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded border border-brand-dark bg-[#141414] p-4">
          <div className="text-[11px] uppercase tracking-wide text-brand-muted">Total Requests</div>
          <div
            className="mt-1 text-2xl font-semibold text-brand-orange"
            style={{ fontFamily: "var(--font-dm-mono), ui-monospace, monospace" }}
          >
            {total}
          </div>
        </div>
        <div className="rounded border border-brand-dark bg-[#141414] p-4">
          <div className="text-[11px] uppercase tracking-wide text-brand-muted">Pending</div>
          <div
            className="mt-1 text-2xl font-semibold text-amber-400"
            style={{ fontFamily: "var(--font-dm-mono), ui-monospace, monospace" }}
          >
            {pendingCount}
          </div>
        </div>
        <div className="rounded border border-brand-dark bg-[#141414] p-4">
          <div className="text-[11px] uppercase tracking-wide text-brand-muted">Approved</div>
          <div
            className="mt-1 text-2xl font-semibold text-emerald-400"
            style={{ fontFamily: "var(--font-dm-mono), ui-monospace, monospace" }}
          >
            {approvedCount}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          disabled={pendingCount === 0}
          onClick={() => void approveAllPending()}
          className="rounded border border-[#FF9900]/50 px-4 py-2 text-sm font-semibold text-[#FF9900] transition enabled:bg-[rgba(255,153,0,0.1)] enabled:hover:bg-[rgba(255,153,0,0.18)] disabled:cursor-not-allowed disabled:border-[#444] disabled:bg-transparent disabled:text-brand-muted"
        >
          {pendingCount === 0 ? "All caught up" : `Approve All Pending (${pendingCount})`}
        </button>
        <input
          type="search"
          placeholder="Search name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-xs rounded border border-brand-dark bg-[#121212] px-3 py-2 text-sm text-white outline-none focus:border-brand-orange sm:ml-auto"
        />
      </div>

      <div className="flex flex-wrap gap-2 border-b border-brand-dark pb-2">
        {(["all", "pending", "approved"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`inline-flex items-center gap-1.5 rounded-t px-3 py-2 text-sm font-medium capitalize ${
              tab === t ? "bg-[#1a1a1a] text-brand-orange" : "text-brand-muted hover:text-white"
            }`}
          >
            {t === "all" ? "All" : t === "pending" ? "Pending" : "Approved"}
            <span className="rounded bg-[#2a2a2a] px-1.5 py-0.5 text-[10px] text-[#8b949e]">{tabCounts[t]}</span>
          </button>
        ))}
      </div>

      <div className="overflow-auto rounded border border-brand-dark">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 bg-[#111] text-left text-xs uppercase text-brand-muted">
            <tr>
              <th className="px-3 py-2">Applicant</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Requested</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-brand-muted">
                  No rows match this filter.
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr key={row.id} className="border-t border-brand-dark hover:bg-[#1a1a1a]">
                  <td className="px-3 py-3">
                    <div className="font-medium text-white">{row.full_name || "—"}</div>
                    <div className="text-xs text-brand-muted">{row.email}</div>
                  </td>
                  <td className="px-3 py-3">{roleBadge(row.role)}</td>
                  <td className="px-3 py-3 text-brand-muted">{formatRequested(row.created_at)}</td>
                  <td className="px-3 py-3">{statusBadge(row.status)}</td>
                  <td className="px-3 py-3">
                    {row.status === "pending" ? (
                      <button
                        type="button"
                        onClick={() => void approveOne(row.id)}
                        className="rounded border border-emerald-500/50 px-3 py-1 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/10"
                      >
                        Approve
                      </button>
                    ) : (
                      <span className="text-xs text-[#6e7681]">Granted</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
