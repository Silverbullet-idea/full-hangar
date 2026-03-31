import { NextRequest, NextResponse } from "next/server"
import { computeSellIntel } from "@/lib/sellIntel/compute"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const ecRaw = searchParams.get("engineCount")
    const ecParsed = ecRaw ? parseInt(ecRaw, 10) : NaN
    const engineCount = ecParsed === 1 || ecParsed === 2 ? ecParsed : undefined

    const params = {
      make: searchParams.get("make") || "",
      model: searchParams.get("model") || undefined,
      yearMin: searchParams.get("yearMin") ? parseInt(searchParams.get("yearMin")!, 10) : undefined,
      yearMax: searchParams.get("yearMax") ? parseInt(searchParams.get("yearMax")!, 10) : undefined,
      smoh: searchParams.get("smoh") ? parseInt(searchParams.get("smoh")!, 10) : undefined,
      askingPrice: searchParams.get("askingPrice")
        ? parseInt(searchParams.get("askingPrice")!, 10)
        : undefined,
      panelType: searchParams.get("panelType") || undefined,
      avionicsSelected: searchParams.get("avionics")?.split(",").map((s) => s.trim()).filter(Boolean) || [],
      annualStatus: searchParams.get("annualStatus") || undefined,
      damageHistory: searchParams.get("damageHistory") === "true",
      engineCount,
    }

    if (!params.make.trim()) {
      return NextResponse.json({ error: "make is required" }, { status: 400 })
    }

    const payload = await computeSellIntel(params)
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    })
  } catch (err) {
    console.error("[sell-intel]", err)
    return NextResponse.json({ error: "Failed to compute sell intelligence" }, { status: 500 })
  }
}
