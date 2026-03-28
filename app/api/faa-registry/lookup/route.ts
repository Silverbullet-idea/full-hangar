import { NextRequest, NextResponse } from "next/server"
import { buildFaaCoachPrefill, nNumberEqCandidates } from "@/lib/faaRegistry/coachPrefillFromRegistry"
import { createReadServerClient } from "@/lib/supabase/server"

/** Strip to alphanumerics for length validation (US N-number core). */
function compactAlnum(s: string): string {
  return s.replace(/[^A-Za-z0-9]/g, "").toUpperCase()
}

function normalizeNNumber(raw: string): string {
  const trimmed = raw.trim().toUpperCase()
  if (/^\d/.test(trimmed)) return `N${trimmed}`
  return trimmed
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? ""
  const normalized = normalizeNNumber(q)
  const core = compactAlnum(normalized)

  if (core.length < 3 || core.length > 7) {
    return NextResponse.json(
      { error: "Invalid N-number format", faa: null, found: false },
      { status: 400 }
    )
  }

  try {
    const supabase = createReadServerClient()
    let registryRow: Record<string, unknown> | null = null

    for (const cand of nNumberEqCandidates(normalized)) {
      const { data, error } = await supabase.from("faa_registry").select("*").eq("n_number", cand).limit(1).maybeSingle()
      if (error) {
        return NextResponse.json(
          { error: "FAA lookup temporarily unavailable.", faa: null, found: false },
          { status: 503 }
        )
      }
      if (data && typeof data === "object") {
        registryRow = data as Record<string, unknown>
        break
      }
    }

    if (!registryRow) {
      return NextResponse.json(
        {
          faa: null,
          found: false,
          message: "N-number not found in FAA registry",
        },
        {
          status: 200,
          headers: {
            "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
          },
        }
      )
    }

    const faa = await buildFaaCoachPrefill(supabase, registryRow)

    return NextResponse.json(
      { faa, found: true },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      }
    )
  } catch {
    return NextResponse.json({ error: "FAA lookup failed.", faa: null, found: false }, { status: 500 })
  }
}
