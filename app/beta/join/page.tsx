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
  const [googleReady, setGoogleReady] = useState(false);
  const googleClientId = String(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "").trim();

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

  useEffect(() => {
    if (!googleClientId || typeof window === "undefined") return;
    const windowAny = window as any;
    const renderGoogle = () => {
      if (!windowAny.google?.accounts?.id) return;
      windowAny.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response: { credential?: string }) => {
          const credential = String(response?.credential ?? "").trim();
          if (!credential) {
            setError("Google sign-in did not return a token.");
            return;
          }
          setLoading(true);
          setError("");
          try {
            const apiResponse = await fetch("/api/beta/validate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ google_id_token: credential }),
            });
            const payload = await apiResponse.json().catch(() => ({}));
            if (!apiResponse.ok) {
              throw new Error(payload?.error === "google_user_not_authorized" ? "This Google account is not authorized yet." : payload?.error ?? "Google login failed.");
            }
            router.push("/beta/dashboard");
            router.refresh();
          } catch (authError) {
            setError(authError instanceof Error ? authError.message : "Google login failed.");
          } finally {
            setLoading(false);
          }
        },
      });
      windowAny.google.accounts.id.renderButton(
        document.getElementById("google-beta-login"),
        { theme: "outline", size: "large", width: "320", text: "continue_with" }
      );
      setGoogleReady(true);
    };

    if (windowAny.google?.accounts?.id) {
      renderGoogle();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => renderGoogle();
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, [googleClientId, router]);

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
          <div className="mb-2">
            <div id="google-beta-login" />
            {!googleClientId ? (
              <p className="mt-1 text-xs text-brand-muted">Set NEXT_PUBLIC_GOOGLE_CLIENT_ID to enable Google login.</p>
            ) : !googleReady ? (
              <p className="mt-1 text-xs text-brand-muted">Loading Google login...</p>
            ) : null}
          </div>
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
          <button className="fh-cta-on-orange-fill w-full rounded bg-brand-orange px-3 py-2 font-semibold" type="submit" disabled={loading}>
            {loading ? "Checking access..." : "Access Beta Dashboard"}
          </button>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
        </form>
      </div>
    </main>
  );
}
