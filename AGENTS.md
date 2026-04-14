# AGENTS.md — FullHangar / AircraftFlip
# Master context file. Load this into every Claude conversation and every Cursor session.
# Last updated: April 13, 2026

---

## PROJECT IDENTITY

Name: FullHangar (also referred to as AircraftFlip)
Mission: The vertically integrated aircraft transaction platform.
  Buyers find undervalued aircraft. Sellers reach every marketplace simultaneously.
  Escrow, inspections, brokerage, and financing all under one roof.
North star: Carvana for general aviation.
Current phase: Phase 1 — market intelligence (scraper pipeline + scoring model)
Stack: Python 3.12, Supabase (Postgres), Playwright, BeautifulSoup, requests
Repo root: project root contains /scraper, /core, /frontend directories

---

## CRITICAL CONSTRAINTS — READ BEFORE ANY CODE CHANGE

1. ANTI-BOT / CAPTCHA POLICY
   Several target sites use anti-bot protection. DO NOT attempt to bypass
   CAPTCHA walls with automated solvers or credential abuse.
   Approved strategies only:
     a) Browser extension ingestion (GlobalAir pattern — bridge_server_globalair.py)
     b) Playwright stealth mode with human-like delays
     c) Residential proxy rotation (when implemented)
     d) Graceful degradation: detect challenge page, log it, skip row, alert
   Canonical challenge markers live in scraper_health.py (`looks_like_challenge_html`, `CHALLENGE_MARKERS`).
   `refresh_aerotrader_listing_media.py` imports from there — extend markers in scraper_health only, do not fork duplicate lists.
   Sites with known anti-bot: AeroTrader (DataDome), AvBuyer, Controller (intermittent)

2. DATABASE WRITES
   All upserts use on_conflict="source_site,source_listing_id"
   Never hard-delete rows. Set is_active=False and inactive_date=today instead.
   UNSUPPORTED_COLUMNS = {interior_notes, maintenance_notes, airframe_notes, engine_notes}
   Do not attempt to write these columns — they do not exist in the schema.

3. ENVIRONMENT
   Credentials live in scraper/.env — never hardcode or log them.
   Required: SUPABASE_URL, SUPABASE_SERVICE_KEY
   get_supabase() is defined in scraper_base.py — use it, do not reimplement.

4. RATE LIMITING
   Minimum delay between requests: 2.5s
   Default range: 2.5–5.0s for list pages, 3.0–7.0s for detail pages
   Never remove delay logic. Scrapers that hammer sites get our IP banned.

---

## CODEBASE MAP

proxy.ts — waitlist + access gate (Next.js 16 **proxy** convention): session refresh via `@supabase/ssr`, `user_profiles.access_status` / `is_admin`, public allowlist includes `/api/image-proxy`, `/api/waitlist`, `/api/cron`, `/api/stripe/webhook`, account auth routes, `/internal/login`, `/beta/join`.
app/api/waitlist/join — public POST waitlist signup (service role upsert to `waitlist_requests`).
app/api/admin/waitlist/ — admin GET list; POST approve; POST approve-all (requires `user_profiles.is_admin`).

