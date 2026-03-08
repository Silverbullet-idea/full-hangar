import crypto from "node:crypto";
import { createPrivilegedServerClient } from "@/lib/supabase/server";

export type AdminRole = "admin" | "beta";

export type AdminUserRow = {
  id: string;
  username: string;
  email: string | null;
  role: AdminRole;
  is_active: boolean;
  google_sub: string | null;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  password_hash: string;
};

const HASH_PREFIX = "pbkdf2_sha256";
const HASH_ITERATIONS = 120000;
const HASH_KEYLEN = 32;
const HASH_DIGEST = "sha256";

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("base64url");
  const derived = crypto.pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEYLEN, HASH_DIGEST).toString("base64url");
  return `${HASH_PREFIX}$${HASH_ITERATIONS}$${salt}$${derived}`;
}

export function verifyPassword(password: string, encodedHash: string): boolean {
  const parts = String(encodedHash || "").split("$");
  if (parts.length !== 4) return false;
  const [prefix, iterationRaw, salt, expectedHash] = parts;
  if (prefix !== HASH_PREFIX) return false;
  const iterations = Number(iterationRaw);
  if (!Number.isFinite(iterations) || iterations < 1000) return false;
  const derived = crypto.pbkdf2Sync(password, salt, iterations, HASH_KEYLEN, HASH_DIGEST).toString("base64url");
  const left = Buffer.from(derived);
  const right = Buffer.from(expectedHash);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export async function listAdminUsers() {
  const supabase = createPrivilegedServerClient();
  const result = await supabase
    .from("admin_users")
    .select("id,username,email,role,is_active,google_sub,created_at,updated_at,last_login_at")
    .order("created_at", { ascending: false });
  if (result.error) throw new Error(result.error.message);
  return result.data ?? [];
}

export async function findAdminUserByUsernameOrEmail(identifier: string): Promise<AdminUserRow | null> {
  const normalized = String(identifier || "").trim();
  if (!normalized) return null;
  const supabase = createPrivilegedServerClient();
  const result = await supabase
    .from("admin_users")
    .select("id,username,email,role,is_active,google_sub,created_at,updated_at,last_login_at,password_hash")
    .or(`username.eq.${normalized},email.eq.${normalized}`)
    .limit(1);
  if (result.error) return null;
  return ((result.data ?? [])[0] as AdminUserRow | undefined) ?? null;
}

export async function findAdminUserByGoogleIdentity(email?: string, googleSub?: string): Promise<AdminUserRow | null> {
  const emailValue = String(email || "").trim();
  const subValue = String(googleSub || "").trim();
  if (!emailValue && !subValue) return null;
  const supabase = createPrivilegedServerClient();
  const clauses: string[] = [];
  if (emailValue) clauses.push(`email.eq.${emailValue}`);
  if (subValue) clauses.push(`google_sub.eq.${subValue}`);
  const result = await supabase
    .from("admin_users")
    .select("id,username,email,role,is_active,google_sub,created_at,updated_at,last_login_at,password_hash")
    .or(clauses.join(","))
    .limit(1);
  if (result.error) return null;
  return ((result.data ?? [])[0] as AdminUserRow | undefined) ?? null;
}
