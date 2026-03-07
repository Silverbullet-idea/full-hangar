# Frontend SEO Audit Baseline

## Scope

- Public routes reviewed: `/`, `/listings`, `/listings/[id]`
- Internal route reviewed: `/internal/login`
- Crawl controls reviewed: robots policy, sitemap coverage, canonical behavior, metadata ownership
- Structured data reviewed: JSON-LD for listing index and detail pages

## Baseline Findings (Before Changes)

1. **Metadata ownership was ambiguous**
   - Duplicate App Router route files existed (`.js` and `.tsx`) for `app/layout`, `app/page`, and `app/listings/[id]/page`.
   - Risk: incorrect or inconsistent SEO metadata at runtime.

2. **No crawl directives existed**
   - No `app/robots.ts` and no `public/robots.txt`.
   - Search engines had no explicit sitemap references or disallow guidance.

3. **No sitemap coverage existed**
   - No root sitemap and no listing-detail sitemap route.
   - Dynamic listing discovery depended entirely on crawl path traversal.

4. **No route-level metadata**
   - `/listings` and `/listings/[id]` had no `generateMetadata`, no canonical strategy, no route-specific robots directives.
   - Query-string variants (especially `returnTo`) could create duplicate URL indexation risk.

5. **No structured data**
   - No `ItemList`, `Product`, `Offer`, or `BreadcrumbList` JSON-LD on listing pages.

6. **Weak index-page semantic signals**
   - Listings page had no explicit SEO-facing heading/content block.
   - Pagination controls were button-only, limiting crawl discoverability for deeper pages.

## Implemented Remediations

1. **Resolved metadata ownership**
   - Removed duplicate route files:
     - `app/layout.js`
     - `app/page.js`
     - `app/listings/[id]/page.js`

2. **Added crawl controls**
   - Added `app/robots.ts` with:
     - allow `/`
     - disallow `/internal/` and `/api/internal/`
     - sitemap references for root and listing sitemaps

3. **Added sitemap coverage**
   - Added `app/sitemap.ts` for core + curated landing URLs.
   - Added `app/listings/sitemap.ts` for active listing detail URLs from `public_listings`.

4. **Implemented metadata architecture**
   - Added root metadata in `app/layout.tsx`:
     - canonical base URL
     - title template
     - OpenGraph/Twitter defaults
     - search engine verification support via env vars
   - Added `generateMetadata` to:
     - `app/listings/page.tsx` (curated index/noindex strategy)
     - `app/listings/[id]/page.tsx` (canonical listing metadata)

5. **Implemented structured data**
   - Added `ItemList` JSON-LD on `/listings`.
   - Added `Product` + `Offer` + `BreadcrumbList` JSON-LD on `/listings/[id]`.

6. **Improved listing discoverability**
   - Added semantic listing-page heading + intro + curated category links.
   - Updated pagination controls to crawlable links with stable query-URL navigation.

7. **Internal login index suppression**
   - Added `app/internal/login/layout.tsx` metadata to enforce `noindex, nofollow`.

## Canonical and Indexing Policy

- Canonical host: `https://fullhangar.com`
- Listing detail canonical: `/listings/[id]` (no transient query params in canonical URL)
- Listings index:
  - index curated landing pages (`category`, `make`, selected deal tiers)
  - noindex long-tail/combinatorial filter pages

## Remaining Operational Tasks (Non-code)

1. Add production env vars for verification tags:
   - `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`
   - `NEXT_PUBLIC_BING_SITE_VERIFICATION`
2. Submit:
   - `https://fullhangar.com/sitemap.xml`
   - `https://fullhangar.com/listings/sitemap.xml`
3. Validate sample listing pages in Rich Results Test + Search Console URL Inspection.
