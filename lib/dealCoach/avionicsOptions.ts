export type AvionicsGroup = { groupLabel: string; items: string[] }

export const avionicsChipGroups: AvionicsGroup[] = [
  {
    groupLabel: "Navigation / GPS",
    items: ["GTN 650/750 class", "GNS 430/530", "IFD 440/540", "KI 209/525", "KLN 94", "iPad / ForeFlight", "Other GPS"],
  },
  {
    groupLabel: "Primary flight display",
    items: ["G500/G600 TXi", "G3X Touch", "Aspen EFD", "Dynon SkyView", "Steam backup only", "Other PFD"],
  },
  {
    groupLabel: "Transponder / ADS-B",
    items: ["GTX 345 / ADS-B Out", "GTX 335", "L3 Lynx", "uAvionix skyBeacon", "Mode C only", "Other ADS-B"],
  },
  {
    groupLabel: "Autopilot",
    items: ["GFC 500/600", "KFC 150/200", "S-TEC 30/55", "Chelton", "No autopilot", "Other AP"],
  },
  {
    groupLabel: "Other equipment",
    items: ["Stormscope", "TAWS", "TCAS", "WX-500", "DME/ADF", "Audio panel upgrade", "Other"],
  },
]

export const panelTypeOptions = ["Steam gauges", "Glass panel", "Hybrid"] as const
