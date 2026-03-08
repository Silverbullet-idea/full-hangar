"use client";

import { FormEvent, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

type InviteRow = {
  id: string;
  token: string;
  label: string | null;
  email: string | null;
  created_at: string | null;
  expires_at: string | null;
  used_at: string | null;
  is_active: boolean | null;
  session_active: boolean | null;
};

export default function AdminInvitesPage() {
  const [label, setLabel] = useState("");
  const [email, setEmail] = useState("");
  const [expiresDays, setExpiresDays] = useState("30");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [stats, setStats] = useState({ total_invites_sent: 0, total_activated: 0, currently_active_sessions: 0 });
  const [lastInviteUrl, setLastInviteUrl] = useState("");

  async function loadInvites() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/internal/admin/invites");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? "Failed to load invites");
      setInvites(payload.invites ?? []);
      setStats(payload.stats ?? stats);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load invites");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInvites();
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const response = await fetch("/api/internal/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label,
          email: email || undefined,
          expires_days: expiresDays === "never" ? undefined : Number(expiresDays),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? "Failed to create invite");
      setLastInviteUrl(String(payload.invite_url ?? ""));
      setLabel("");
      setEmail("");
      await loadInvites();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to create invite");
    }
  }

  return (
    <main className="space-y-4 p-4 md:p-6">
      <header className="rounded border border-brand-dark bg-card-bg p-4">
        <h1 className="text-2xl font-semibold">Beta Invite Management</h1>
        <p className="text-sm text-brand-muted">Create and monitor token-based beta access links.</p>
      </header>

      <section className="rounded border border-brand-dark bg-card-bg p-4">
        <h2 className="mb-2 text-lg font-semibold">Create Invite Panel</h2>
        <form className="grid gap-2 md:grid-cols-4" onSubmit={onSubmit}>
          <input
            className="rounded border border-brand-dark bg-transparent px-3 py-2"
            placeholder="Label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            required
          />
          <input
            className="rounded border border-brand-dark bg-transparent px-3 py-2"
            placeholder="Email (optional)"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <select
            className="rounded border border-brand-dark bg-transparent px-3 py-2"
            value={expiresDays}
            onChange={(event) => setExpiresDays(event.target.value)}
          >
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="never">Never</option>
          </select>
          <button className="rounded bg-brand-orange px-3 py-2 font-semibold text-black" type="submit">
            Create Invite
          </button>
        </form>
        {lastInviteUrl ? (
          <div className="mt-3 rounded border border-brand-dark p-3">
            <p className="text-xs uppercase text-brand-muted">Latest Invite URL</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <input className="min-w-[20rem] flex-1 rounded border border-brand-dark bg-transparent px-2 py-1 text-sm" value={lastInviteUrl} readOnly />
              <button className="rounded border border-brand-dark px-2 py-1 text-sm" onClick={() => navigator.clipboard.writeText(lastInviteUrl)}>
                Copy Link
              </button>
              <QRCodeSVG value={lastInviteUrl} size={96} bgColor="transparent" fgColor="#FF9900" />
            </div>
          </div>
        ) : null}
        {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
      </section>

      <section className="rounded border border-brand-dark bg-card-bg p-4">
        <h2 className="mb-2 text-lg font-semibold">Active Invites Table</h2>
        {loading ? (
          <div className="h-20 animate-pulse rounded bg-[#1d1d1d]" />
        ) : (
          <div className="overflow-auto rounded border border-brand-dark">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-[#111111] text-left text-xs uppercase text-brand-muted">
                <tr>
                  <th className="px-3 py-2">Label</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2">Expires</th>
                  <th className="px-3 py-2">Used?</th>
                  <th className="px-3 py-2">Used At</th>
                  <th className="px-3 py-2">Session Active?</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((invite) => (
                  <tr key={invite.id} className="border-t border-brand-dark hover:bg-[#1d1d1d]">
                    <td className="px-3 py-2">{invite.label ?? "Untitled"}</td>
                    <td className="px-3 py-2">{invite.email ?? "—"}</td>
                    <td className="px-3 py-2">{String(invite.created_at ?? "").slice(0, 10)}</td>
                    <td className="px-3 py-2">{invite.expires_at ? String(invite.expires_at).slice(0, 10) : "Never"}</td>
                    <td className="px-3 py-2">{invite.used_at ? "Yes" : "No"}</td>
                    <td className="px-3 py-2">{invite.used_at ? String(invite.used_at).slice(0, 16).replace("T", " ") : "—"}</td>
                    <td className="px-3 py-2">{invite.session_active ? "Yes" : "No"}</td>
                    <td className="px-3 py-2">
                      <button
                        className="rounded border border-brand-dark px-2 py-1 text-xs"
                        onClick={() => {
                          const base = window.location.origin;
                          navigator.clipboard.writeText(`${base}/beta/join?token=${invite.token}`);
                        }}
                      >
                        Copy Link
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded border border-brand-dark bg-card-bg p-4">
        <h2 className="mb-2 text-lg font-semibold">Beta Access Stats</h2>
        <div className="grid gap-2 md:grid-cols-3">
          <div className="rounded border border-brand-dark p-2 text-sm">Total invites sent: {stats.total_invites_sent}</div>
          <div className="rounded border border-brand-dark p-2 text-sm">Total activated: {stats.total_activated}</div>
          <div className="rounded border border-brand-dark p-2 text-sm">Currently active sessions: {stats.currently_active_sessions}</div>
        </div>
      </section>
    </main>
  );
}
