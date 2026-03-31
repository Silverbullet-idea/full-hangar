export interface ModelUpgradeProfile {
  buyerExpectations: string[]
  highROIUpgrades: string[]
  modelSpecificWarnings: string[]
  signatureUpgrade: string | null
}

export const modelUpgradeProfiles: Record<string, ModelUpgradeProfile> = {
  C172: {
    buyerExpectations: ["ADS-B out", "WAAS GPS", "working autopilot"],
    highROIUpgrades: ["Garmin G5 + GTX345 bundle", "Garmin GTN 650/750"],
    modelSpecificWarnings: [
      "Steam-gauge C172s trade $4–8K below glass equivalents",
      "KAP-140 autopilot highly valued by buyers — mention if installed",
    ],
    signatureUpgrade: "Garmin G5 + GTX 345 bundle",
  },
  C182: {
    buyerExpectations: ["IFR-capable", "WAAS GPS", "autopilot"],
    highROIUpgrades: ["Garmin GTN 650", "Garmin GFC 500"],
    modelSpecificWarnings: [
      "TSIO-520 variants attract scrutiny on engine — document compression clearly",
    ],
    signatureUpgrade: "Garmin GTN 650",
  },
  "PA-28": {
    buyerExpectations: ["ADS-B out", "WAAS GPS"],
    highROIUpgrades: ["Garmin GTX 345", "Garmin GNS 430W"],
    modelSpecificWarnings: [
      "PA-28 wing spar AD (2024) affects 21,000+ aircraft — disclose status proactively",
      "Steam gauges less penalized on PA-28 than C172 — buyers expect it",
    ],
    signatureUpgrade: "Garmin GTX 345 ADS-B",
  },
  "PA-32": {
    buyerExpectations: ["IFR capable", "WAAS GPS", "autopilot"],
    highROIUpgrades: ["Garmin GTN 650", "Garmin GFC 500"],
    modelSpecificWarnings: [
      "PA-32 wing spar AD (2024) affects this model — disclose inspection status",
    ],
    signatureUpgrade: "Garmin GTN 650",
  },
  A36: {
    buyerExpectations: ["glass panel or strong avionics stack", "WAAS GPS", "autopilot"],
    highROIUpgrades: ["Garmin G500 TXi", "Garmin GTN 750"],
    modelSpecificWarnings: [
      "Bonanza buyers are sophisticated — avionics quality is heavily scrutinized",
      "Engine docs and compression history matter more than on lower-end aircraft",
    ],
    signatureUpgrade: "Garmin G500 TXi",
  },
  M20: {
    buyerExpectations: ["speed mods documented", "IFR capable", "WAAS GPS"],
    highROIUpgrades: ["Garmin GTN 650", "Garmin G5"],
    modelSpecificWarnings: [
      "Mooney buyers want speed — document TAS and any speed mods (GAMIjectors, etc.)",
      "Gear-up history is heavily scrutinized — No Damage certification important",
    ],
    signatureUpgrade: "Garmin GTN 650",
  },
  SR22: {
    buyerExpectations: ["CAPS repack current", "Perspective+ or Avidyne", "TKS if available"],
    highROIUpgrades: ["CAPS repack (if due)", "TKS anti-ice"],
    modelSpecificWarnings: [
      "CAPS parachute repack status is the #1 buyer question — lead with it",
      "Expired CAPS reduces value by $10K–$22K — repack before listing if within 2 years",
    ],
    signatureUpgrade: null,
  },
}

export function getModelUpgradeProfile(make: string, model: string | undefined): ModelUpgradeProfile | null {
  const hay = `${make ?? ""} ${model ?? ""}`.toUpperCase()
  const keys = Object.keys(modelUpgradeProfiles).sort((a, b) => b.length - a.length)
  for (const k of keys) {
    if (hay.includes(k.toUpperCase())) return modelUpgradeProfiles[k]!
  }
  return null
}