scraper/
  scraper_health.py        — looks_like_challenge_html, log_scraper_error → scraper_errors, retry_with_backoff,
                             SelectorConfig (primary + fallbacks), run_health_check (UTC vs prior day via RPC)
  scraper_base.py          — get_supabase(), shared DB helpers
  env_check.py             — validates environment on startup
  description_parser.py    — NLP extraction from listing text (parse_description)
  registration_parser.py   — N-number / registration normalization
  media_refresh_utils.py   — fetch_refresh_rows(), apply_media_update(), seen_within_hours()

  Scrapers (requests-based — aircraft marketplaces):
    aso_scraper.py          — ASO
    afs_scraper.py          — AircraftForSale
    barnstormers_scraper.py — Barnstormers
    tradaplane_scraper.py   — Trade-A-Plane
    avbuyer_scraper.py      — AvBuyer
    globalair_scraper.py    — GlobalAir (hybrid: scraper + bridge server)

  Scrapers (Playwright — aircraft marketplaces):
    controller_scraper.py   — Controller.com
    aerotrader_scraper.py   — AeroTrader (DataDome; fragile)

  Other scrapers (non-marketplace / catalog — different threat model):
    airpower_engine_scraper.py, avionics_*.py — vendor/catalog ingestion; not wired to shared challenge detection by default

  Bridge servers (browser extension ingestion):
    bridge_server_globalair.py — HTTP server receiving POST /ingest from extension

  Media backfill:
    aso_media_backfill.py
    refresh_aerotrader_listing_media.py

  Intelligence:
    compute_market_comps.py — aggregates market_comps table from active listings

scripts/
  run_aso_newonly.ps1       — Weekly scheduler wrapper for ASO new listings
  setup_task_scheduler.ps1  — One-time Task Scheduler registration

core/
  intelligence/
    aircraft_intelligence.py — scoring model v1.8, _get_market_comps()

app/
  (site)/page.tsx              — Public waitlist landing page (replaces prior marketing homepage)
  internal/waitlist/page.tsx   — Admin waitlist management (pairs with /api/admin/waitlist APIs)
  components/WaitlistForm.tsx  — Client waitlist join form → POST /api/waitlist/join
  components/admin/WaitlistManager.tsx — Client table for approve / bulk-approve
  components/internal/InternalAccessRequestsNav.tsx — Internal hub link + amber pending badge

---

## AGENT ROLES

Each agent operates in its own Claude conversation with this file + its domain files as context.
Agents do NOT share state at runtime. Coordinate via this document and the task queue below.

### AGENT 1 — Scraper Maintainer
Owns: All files in scraper/ that fetch data from external sites
Responsibilities:
  - Monitor and fix broken selectors
  - Extend looks_like_challenge_html() as new bot walls are encountered
  - Implement self-healing: error logging, retry logic, selector versioning
  - Add new listing sources when directed
  - NEVER bypass CAPTCHA walls — use bridge server pattern or graceful skip
Context to load: This file + scraper_base.py + the specific broken scraper

### AGENT 2 — Scoring Model Engineer  
Owns: core/intelligence/aircraft_intelligence.py, compute_market_comps.py
Responsibilities:
  - Iterate on valuation algorithm (currently v1.8)
  - Add new scoring dimensions: flight hours, damage history, avionics stack, regional variance
  - Backtest against known sale prices in aircraft_component_sales table
  - Maintain market_comps aggregation accuracy
Context to load: This file + compute_market_comps.py + aircraft_intelligence.py

### AGENT 3 — Frontend Builder
Owns: /frontend directory
Responsibilities:
  - Buyer-facing deal alert dashboard
  - Seller intake form (Phase 2 critical path)
  - Listing detail pages
  - Subscription/billing UI (Stripe integration)
Context to load: This file + frontend codebase + current design spec

### AGENT 4 — Backend / API Engineer
Owns: API routes, Supabase schema, auth, billing
Responsibilities:
  - REST/RPC endpoints for frontend
  - Stripe subscription webhook handling
  - User alert preference storage
  - Schema migrations (additive only — never drop columns)
Context to load: This file + API codebase + Supabase schema

### AGENT 5 — Product Strategist
Owns: This AGENTS.md file, PRDs, sprint planning
Responsibilities:
  - Keep roadmap current
  - Write PRDs for each new feature before Agent 3/4 build it
  - Prioritize tasks by revenue impact
  - Update CURRENT TASK QUEUE below after each sprint
Context to load: This file only

---

## CURRENT TASK QUEUE (Phase 1 completion)

- [x] BACKEND — Comp family grouping, Beechcraft display names, model case deduplication (`scraper/model_normalizer.py`). **`resolve_comp_family()` / `resolve_comp_family_key()`** are the canonical comp lookup path — all future market comps queries (live pools, `market_comps`, `compute_market_comps` buckets) must go through them.

