import fs from "node:fs"
import path from "node:path"
import { createClient } from "@supabase/supabase-js"

/** True when anon client env is present (required for `createServerClient` / browser-aligned reads). */
export function isPublicSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  )
}

function getSupabaseUrl(): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL")
  }
  return supabaseUrl
}

function getSupabaseAnonKey(): string {
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseAnonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY")
  }
  return supabaseAnonKey
}

function resolveServiceRoleKeyFromScraperEnv(): string | null {
  // Local-development convenience fallback only.
  const scraperEnvPath = path.join(process.cwd(), "scraper", ".env")
  try {
    const file = fs.readFileSync(scraperEnvPath, "utf8")
    const match = file.match(/^\s*SUPABASE_SERVICE_KEY\s*=\s*(.+)\s*$/m)
    if (!match) return null
    const value = match[1].trim().replace(/^['"]|['"]$/g, "")
    return value || null
  } catch {
    return null
  }
}

function getServiceRoleKey(): string {
  const key =
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY ||
    resolveServiceRoleKeyFromScraperEnv()

  if (!key) {
    throw new Error(
      "Missing service-role Supabase key. Set SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY)."
    )
  }
  return key
}

const clientOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
}

export function createServerClient() {
  return createClient(getSupabaseUrl(), getSupabaseAnonKey(), clientOptions)
}

export function createPrivilegedServerClient() {
  return createClient(getSupabaseUrl(), getServiceRoleKey(), clientOptions)
}

// Backward compatibility for older imports.
export function getSupabaseServerClient() {
  return createServerClient()
}
