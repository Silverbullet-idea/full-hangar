"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const NAV_LOADING_START_EVENT = "fullhangar:navigation-loading-start";
const NAV_LOADING_END_EVENT = "fullhangar:navigation-loading-end";

export default function InternalLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("Ryan");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(NAV_LOADING_START_EVENT));
      }
      const response = await fetch("/api/internal/auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        setError("Incorrect username or password.");
        return;
      }

      router.push("/internal/admin");
      router.refresh();
    } catch {
      setError("Unable to sign in right now. Please try again.");
    } finally {
      setIsSubmitting(false);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(NAV_LOADING_END_EVENT));
      }
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-8">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-xl border border-brand-dark bg-card-bg p-5 shadow-[0_14px_36px_rgba(0,0,0,0.25)]"
      >
        <h1 className="m-0 text-2xl font-semibold text-brand-white">Internal Login</h1>
        <p className="mt-1 mb-4 text-sm text-brand-muted">Sign in to access the Full Hangar admin portal.</p>

        <label htmlFor="internal-username" className="mb-1 block text-sm font-medium text-brand-white">
          Username
        </label>
        <input
          id="internal-username"
          type="text"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          required
          autoComplete="username"
          className="mb-3 w-full rounded-md border border-brand-dark bg-transparent px-3 py-2 text-brand-white outline-none transition focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/30"
          placeholder="Ryan"
        />
        <label htmlFor="internal-password" className="mb-1 block text-sm font-medium text-brand-white">
          Password
        </label>
        <input
          id="internal-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          autoComplete="current-password"
          className="w-full rounded-md border border-brand-dark bg-transparent px-3 py-2 text-brand-white outline-none transition focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/30"
          placeholder="••••••••"
        />
        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-4 w-full rounded-md bg-brand-orange px-4 py-2.5 font-semibold text-black transition hover:bg-brand-burn disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
        {error ? (
          <p className="mt-3 text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </main>
  );
}