Priority 1 — AGENT 1 — Self-healing scraper pipeline (see scraper_health.py)
  [x] Centralized errors: table `scraper_errors` (migration `20260329120000_scraper_errors_and_price_alert_grants.sql`); Python `log_scraper_error()`; optional CLI `python scraper/scraper_health.py --summary`
  [x] Challenge detection: shared `looks_like_challenge_html` / `detect_challenge_type` in scraper_health.py; wired on marketplace scrapers that fetch listing HTML (ASO, TAP, AFS, Barnstormers, AvBuyer, GlobalAir, AeroTrader). Controller does not run the generic HTML string matcher on every page (Distil/embeds false positives); it uses listing-card presence + CAPTCHA pause + `log_scraper_error` when session looks expired (see controller `wait_for_search_ready`).
  [x] Retry: `retry_with_backoff` decorator in scraper_health.py (used by TAP, Barnstormers, AFS; others keep inline backoff where appropriate)
  [x] Daily health: RPC `scraper_health_active_counts(p_day)` (migration `20260409143000_scraper_health_active_counts_rpc.sql`); `run_health_check` compares UTC today vs yesterday; `npm run pipeline:scraper:health`; Vercel cron `GET /api/cron/scraper-health` (Bearer `CRON_SECRET`, schedule in vercel.json)
  [x] Selector versioning: `SelectorConfig` primary + fallbacks + usage counts (Controller detail price, TAP/AvBuyer/AFS/Barnstormers, etc.)
  [x] Controller: at most one `scraper_errors` row per `wait_for_search_ready` for session-expired challenge (resume loop no longer spams DB)
  [x] Non-marketplace scrapers: no blanket challenge wiring — vendor/catalog scripts are mostly one-offs; add `looks_like_challenge_html` + `log_scraper_error` at a single fetch entrypoint only if a run shows blocks or repeated failures.


Priority 2 — AGENT 2 — Scoring model v2.0 (`INTELLIGENCE_VERSION` **2.2.0** — bump + full `backfill_scores.py --all` after deploy)
  [x] Total time airframe in comp buckets: live comp pools expose `median_ttaf`; precomputed `market_comps.median_ttaf` from `compute_market_comps.py`; listing field `comp_median_ttaf` (migration `20260409220000_scoring_v220_columns_and_public_listings.sql`)
  [x] Regional pricing: `market_comps_regional` + `_build_regional_pricing_for_flip` → `regional_price_index` (now persisted on `aircraft_listings` / `public_listings`)
  [x] Damage history: text needles + NTSB/registry guards (v2.1.1+); v2.2.0 persists `description_damage_penalty` and applies up to 5 pts to `flip_score` when prose mentions damage
  [x] Avionics stack value: `avionics_installed_value` / alias `avionics_value_estimate` (catalog dollar sum from `avionics_intelligence.avionics_score`)
  [x] Backtest (phase 1): `scraper/backtest_flip_calibration.py` + `npm run pipeline:score:backtest-flip` — cohort stats on inactive listings; **phase 2** when realized `sold_price` exists: extend script for score vs sale error

Priority 3 — AGENT 3 — Buyer MVP
  [ ] Deal alert subscription page ($49/$99/month tiers)
  [ ] Email digest: top 10 undervalued listings matching user's saved search filters
  [ ] Listing card component with score badge, price vs market comp, days on market

