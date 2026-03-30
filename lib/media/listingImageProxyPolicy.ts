/** Hosts allowed through `/api/image-proxy` — keep in sync with security rules there. */

const ALLOWED_EXACT_HOSTS = new Set([
  "dsgiipnwy1jd8.cloudfront.net",
  "cdn-media.tilabs.io",
  "media.sandhills.com",
])

const ALLOWED_HOST_SUFFIXES = [
  ".controller.com",
  ".aerotrader.com",
  ".barnstormers.com",
  ".globalair.com",
  ".avbuyer.com",
]

export function isListingImageProxyAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (ALLOWED_EXACT_HOSTS.has(host)) return true
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix.slice(1) || host.endsWith(suffix))
}

export function isListingImageProxyAllowedUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl.trim())
    if (u.protocol !== "http:" && u.protocol !== "https:") return false
    return isListingImageProxyAllowedHost(u.hostname)
  } catch {
    return false
  }
}
