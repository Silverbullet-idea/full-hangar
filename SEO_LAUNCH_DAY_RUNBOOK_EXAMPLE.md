# SEO Launch Day Runbook (Filled Example)

This is a filled example you can copy for a real launch run.  
If any sample listing URL returns 404, replace with a currently active `/listings/[id]` URL.

## A) Pre-Launch Configuration

- [x] Confirm production env vars are set:
  - [x] `NEXT_PUBLIC_SITE_URL=https://fullhangar.com`
  - [x] `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=<google_token_here>`
  - [x] `NEXT_PUBLIC_BING_SITE_VERIFICATION=<bing_token_here>`

Result/notes:
- Env vars configured in hosting dashboard.
- Redeploy required after token updates.

## B) Deploy

- [x] Trigger production deploy with latest SEO changes.
- [x] Confirm deployment succeeded (no build/runtime errors).

Result/notes:
- Build green and routes generated include:
  - `/robots.txt`
  - `/sitemap.xml`
  - `/listings/sitemap.xml`

## C) Technical Endpoint Verification

- [x] `https://fullhangar.com/robots.txt`
  - [x] Contains:
    - `https://fullhangar.com/sitemap.xml`
    - `https://fullhangar.com/listings/sitemap.xml`
- [x] `https://fullhangar.com/sitemap.xml`
  - [x] Contains core + curated landing pages
- [x] `https://fullhangar.com/listings/sitemap.xml`
  - [x] Contains listing detail URLs

Result/notes:
- Robots and both sitemaps return HTTP 200.

## D) On-Page Metadata Spot Checks

Pages checked:

- [x] `https://fullhangar.com/`
- [x] `https://fullhangar.com/listings`
- [x] `https://fullhangar.com/listings/ab_372946`
- [x] `https://fullhangar.com/listings/ab_371798`
- [x] `https://fullhangar.com/listings/ab_371598`

For each page verify:

- [x] `<title>` present and relevant
- [x] meta description present
- [x] canonical URL correct
- [x] robots behavior correct
- [x] OpenGraph/Twitter tags present

Result/notes:
- Listing detail pages canonicalize to `/listings/[id]` without transient query params.

## E) Structured Data Validation

Google Rich Results Test:

- [x] `/listings` contains `ItemList`
- [x] `/listings/ab_372946` contains `Product`
- [x] `/listings/ab_372946` contains `Offer` (price present)
- [x] `/listings/ab_372946` contains `BreadcrumbList`

Result/notes:
- No critical structured-data parse errors.

## F) Search Console + Bing Submission

Google Search Console:

- [x] Property `https://fullhangar.com` verified
- [x] Submitted `https://fullhangar.com/sitemap.xml`
- [x] Submitted `https://fullhangar.com/listings/sitemap.xml`
- [x] URL Inspection + Request Indexing:
  - [x] `/`
  - [x] `/listings`
  - [x] `/listings/ab_372946`

Bing Webmaster Tools:

- [x] Site verified
- [x] Submitted both sitemap URLs
- [x] Inspected/submitted:
  - [x] `/`
  - [x] `/listings`
  - [x] `/listings/ab_372946`

Result/notes:
- Both search consoles accepted sitemap submissions.

## G) Indexing Policy QA (Critical)

Curated pages (should be indexable):

- [x] `https://fullhangar.com/listings?category=single`
- [x] `https://fullhangar.com/listings?category=jet`
- [x] `https://fullhangar.com/listings?make=Cessna`
- [x] `https://fullhangar.com/listings?dealTier=TOP_DEALS`

Long-tail (should be noindex,follow):

- [x] `https://fullhangar.com/listings?q=cessna+182&source=avbuyer&risk=HIGH&modelFamily=182&sortBy=price_low`

Detail canonical behavior:

- [x] `https://fullhangar.com/listings/ab_372946?returnTo=%2Flistings%3Fcategory%3Dsingle`
  - [x] canonical points to `https://fullhangar.com/listings/ab_372946`

Result/notes:
- Policy behavior matches plan: curated indexed, long-tail suppressed.

## H) Launch Acceptance Criteria

- [x] Robots and both sitemaps reachable
- [x] Metadata checks pass on core and detail pages
- [x] Structured data validates on sample pages
- [x] Google/Bing sitemap submissions completed
- [x] Indexing policy behaves as designed

Go/No-Go decision:
- [x] GO
- [ ] NO-GO

Decision notes:
- Launch approved. Move to weekly monitoring cadence.

## I) Post-Launch Monitoring (First 2 Weeks)

Day 1:
- [ ] Confirm sitemap discovery status in GSC/Bing
- [ ] Check for immediate crawl or structured-data errors

Day 3:
- [ ] Check indexed page trend
- [ ] Review excluded page reasons (expect noindex on long-tail filters)

Day 7:
- [ ] Compare impressions/clicks for `/listings` and curated landing pages
- [ ] Review canonical/duplicate warnings

Day 14:
- [ ] Compare week-over-week CTR and average position
- [ ] Create follow-up task list for metadata copy improvements

Tracking notes:
- Keep screenshots of Search Console coverage and rich-result validation runs.
