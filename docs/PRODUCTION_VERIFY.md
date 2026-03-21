# Production verification checklist

Run after each deploy to **`main`** (e.g. Vercel production). Primary public host: **https://full-hangar.com** (adjust if your canonical domain differs).

## 1. Vercel environment (build + runtime)

In **Project → Settings → Environment Variables**, for **Production** (and **Preview** if you use it):

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + server Supabase (required for `/listings/sitemap.xml` listing URLs) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same |
| `INTERNAL_PASSWORD` | Internal routes if used |
| Any beta/Google keys | Per `.env.local` parity |

Without the two `NEXT_PUBLIC_SUPABASE_*` values at **build** time, `/listings/sitemap.xml` is intentionally empty (no build failure).

## 2. Quick HTTP checks

Replace the host if needed:

```bash
curl -sI "https://full-hangar.com/" | head -n 5
curl -sI "https://full-hangar.com/listings" | head -n 5
curl -sI "https://full-hangar.com/listings/sitemap.xml" | head -n 5
```

Expect **200** (or **307/308** only if you intentionally redirect to `www`—follow once and recheck).

## 3. Manual UX (desktop + phone)

- **Home** loads; no obvious console errors.
- **`/listings`**: grid/list/compact modes, **Filters** drawer on narrow viewports, results update.
- **`/listings/{id}`**: gallery, comps area scrolls, back link on small screens.
- **`/internal/deal-desk`** (if you use it): login, sticky P&L bar clears safe area on iOS.

## 4. Smoke tests (local or CI)

```bash
npm run test:smoke:listings-all
```

Requires `.env.local` with Supabase keys for `npm run dev` (Playwright starts the dev server). GitHub Actions needs repository **Secrets** (see `AGENTS.md` → Listings Options workflow).

## 5. Optional SEO

- **`/sitemap.xml`**: static + curated listing landings.
- **`/listings/sitemap.xml`**: per-listing URLs when Supabase env is present at build.
