# AGENTS.md — FullHangar / AircraftFlip
# Master context file. Load this into every Claude conversation and every Cursor session.
# Last updated: March 2026

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
   The function looks_like_challenge_html() in refresh_aerotrader_listing_media.py
   is the canonical challenge detector. Extend it, do not replace it.
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

scraper/
  scraper_base.py          — get_supabase(), shared DB helpers
  env_check.py             — validates environment on startup
  description_parser.py    — NLP extraction from listing text (parse_description)
  registration_parser.py   — N-number / registration normalization
  media_refresh_utils.py   — fetch_refresh_rows(), apply_media_update(), seen_within_hours()

  Scrapers (requests-based):
    aso_scraper.py          — Aviation Shopper Online
    controller_scraper.py   — Controller.com
    tradaplane_scraper.py   — Trade-A-Plane
    avbuyer_scraper.py      — AvBuyer
    globalair_scraper.py    — GlobalAir (hybrid: scraper + bridge server)

  Scrapers (Playwright-based):
    aerotrader_scraper.py   — AeroTrader (DataDome evasion, fragile)

  Bridge servers (browser extension ingestion):
    bridge_server_globalair.py — HTTP server receiving POST /ingest from extension

  Media backfill:
    aso_media_backfill.py
    refresh_aerotrader_listing_media.py

  Intelligence:
    compute_market_comps.py — aggregates market_comps table from active listings

core/
  intelligence/
    aircraft_intelligence.py — scoring model v1.8, _get_market_comps()

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

Priority 1 — AGENT 1 — Self-healing scraper pipeline
  [ ] Centralized error log table in Supabase: scraper_errors(source_site, error_type, url, timestamp, raw_error)
  [ ] Challenge detection in ALL scrapers (not just AeroTrader) using shared looks_like_challenge_html()
  [ ] Retry decorator with exponential backoff (max 3 attempts, 2x delay each retry)
  [ ] Daily health check: count active listings per source_site, alert if any drops >20% vs prior day
  [ ] Selector versioning: store CSS selectors in config dict, log when fallback selector is used

Priority 2 — AGENT 2 — Scoring model v2.0
  [ ] Add total_time_airframe dimension to comp buckets
  [ ] Regional pricing variance: group by state/region, compute regional_price_index
  [ ] Damage history penalty: parse description_intelligence for accident/damage mentions
  [ ] Avionics stack value: map known avionics to dollar values, sum as avionics_value_estimate
  [ ] Backtest: compare score vs eventual sale price for listings marked inactive

Priority 3 — AGENT 3 — Buyer MVP
  [ ] Deal alert subscription page ($49/$99/month tiers)
  [ ] Email digest: top 10 undervalued listings matching user's saved search filters
  [ ] Listing card component with score badge, price vs market comp, days on market

Priority 4 — AGENT 3 + 4 — Seller intake (Phase 2 unlock)
  [ ] Seller submission form: make/model/year, asking price, total time, engine time, location, photos
  [ ] Cross-posting queue: submitted listing triggers posting workflow to each platform
  [ ] Seller dashboard: status of each platform posting

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

scraper_errors: (TO BE CREATED)
  id, source_site, error_type, url, timestamp, raw_error, resolved

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

- Account Phase 2 (March 2026): `savedSearchFiltersToListingsPageQuery` for server-side filter replay; **PATCH** `/api/account/searches/[id]` (`name`, `alert_enabled`); daily cron `GET /api/cron/price-alerts` (`vercel.json` 14:00 UTC) + `CRON_SECRET` Bearer auth; `runPriceAlertCron` + `sendPriceAlertDigest` (Resend) + `price_alert_log` rows; **NotificationBell** + `/api/account/activity` field `recentAlertRows` (14d); `/account/alerts` buyer MVP placeholder ($49/$99 copy); dashboard quick link to Deal alerts.

- Scraper Priority 1 (partial): migration `20260329120000_scraper_errors_and_price_alert_grants.sql` — `scraper_errors` table + service_role grants + `price_alert_log` INSERT for cron; `globalair_scraper` delegates to shared `looks_like_challenge_html`; AeroTrader uses shared detector for DataDome markers.

- Scoring Priority 2 (partial): `INTELLIGENCE_VERSION` **2.1.1** — `_description_damage_mention_adjustment` (text needles, skips when NTSB `most_severe_damage` set or `no_damage_history` true). **Run** `backfill_scores.py --all` after deploy.

## OPEN WORK — Medium Priority (Account)

- **Account Phase 2 follow-ups:** Stripe tiers on `/account/alerts`; per-search throttle tuning; optional “alert on price drop only” vs current digest.
- **Account Phase 3 (seller features):** `/account/listings` for seller-submitted
  listings, `listing_views` analytics dashboard (views/day chart, source breakdown),
  waitlist CTA → real listing creation flow.
- **Apple Sign-In setup:** requires Apple Developer account ($99/yr). Configure
  at developer.apple.com → Certificates, Identifiers & Profiles → Sign In with Apple.
  Add credentials to Supabase Auth providers and `NEXT_PUBLIC_APPLE_CLIENT_ID` env var.
