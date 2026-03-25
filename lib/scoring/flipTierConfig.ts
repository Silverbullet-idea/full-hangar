export const FLIP_TIER_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; ring: string }
> = {
  HOT: {
    label: "HOT",
    bg: "bg-orange-500",
    text: "text-white",
    ring: "ring-orange-400",
  },
  GOOD: {
    label: "GOOD",
    bg: "bg-emerald-500",
    text: "text-white",
    ring: "ring-emerald-400",
  },
  FAIR: {
    label: "FAIR",
    bg: "bg-amber-400",
    text: "text-amber-900",
    ring: "ring-amber-300",
  },
  PASS: {
    label: "PASS",
    bg: "bg-slate-300",
    text: "text-slate-700",
    ring: "ring-slate-200",
  },
};
