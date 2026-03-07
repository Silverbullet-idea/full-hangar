"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const NAV_LOADING_START_EVENT = "fullhangar:navigation-loading-start";
const NAV_LOADING_END_EVENT = "fullhangar:navigation-loading-end";

export default function InternalLoginPage() {
  const router = useRouter();
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
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        setError("Incorrect password.");
        return;
      }

      router.push("/internal/diagnostics");
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
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "1rem",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: "360px",
          display: "grid",
          gap: "0.75rem",
        }}
      >
        <h1 style={{ margin: 0 }}>Internal Login</h1>
        <label htmlFor="internal-password">Password</label>
        <input
          id="internal-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          autoComplete="current-password"
        />
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
        {error ? (
          <p style={{ margin: 0, color: "#b00020" }} role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </main>
  );
}
