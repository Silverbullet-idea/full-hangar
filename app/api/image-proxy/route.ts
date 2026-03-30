import { NextRequest, NextResponse } from 'next/server'
import { isListingImageProxyAllowedHost } from '@/lib/media/listingImageProxyPolicy'

const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480"><rect width="640" height="480" fill="#141922"/><rect x="16" y="16" width="608" height="448" rx="12" ry="12" fill="#1a1a1a" stroke="#3A4454" stroke-width="2"/><text x="320" y="250" text-anchor="middle" fill="#B2B2B2" font-family="Arial, sans-serif" font-size="22">Image unavailable</text></svg>`

function placeholderImageResponse(reason: string) {
  return new NextResponse(PLACEHOLDER_SVG, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Image-Proxy-Fallback': reason,
    },
  })
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get('url')
  if (!rawUrl) return placeholderImageResponse('missing_url')

  let parsedUrl: URL
  try {
    parsedUrl = new URL(rawUrl)
  } catch {
    return placeholderImageResponse('invalid_url')
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return placeholderImageResponse('invalid_protocol')
  }

  // Only proxy from known listing/image hosts (prevent open proxy abuse)
  const host = parsedUrl.hostname.toLowerCase()
  const isAllowed = isListingImageProxyAllowedHost(host)
  if (!isAllowed) return placeholderImageResponse('forbidden_host')

  try {
    let response = await fetch(parsedUrl.toString(), {
      headers: {
        Referer: `https://${host}/`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })

    // Some hosts return transient 404s on transformed URLs; retry raw asset path once.
    if (!response.ok && parsedUrl.search && host === 'cdn-media.tilabs.io') {
      const retryUrl = new URL(parsedUrl.toString())
      retryUrl.search = ''
      response = await fetch(retryUrl.toString(), {
        headers: {
          Referer: `https://${host}/`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      })
    }

    if (!response.ok) {
      return placeholderImageResponse(`upstream_${response.status}`)
    }
    const buffer = await response.arrayBuffer()
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch {
    return placeholderImageResponse('fetch_error')
  }
}
