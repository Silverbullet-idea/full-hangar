# SEO Launch Day Runbook

Use this runbook in order. Check each box and record the result before moving on.

## A) Pre-Launch Configuration

- [ ] Confirm production env vars are set:
  - [ ] `NEXT_PUBLIC_SITE_URL=https://fullhangar.com`
  - [ ] `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=<token>`
  - [ ] `NEXT_PUBLIC_BING_SITE_VERIFICATION=<token>`

Result/notes:
- 

## B) Deploy

- [ ] Trigger production deploy with latest SEO changes.
- [ ] Confirm deployment succeeded (no build/runtime errors).

Result/notes:
- 

## C) Technical Endpoint Verification

Open and verify:

- [ ] `https://fullhangar.com/robots.txt`
  - [ ] Contains sitemap links for both root and listings sitemap
- [ ] `https://fullhangar.com/sitemap.xml`
  - [ ] Returns core + curated URLs
- [ ] `https://fullhangar.com/listings/sitemap.xml`
  - [ ] Returns listing-detail URLs

Result/notes:
- 

## D) On-Page Metadata Spot Checks

Check pages:

- [ ] `https://fullhangar.com/`
- [ ] `https://fullhangar.com/listings`
- [ ] At least 3 listing detail pages (`/listings/[id]`)

For each page verify:

- [ ] `<title>` is present and relevant
- [ ] meta description is present
- [ ] canonical URL is correct
- [ ] expected robots behavior is correct (public pages indexable)
- [ ] social metadata present (OpenGraph/Twitter)

Result/notes:
- 

## E) Structured Data Validation

Validate in Google Rich Results Test:

- [ ] `/listings` includes valid `ItemList`
- [ ] `/listings/[id]` includes valid `Product`
- [ ] `/listings/[id]` includes `Offer` when price exists
- [ ] `/listings/[id]` includes `BreadcrumbList`

Result/notes:
- 

## F) Search Console + Bing Submission

Google Search Console:

- [ ] Property `https://fullhangar.com` verified
- [ ] Submitted `https://fullhangar.com/sitemap.xml`
- [ ] Submitted `https://fullhangar.com/listings/sitemap.xml`
- [ ] Ran URL Inspection + Request Indexing for:
  - [ ] `/`
  - [ ] `/listings`
  - [ ] one high-quality listing detail URL

Bing Webmaster Tools:

- [ ] Site verified
- [ ] Submitted both sitemap URLs
- [ ] Inspected and submitted the same sample URLs

Result/notes:
- 

## G) Indexing Policy QA (Critical)

Curated pages should be indexable:

- [ ] `https://fullhangar.com/listings?category=single`
- [ ] `https://fullhangar.com/listings?category=jet`
- [ ] `https://fullhangar.com/listings?make=Cessna`
- [ ] `https://fullhangar.com/listings?dealTier=TOP_DEALS`

Long-tail filter pages should not be indexable:

- [ ] Sample URL with multiple filters (e.g. q + model + source + risk) confirms noindex policy

Detail canonical behavior:

- [ ] Listing URL with transient params (e.g. `?returnTo=...`) canonicalizes to `/listings/[id]`

Result/notes:
- 

## H) Launch Acceptance Criteria

Mark launch complete only when all are true:

- [ ] Robots and both sitemaps are reachable
- [ ] Metadata checks pass on core and detail pages
- [ ] Structured data validates on sample pages
- [ ] Google and Bing sitemap submissions completed
- [ ] Indexing policy behaves as designed

Go/No-Go decision:
- [ ] GO
- [ ] NO-GO

Decision notes:
- 

## I) Post-Launch Monitoring (First 2 Weeks)

Day 1:
- [ ] Check Search Console Coverage/Pages report for spikes in errors
- [ ] Confirm discovery of sitemap URLs

Day 3:
- [ ] Check indexed page trend and excluded reasons
- [ ] Inspect curated landing impressions

Day 7:
- [ ] Review CTR and average position on core landing pages
- [ ] Check duplicate/canonical warnings

Day 14:
- [ ] Compare week-over-week trend
- [ ] Document follow-up fixes or content opportunities

Tracking notes:
- 
