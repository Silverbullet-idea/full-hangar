"use client";

import { useEffect, useState } from "react";

type KpiAccent = "default" | "success" | "warn" | "critical";

const ACCENT_RING: Record<KpiAccent, string> = {
  default: "ring-[var(--fh-orange)]/35 hover:ring-[var(--fh-orange)]/55",
  success: "ring-emerald-500/30 hover:ring-emerald-500/50",
  warn: "ring-amber-500/35 hover:ring-amber-500/55",
  critical: "ring-rose-500/35 hover:ring-rose-500/55",
};

const ACCENT_TEXT: Record<KpiAccent, string> = {
  default: "text-[var(--fh-orange)]",
  success: "text-emerald-400 [data-theme=light]:text-emerald-700",
  warn: "text-amber-400 [data-theme=light]:text-amber-800",
  critical: "text-rose-400 [data-theme=light]:text-rose-700",
};

export type TopStripe = "orange" | "emerald" | "sky" | "amber" | "rose" | "violet" | "pink";

const STRIPE_BG: Record<TopStripe, string> = {
  orange: "bg-[var(--fh-orange)]",
  emerald: "bg-emerald-500",
  sky: "bg-sky-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  violet: "bg-violet-500",
  pink: "bg-pink-500",
};

export type KpiCardProps = {
  label: string;
  value: string | number;
  hint?: string;
  accent?: KpiAccent;
  /** 2px top accent bar (Phase 4B spec). */
  topStripe?: TopStripe;
  /** Staggered fade/slide-in on mount. */
  animateIn?: boolean;
  animationDelayMs?: number;
};

export function KpiCard({
  label,
  value,
  hint,
  accent = "default",
  topStripe,
  animateIn,
  animationDelayMs = 0,
}: KpiCardProps) {
  const display = typeof value === "number" ? value.toLocaleString() : value;
  const [mounted, setMounted] = useState(!animateIn);

  useEffect(() => {
    if (!animateIn) return;
    const t = window.setTimeout(() => setMounted(true), animationDelayMs);
    return () => window.clearTimeout(t);
  }, [animateIn, animationDelayMs]);

  return (
    <article
      className={`relative overflow-hidden rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg-elevated)] p-3 shadow-sm ring-1 ring-transparent transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md ${ACCENT_RING[accent]} [data-theme=light]:bg-white [data-theme=light]:border-slate-200 ${
        animateIn ? (mounted ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0") : ""
      }`}
      style={animateIn ? { transitionProperty: "opacity, transform", transitionDuration: "0.35s", transitionTimingFunction: "ease-out" } : undefined}
    >
      {topStripe ? (
        <div className={`absolute left-0 right-0 top-0 h-0.5 ${STRIPE_BG[topStripe]}`} aria-hidden />
      ) : null}
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--fh-text-muted)] sm:text-xs">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums sm:text-2xl ${ACCENT_TEXT[accent]}`}>{display}</p>
      {hint ? <p className="mt-1 text-[10px] text-[var(--fh-text-dim)] sm:text-xs">{hint}</p> : null}
    </article>
  );
}