Priority 4 — AGENT 3 + 4 — Seller intake (Phase 2 unlock)
  [x] BACKEND — Waitlist gating: migration `20260413120000_add_waitlist_system.sql` (`waitlist_requests`; `user_profiles` extended with `access_status`, `is_admin`, `email`, `access_granted_at`; trigger + `auth_user_id_by_email` RPC). `proxy.ts` gate; `POST /api/waitlist/join`; `GET/POST /api/admin/waitlist/*`; `lib/email/sendApprovalEmail.ts`. **Staff admin:** set `user_profiles.is_admin = true` (and `access_status = approved`) for admin emails in Supabase.
  [ ] Seller submission form: make/model/year, asking price, total time, engine time, location, photos
  [ ] Cross-posting queue: submitted listing triggers posting workflow to each platform
  [ ] Seller dashboard: status of each platform posting

**PERF (April 10, 2026)** — Listings browse/detail: ISR `revalidate` on `/listings` and `/listings/[id]`, slim `public_listings` card `select()` (no description / `flip_explanation` / `ev_explanation`), `ListingCard` row type + cached active listing count (`getAircraftListingsCount`), long-cache `Cache-Control` + `revalidate` on `/api/listings/options`, Next `images.remotePatterns` + card `next/image`, `app/listings/loading.tsx` skeleton, hover `router.prefetch` on cards, migration `20260410120000_add_performance_indexes.sql` (run `npx supabase db push` when ready).

---

## DATA SCHEMA (key tables)

aircraft_listings:
  source_site, source_listing_id (unique together)
  source_id, source_url, title, make, model, year
  asking_price, price_asking (both maintained for compatibility)
  total_time_airframe, engine_time_since_overhaul
  has_glass_cockpit, avionics_score
  image_urls (array), primary_image_url
  description, description_full, description_intelligence (jsonb)
  is_active, first_seen_date, last_seen_date, inactive_date
  n_number, registration_raw, manufacturer_tier

market_comps:
  make, model (unique together)
  sample_size, median_price, median_smoh, pct_with_glass

scraper_errors: (migration `20260329120000_scraper_errors_and_price_alert_grants.sql`)
  id, source_site, error_type, url, raw_error, extra (jsonb), resolved, created_at

waitlist_requests: (migration `20260413120000_add_waitlist_system.sql`)
  id, name, email (unique), role (`buyer`|`seller`|`broker`), status (`pending`|`approved`|`rejected`),
  requested_at, approved_at, approved_by, notes

user_profiles (waitlist columns): `access_status` (`pending`|`approved`|`rejected`), `is_admin`, `access_granted_at`, `email` (lookup / approval flows; canonical profile table remains `user_profiles`, not a separate `profiles` table)

### Performance indexes (added April 10, 2026 — migration `20260410120000_add_performance_indexes.sql`)

- `idx_listings_is_active` — partial index on `is_active = true`
- `idx_listings_deal_tier` — partial on `is_active = true` (`deal_tier`)
- `idx_listings_flip_score` — partial, `flip_score DESC NULLS LAST`, `is_active = true`
- `idx_listings_make` — partial on `is_active = true`
- `idx_listings_asking_price` — partial, `asking_price IS NOT NULL`, `is_active = true`
- `idx_listings_active_tier_score` — composite `(is_active, deal_tier, flip_score DESC)` for browse-style filters
- `idx_listings_source` — `(source_site, source_listing_id)` for upserts / dedupe

---

## ANTI-BOT STRATEGY BY SITE

AeroTrader: DataDome. Use Playwright + stealth args. On challenge detection,
  log to scraper_errors, mark listing stale, do not crash run.
  Bridge server pattern is the preferred long-term solution.

AvBuyer: Intermittent Cloudflare. Add cf_clearance cookie rotation when hit.
  Current workaround: longer delays (5–10s), rotate User-Agent strings.

Controller: Generally cooperative. Occasional rate limiting. Respect 429 responses
  with 60s backoff before retry.

Trade-A-Plane: Cooperative. Standard requests scraper is stable.

ASO: Cooperative. Session warmup (GET homepage first) improves success rate.

GlobalAir: Bridge server is the primary ingestion path. Direct scraping is backup.

---

## BROWSER EXTENSION PATTERN (GlobalAir / future sites)

