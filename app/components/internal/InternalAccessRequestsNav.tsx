"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Props = {
  /** When set (e.g. from a server fetch), skips client fetch. */
  pendingCount?: number;
};

export default function InternalAccessRequestsNav({ pendingCount: pendingFromServer }: Props) {
  const [pending, setPending] = useState<number | null>(typeof pendingFromServer === "number" ? pendingFromServer : null);

  useEffect(() => {
    if (typeof pendingFromServer === "number") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/waitlist");
        const data = (await res.json().catch(() => ({}))) as {
          pending_count?: number;
          counts?: { pending?: number };
          requests?: Array<{ status?: string }>;
          rows?: Array<{ status?: string }>;
        };
        if (cancelled) return;
        if (typeof data.counts?.pending === "number") {
          setPending(data.counts.pending);
          return;
        }
        if (typeof data.pending_count === "number") {
          setPending(data.pending_count);
          return;
        }
        const list = Array.isArray(data.requests) ? data.requests : Array.isArray(data.rows) ? data.rows : [];
        setPending(list.filter((r) => String(r.status ?? "").toLowerCase() === "pending").length);
      } catch {
        if (!cancelled) setPending(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pendingFromServer]);

  const showDot = (pending ?? 0) > 0;

  return (
    <Link
      href="/internal/waitlist"
      className="relative inline-flex items-center gap-2 rounded border border-brand-dark px-3 py-2 text-sm text-brand-muted hover:border-brand-orange hover:text-brand-orange"
    >
      <span>Access Requests</span>
      {showDot ? (
        <span className="relative flex h-2 w-2" title={`${pending ?? ""} pending`.trim()}>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-40" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
        </span>
      ) : null}
    </Link>
  );
}
