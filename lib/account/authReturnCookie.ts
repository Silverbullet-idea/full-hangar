/** Client-set cookie so OAuth callback can read return path (non-HttpOnly). */
export const FH_AUTH_RETURN_COOKIE = "fh_auth_return"

export function setAuthReturnCookie(path: string) {
  if (typeof document === "undefined") return
  const safe =
    path.startsWith("/") && !path.startsWith("//") ? path : "/account"
  document.cookie = `${FH_AUTH_RETURN_COOKIE}=${encodeURIComponent(safe)}; Path=/; Max-Age=900; SameSite=Lax`
}

export function clearAuthReturnCookie() {
  if (typeof document === "undefined") return
  document.cookie = `${FH_AUTH_RETURN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
}