When a site is too aggressive for automated scraping:
1. User browses site normally in Chrome with the FullHangar extension installed
2. Extension intercepts XHR/fetch responses matching listing patterns
3. Extension POSTs structured JSON to bridge server at 127.0.0.1:PORT/ingest
4. Bridge server normalizes and upserts to Supabase
5. This pattern bypasses all bot detection because the browser session is human-driven
Reference implementation: bridge_server_globalair.py + the GlobalAir Chrome extension

**Unified Harvester (`browser-extension/`):** When Distil pauses Controller harvesting, the popup shows a challenge banner; after the user solves the CAPTCHA in the Controller tab, they click **Resume Scraping**, which sends `RESUME_HARVEST` to the service worker (clears `challengeDetected` / `pausedReason`, brief delay, then `runHarvest()` continues from saved state).

---

## CONTROLLER.COM — DEDICATED CHROME (CDP, ALWAYS-WARM SESSION)

Controller scraping can use a **separate Chrome profile** with **Chrome DevTools Protocol** on port **9222** so one long-lived browser keeps the Distil session alive between runs. Scripts: `scripts/launch-chrome-controller.ps1` (start Chrome) and `scripts/run-controller-pipeline.ps1` (ensure CDP, then run `controller_scraper.py` with `--cdp-url` and `--captcha-resume file`). Extension install steps: `scripts/install-fullhangar-extension.md`.

When **not** using CDP, Playwright persists cookies/localStorage to `scraper/state/controller_chrome_session.json` after each successful list-page load so the next run can reuse the Distil session. The scraper also listens on **127.0.0.1:9998** (override with `--resume-port`) for **POST /resume** from the browser extension after a CAPTCHA solve; **GET /status** returns `{"status":"waiting"}` for a quick health check.

**npm:** `npm run chrome:controller` — launch dedicated Chrome; `npm run pipeline:controller` — pipeline runner (pass extra args after `--`, e.g. `npm run pipeline:controller -- --dry-run --limit 10`); `npm run pipeline:controller:dry` — same with baked-in `--dry-run --limit 10`.

---

## CODING STANDARDS

- All scrapers must import from scraper_base.py — no standalone DB clients
- parse_description() from description_parser.py for all listing text
- apply_registration_fields() from registration_parser.py for all N-number extraction
- Logging: use module-level logger = logging.getLogger(__name__), not print()
- argparse for all CLI scripts with --dry-run, --limit, --verbose as standard flags
- Type hints on all new functions
- Never catch bare Exception without logging the error first

---

## REVENUE MILESTONES (context for prioritization)

$5K/month  → fund Philippines operations team
$25K/month → legal/compliance, broker license pursuit  
$50K/month → broker co-license active
$100K/month → own escrow entity
Phase 2 (seller listing service) is the unlock for $5K/month target.
Phase 2 requires: seller intake form + cross-posting automation + Philippine team onboarding.

---

## COMPLETED RECENTLY — Platform and Infra

- Account system Phase 1 — BACKEND: migrations `20260329000078`–`20260329000081` applied
  (`user_profiles` with auto-create trigger + RLS, `saved_searches` + `price_alert_log`,
  `user_id` on `deal_desk_scenarios`, `listing_views` for seller analytics foundation).
  API routes: `GET`/`PATCH` `/api/account/profile`, `GET` `/api/account/activity`,
  `GET`/`POST` `/api/account/searches`, `PATCH`/`DELETE` `/api/account/searches/[id]`.
  Resend: `sendWelcomeEmail` in `lib/resend/sendVerificationEmail.ts` + `WelcomeEmail` template.
  Route Handler auth uses `@supabase/ssr` via `createRouteHandlerSupabaseClient` in `lib/supabase/server.ts`.
  Migration `20260329000082`: `deal_desk_scenarios.listing_id` nullable, `coach_desk_state` JSONB,
  partial unique `(user_id, listing_id)` when both set. Public `GET`/`POST` `/api/deal-desk/scenarios`
  (session auth; `user_id` from server, not request body).
  `POST` `/api/listings/[id]/view` records `listing_views` via service role (optional JSON `source`, `session_id`).

