# Production verification checklist

Run after each deploy to **`main`** (e.g. Vercel production). Primary public host: **https://full-hangar.com** (adjust if your canonical domain differs).

## 0. Ordered rollout (performance + listings reliability)

Do these **in order** after merging changes that touch listings or Supabase:

1. **Apply DB migration** `supabase/migrations/20260322000067_listing_filter_options_aggregate_rpc.sql` to the production project (`supabase db push` or SQL editor). Without it, filter options still work via the **chunked fallback** but stay slow and may hit statement timeouts.
2. **Deploy the Next.js app** so `/listings`, `/api/listings/options`, and CI match the same commit.
3. **Smoke-check** `/api/listings/options` — expect **200** in a few hundred ms (not ~25s), JSON `data.makes` non-empty when inventory exists.
4. **HAR / Network** — open `/listings`, confirm **no tight loop** on `/api/listings/options` and document request completes in reasonable time.
5. **GitHub Actions** — workflow **Listings Options Smoke** appears under the **Actions** tab once the workflow file is on the default branch; run manually if needed.

## 1. Vercel environment (build + runtime)

In **Project → Settings → Environment Variables**, for **Production** (and **Preview** if you use it):

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + server Supabase (required for `/listings/sitemap.xml` listing URLs) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same |
| `SUPABASE_SERVICE_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) | Server-only: privileged reads + RPC `get_listing_filter_options_payload`; sitemap prefers this when set |
| `INTERNAL_PASSWORD` | Internal routes if used |
| Any beta/Google keys | Per `.env.local` parity |

Without the two `NEXT_PUBLIC_SUPABASE_*` values at **runtime** (Vercel Production), `/listings/sitemap.xml` returns an empty urlset (by design).

Without a **service role** key at runtime, filter-options RPC may fail; the app falls back to chunked `public_listings` reads (slower).

## 2. Quick HTTP checks

Replace the host if needed:

```bash
curl -sI "https://full-hangar.com/" | head -n 5
curl -sI "https://full-hangar.com/listings" | head -n 5
curl -sI "https://full-hangar.com/listings/sitemap.xml" | head -n 5
curl -sS "https://full-hangar.com/api/listings/options" | head -c 400
```

Expect **200** (or **307/308** only if you intentionally redirect to `www`—follow once and recheck). Options body should include `"error":null` and populated `data` when the DB migration is applied.

## 3. Manual UX (desktop + phone)

- **Home** loads; no obvious console errors.
- **`/listings`**: grid/list/compact modes, **Filters** drawer on narrow viewports, results update; initial load should not sit on a spinner from repeated options fetches.
- **`/listings/{id}`**: gallery, comps area scrolls, back link on small screens.
- **`/internal/deal-desk`** (if you use it): login, sticky P&L bar clears safe area on iOS.

## 4. Smoke tests (local or CI)

```bash
npm run test:smoke:listings-all
```

Requires `.env.local` with Supabase keys for `npm run dev` (Playwright starts the dev server). GitHub Actions needs repository **Secrets** (see `AGENTS.md` → Listings Options workflow).

## 5. Optional SEO

- **`/sitemap.xml`**: static + curated listing landings.
- **`/listings/sitemap.xml`**: generated **dynamically on each request** (`app/listings/sitemap.ts` uses `force-dynamic`). It stays empty only when:
  - **`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`** are missing at **runtime** (Vercel Production), or
  - **`public_listings` queries fail** (check Vercel function logs for `[sitemap:listings]`).
  - Previously, a **statically prerendered** empty sitemap could be cached from builds where env was absent or the first query errored silently; the dynamic route avoids locking in that empty output.

Expect a large XML (up to ~20k URLs); `curl -sI` still returns **200** with a modest body length if the urlset is empty.
