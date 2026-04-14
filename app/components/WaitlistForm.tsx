"use client";

import { FormEvent, useState } from "react";

const ROLES = [
  { value: "buyer", label: "Aircraft Buyer" },
  { value: "seller", label: "Aircraft Seller" },
  { value: "broker", label: "Broker or Dealer" },
] as const;

export default function WaitlistForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]["value"]>("buyer");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successEmail, setSuccessEmail] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/waitlist/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fullName.trim(),
          email: email.trim(),
          role,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(payload.error ?? "Something went wrong. Please try again.");
      }
      setSuccessEmail(email.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  if (successEmail) {
    return (
      <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15">
          <svg className="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="mt-4 text-lg font-semibold text-white">You&apos;re on the list</h2>
        <p className="mt-2 text-sm text-[#8b949e]">
          We&apos;ll send an approval email to <span className="font-medium text-[#c9d1d9]">{successEmail}</span> when your account is ready.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-[#30363d] bg-[#161b22] p-6">
      <h2 className="text-base font-semibold text-white">Request early access</h2>
      <p className="mt-1 text-sm text-[#8b949e]">Join the waitlist — we&apos;ll notify you when your account is approved.</p>

      <div className="mt-5 space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-[#8b949e]">Full Name</span>
          <input
            required
            autoComplete="name"
            value={fullName}
            onChange={(ev) => setFullName(ev.target.value)}
            className="w-full rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2.5 text-sm text-white outline-none focus:border-[#FF9900] focus:ring-1 focus:ring-[#FF9900]"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-[#8b949e]">Email Address</span>
          <input
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            className="w-full rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2.5 text-sm text-white outline-none focus:border-[#FF9900] focus:ring-1 focus:ring-[#FF9900]"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-[#8b949e]">I am a...</span>
          <select
            value={role}
            onChange={(ev) => setRole(ev.target.value as (typeof ROLES)[number]["value"])}
            className="w-full rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2.5 text-sm text-white outline-none focus:border-[#FF9900] focus:ring-1 focus:ring-[#FF9900]"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="relative mt-6 flex w-full items-center justify-center rounded-lg bg-[#FF9900] py-3 text-sm font-semibold text-black transition hover:bg-[#e68a00] disabled:opacity-70"
      >
        {loading ? (
          <>
            <span className="opacity-0">Request Access</span>
            <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
              <svg className="h-5 w-5 animate-spin text-black" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-90"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </span>
          </>
        ) : (
          "Request Access"
        )}
      </button>
      {error ? <p className="mt-3 text-center text-sm text-red-400">{error}</p> : null}
    </form>
  );
}
