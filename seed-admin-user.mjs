import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const HASH_PREFIX = "pbkdf2_sha256";
const HASH_ITERATIONS = 120000;
const HASH_KEYLEN = 32;
const HASH_DIGEST = "sha256";

function parseEnvFile(filePath) {
  try {
    const text = fs.readFileSync(filePath, "utf8");
    const lines = text.split(/\r?\n/);
    const values = {};
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const idx = line.indexOf("=");
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
      values[key] = value;
    }
    return values;
  } catch {
    return {};
  }
}

function getEnvValue(key, fallback) {
  if (process.env[key]) return process.env[key];
  if (fallback && fallback[key]) return fallback[key];
  return "";
}

function resolveServiceRoleKey() {
  const root = process.cwd();
  const scraperEnv = parseEnvFile(path.join(root, "scraper", ".env"));
  return (
    getEnvValue("SUPABASE_SERVICE_KEY", scraperEnv) ||
    getEnvValue("SUPABASE_SERVICE_ROLE_KEY", scraperEnv) ||
    getEnvValue("NEXT_SUPABASE_SERVICE_ROLE_KEY", scraperEnv)
  );
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const derived = crypto.pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEYLEN, HASH_DIGEST).toString("base64url");
  return `${HASH_PREFIX}$${HASH_ITERATIONS}$${salt}$${derived}`;
}

async function main() {
  const root = process.cwd();
  const localEnv = parseEnvFile(path.join(root, ".env.local"));
  const supabaseUrl = getEnvValue("NEXT_PUBLIC_SUPABASE_URL", localEnv);
  const serviceRoleKey = resolveServiceRoleKey();

  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL (.env.local).");
  }
  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_KEY/SUPABASE_SERVICE_ROLE_KEY (env or scraper/.env).");
  }

  const username = getEnvValue("ADMIN_SEED_USERNAME", localEnv) || "Ryan";
  const password = getEnvValue("ADMIN_SEED_PASSWORD", localEnv) || "hippo8me";
  const email = getEnvValue("ADMIN_SEED_EMAIL", localEnv) || "";
  const role = (getEnvValue("ADMIN_SEED_ROLE", localEnv) || "admin").toLowerCase() === "beta" ? "beta" : "admin";

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const nowIso = new Date().toISOString();
  const passwordHash = hashPassword(password);

  const existing = await supabase
    .from("admin_users")
    .select("id")
    .or(`username.eq.${username}${email ? `,email.eq.${email}` : ""}`)
    .limit(1);
  if (existing.error) throw new Error(existing.error.message);

  if (existing.data && existing.data.length > 0) {
    const id = existing.data[0].id;
    const update = await supabase
      .from("admin_users")
      .update({
        username,
        email: email || null,
        role,
        is_active: true,
        password_hash: passwordHash,
        updated_at: nowIso,
      })
      .eq("id", id);
    if (update.error) throw new Error(update.error.message);
    console.log(`Updated existing admin user: ${username}`);
  } else {
    const insert = await supabase.from("admin_users").insert({
      username,
      email: email || null,
      role,
      is_active: true,
      password_hash: passwordHash,
      created_at: nowIso,
      updated_at: nowIso,
    });
    if (insert.error) throw new Error(insert.error.message);
    console.log(`Created admin user: ${username}`);
  }

  if (!email) {
    console.log("No email set. Add ADMIN_SEED_EMAIL to enable Google login mapping.");
  } else {
    console.log(`Google login can map to email: ${email}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