## COMPLETED RECENTLY — Frontend Product and UX

- Account system Phase 1 — FRONTEND: `/account/signup`, `/account/login`, `/account/verify` with Google + email/password.
  Apple Sign-In is not rendered unless `NEXT_PUBLIC_APPLE_CLIENT_ID` is set (see Open Work). OAuth callback at `/account/auth/callback`
  with `fh_auth_return` cookie + `next` query for safe internal redirects. `createSupabaseRscClient()` in
  `lib/supabase/server.ts` for cookie-backed server pages. Unified `SiteHeader`: unauthenticated shows Sign in /
  Create account; authenticated shows avatar (initials fallback), name, `NotificationBell`, `AccountDropdown`
  (lazy activity counts, nav links, admin-only internal links, sign out). Auth segment `(auth)` + `account-auth-shell`
  hides global header via CSS. `/account` dashboard: welcome, quick actions, notification toggles with debounced
  `PATCH /api/account/profile`. Deal Coach `StepDeepDesk` save → `/api/deal-desk/scenarios` with session `user_id`;
  logged-out users go to `/account/signup?returnTo=…`. `useCurrentUser` + `lib/supabase/browser.ts`. Supporting
  routes: `/account/profile`, `/account/searches`, `/account/scenarios`, `/account/watchlist` (placeholder).

- Account Phase 2 (March 2026): `savedSearchFiltersToListingsPageQuery` for server-side filter replay; **PATCH** `/api/account/searches/[id]` (`name`, `alert_enabled`); daily cron `GET /api/cron/price-alerts` (`vercel.json` 14:00 UTC) + `CRON_SECRET` Bearer auth; `runPriceAlertCron` + `sendPriceAlertDigest` (Resend) + `price_alert_log` rows; **NotificationBell** + `/api/account/activity` field `recentAlertRows` (14d); dashboard quick link to Deal alerts.

- Stripe buyer subscriptions (March 2026): migration `20260401000000_add_subscription_fields.sql` — `user_profiles` columns `stripe_customer_id`, `subscription_tier` (`scout`|`pro`), `subscription_status`, `subscription_period_end`. Routes `POST /api/stripe/create-checkout`, `POST /api/stripe/portal`, `POST /api/stripe/webhook` (raw body). `/account/alerts` Checkout + Customer Portal; `runPriceAlertCron` sends digests only when `subscription_status = active`. Env: see `.env.local.example` (Stripe price IDs + secrets).

- Scraper self-healing: `scraper_errors` + `scraper_health.py` utilities; marketplace scrapers use shared challenge detection where applicable; `scraper_health_active_counts` RPC + `/api/cron/scraper-health` + `npm run pipeline:scraper:health` (see Priority 1 queue for details).

- Scoring Priority 2 (partial): `INTELLIGENCE_VERSION` **2.1.1** — `_description_damage_mention_adjustment` (text needles, skips when NTSB `most_severe_damage` set or `no_damage_history` true). **Run** `backfill_scores.py --all` after deploy.

## OPEN WORK — Medium Priority (Account)

- **Account Phase 2 follow-ups:** per-search throttle tuning; optional “alert on price drop only” vs current digest; enforce Scout “5 saved searches” cap in UI/API if desired.
- **Account Phase 3 (seller features):** `/account/listings` for seller-submitted
  listings, `listing_views` analytics dashboard (views/day chart, source breakdown),
  waitlist CTA → real listing creation flow.
- **Apple Sign-In setup:** requires Apple Developer account ($99/yr). Configure
  at developer.apple.com → Certificates, Identifiers & Profiles → Sign In with Apple.
  Add credentials to Supabase Auth providers and `NEXT_PUBLIC_APPLE_CLIENT_ID` env var.
