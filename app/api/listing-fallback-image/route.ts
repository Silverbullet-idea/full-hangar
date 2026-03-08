import { NextRequest, NextResponse } from "next/server"

function sanitize(value: string | null, max = 56): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/[<>&"]/g, "")
    .trim()
    .slice(0, max)
}

export async function GET(request: NextRequest) {
  const source = sanitize(request.nextUrl.searchParams.get("source"), 24) || "Unknown source"
  const sourceId = sanitize(request.nextUrl.searchParams.get("sourceId"), 24)
  const title = sanitize(request.nextUrl.searchParams.get("title"), 64) || "Aircraft listing"

  const subtitle = sourceId ? `${source.toUpperCase()} • ${sourceId}` : source.toUpperCase()
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720">
<defs>
  <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
    <stop offset="0%" stop-color="#121926"/>
    <stop offset="100%" stop-color="#0b1220"/>
  </linearGradient>
</defs>
<rect width="1200" height="720" fill="url(#g)"/>
<rect x="56" y="56" width="1088" height="608" rx="18" ry="18" fill="#141d2a" stroke="#314158" stroke-width="2"/>
<text x="96" y="160" fill="#f59e0b" font-family="Arial, sans-serif" font-size="34" font-weight="700">Full Hangar</text>
<text x="96" y="228" fill="#e5e7eb" font-family="Arial, sans-serif" font-size="44" font-weight="700">${title}</text>
<text x="96" y="278" fill="#9ca3af" font-family="Arial, sans-serif" font-size="28" font-weight="600">Image unavailable from source feed</text>
<text x="96" y="338" fill="#94a3b8" font-family="Arial, sans-serif" font-size="24" font-weight="600">${subtitle}</text>
</svg>`

  return new NextResponse(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  })
}
