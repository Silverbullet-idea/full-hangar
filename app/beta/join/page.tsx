"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function BetaJoinPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("Ryan");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const prefillToken = useMemo(() => String(searchParams.get("token") ?? "").trim(), [searchParams]);

  async function submitAuth(nextToken: string) {
    setLoading(true);
    setError("");
    try {
      const payloadBody =
        nextToken.length > 0
          ? { token: nextToken }
          : { username: username.trim(), password };
      const response = await fetch("/api/beta/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadBody),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (payload?.error === "invalid_credentials") {
          throw new Error("Incorrect username or password.");
        }
        throw new Error(
          payload?.error === "invite_expired" || payload?.error === "invalid_invite" || payload?.error === "invite_already_used"
            ? "This invite link is invalid or has expired. Contact Ryan for a new link."
            : payload?.error ?? "Unable to validate invite right now."
        );
      }
      router.push("/beta/dashboard");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to validate invite.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!prefillToken) return;
    setToken(prefillToken);
    submitAuth(prefillToken);
  }, [prefillToken]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitAuth(token.trim());
  }

  return (
    <main className="grid min-h-screen place-items-center bg-black px-4">
      <div className="w-full max-w-md rounded border border-brand-dark bg-card-bg p-6 text-center">
        <h1 className="text-2xl font-semibold">You've been invited to Full Hangar Beta</h1>
        <p className="mt-2 text-sm text-brand-muted">Aircraft market intelligence for serious buyers.</p>
        <form className="mt-4 space-y-2" onSubmit={onSubmit}>
          <input
            className="w-full rounded border border-brand-dark bg-transparent px-3 py-2"
            placeholder="Username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
          />
          <input
            className="w-full rounded border border-brand-dark bg-transparent px-3 py-2"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
          <p className="text-xs text-brand-muted">Or use an invite token below.</p>
          <input
            className="w-full rounded border border-brand-dark bg-transparent px-3 py-2"
            placeholder="Invite token (optional)"
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />
          <button className="w-full rounded bg-brand-orange px-3 py-2 font-semibold text-black" type="submit" disabled={loading}>
            {loading ? "Checking access..." : "Access Beta Dashboard"}
          </button>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
        </form>
      </div>
    </main>
  );
}
