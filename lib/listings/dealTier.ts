export type DealTierTone = "green" | "blue" | "amber" | "red" | "gray";

export type DealTierMeta = {
  key: "EXCEPTIONAL_DEAL" | "GOOD_DEAL" | "FAIR_MARKET" | "ABOVE_MARKET" | "OVERPRICED" | "UNKNOWN";
  label: string;
  tone: DealTierTone;
};

function normalizeDealTierKey(value: string | null | undefined): DealTierMeta["key"] {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

  if (normalized === "EXCEPTIONAL_DEAL") return "EXCEPTIONAL_DEAL";
  if (normalized === "GOOD_DEAL") return "GOOD_DEAL";
  if (normalized === "FAIR_MARKET") return "FAIR_MARKET";
  if (normalized === "ABOVE_MARKET") return "ABOVE_MARKET";
  if (normalized === "OVERPRICED") return "OVERPRICED";
  return "UNKNOWN";
}

export function getDealTierMeta(value: string | null | undefined): DealTierMeta | null {
  const key = normalizeDealTierKey(value);
  if (key === "UNKNOWN") return null;

  if (key === "EXCEPTIONAL_DEAL") {
    return { key, label: "Exceptional Deal", tone: "green" };
  }
  if (key === "GOOD_DEAL") {
    return { key, label: "Good Deal", tone: "green" };
  }
  if (key === "FAIR_MARKET") {
    return { key, label: "Fair Market", tone: "blue" };
  }
  if (key === "ABOVE_MARKET") {
    return { key, label: "Above Market", tone: "amber" };
  }
  return { key, label: "Overpriced", tone: "red" };
}
