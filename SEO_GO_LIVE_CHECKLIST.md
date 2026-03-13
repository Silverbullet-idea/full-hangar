# SEO Go-Live Checklist

## 1) Production Environment Variables

Set these in your production environment and redeploy:

- `NEXT_PUBLIC_SITE_URL=https://full-hangar.com`
- `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=<paste_google_token>`
- `NEXT_PUBLIC_BING_SITE_VERIFICATION=<paste_bing_msvalidate_token>`

Notes:
- `NEXT_PUBLIC_SITE_URL` is used for canonical URLs and sitemap host generation.
- Google/Bing verification values are injected into metadata automatically.

## 2) Verify Public Endpoints After Deploy

Open these URLs and confirm they load:

- `https://full-hangar.com/robots.txt`
- `https://full-hangar.com/sitemap.xml`
- `https://full-hangar.com/listings/sitemap.xml`

Expected:
- `robots.txt` references both sitemap URLs.
- root sitemap contains core + curated landing URLs.
- listings sitemap contains active listing detail URLs.

## 3) Search Console / Webmaster Setup

### Google Search Console

1. Add property: `https://full-hangar.com`
2. Choose HTML tag verification.
3. Confirm token matches `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`.
4. Submit:
   - `https://full-hangar.com/sitemap.xml`
   - `https://full-hangar.com/listings/sitemap.xml`

### Bing Webmaster Tools

1. Add site: `https://full-hangar.com`
2. Choose meta tag verification.
3. Confirm token matches `NEXT_PUBLIC_BING_SITE_VERIFICATION`.
4. Submit the same two sitemap URLs.

## 4) Page-Level Validation (Spot Check)

Validate at least:

- `/`
- `/listings`
- 3-5 representative `/listings/[id]` pages

For each page, confirm:
- canonical URL is correct
- title + description are present and relevant
- no accidental `noindex` on public pages
- JSON-LD is present and parseable (`ItemList` on listings, `Product/Offer/BreadcrumbList` on detail)

Tools:
- Google Rich Results Test
- Google URL Inspection
- Bing URL Inspection

## 5) Indexing Policy Verification

Confirm behavior matches strategy:

- curated landing pages indexable:
  - examples: `?category=single`, `?category=jet`, `?make=Cessna`, `?dealTier=TOP_DEALS`
- long-tail filter combinations are `noindex,follow`
- listing detail canonical strips transient query params

## 6) Weekly KPI Dashboard (First 6 Weeks)

Track weekly:

- indexed page count
- listing-detail indexed coverage
- impressions/clicks/CTR for curated landing pages
- average position for core listing queries
- crawl/discovery trends and excluded pages

Target trend:
- increasing indexed listing detail pages
- growing impressions on curated landing pages
- low duplicate or alternate-page canonical warnings
