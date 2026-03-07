import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_EXACT_HOSTS = new Set([
  'dsgiipnwy1jd8.cloudfront.net',
  'cdn-media.tilabs.io',
  'media.sandhills.com',
])

const ALLOWED_HOST_SUFFIXES = [
  '.controller.com',
  '.aerotrader.com',
  '.barnstormers.com',
  '.globalair.com',
  '.avbuyer.com',
]

function isAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (ALLOWED_EXACT_HOSTS.has(host)) return true
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix.slice(1) || host.endsWith(suffix))
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get('url')
  if (!rawUrl) return new NextResponse('Missing url', { status: 400 })

  let parsedUrl: URL
  try {
    parsedUrl = new URL(rawUrl)
  } catch {
    return new NextResponse('Invalid url', { status: 400 })
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return new NextResponse('Invalid protocol', { status: 400 })
  }

  // Only proxy from known listing/image hosts (prevent open proxy abuse)
  const host = parsedUrl.hostname.toLowerCase()
  const isAllowed = isAllowedHost(host)
  if (!isAllowed) return new NextResponse('Forbidden', { status: 403 })

  try {
    const response = await fetch(parsedUrl.toString(), {
      headers: {
        Referer: `https://${host}/`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })
    if (!response.ok) {
      return new NextResponse('Upstream image fetch failed', { status: response.status })
    }
    const buffer = await response.arrayBuffer()
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch {
    return new NextResponse('Failed', { status: 500 })
  }
}
