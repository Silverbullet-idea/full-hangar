# Search Console and Webmaster Rollout

## 1) Production Environment Variables

Set these in your hosting platform for the web app:

- `NEXT_PUBLIC_SITE_URL=https://fullhangar.com`
- `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=<google_verification_token>`
- `NEXT_PUBLIC_BING_SITE_VERIFICATION=<bing_msvalidate_token>`

## 2) Verify Ownership

### Google Search Console

1. Add property: `https://fullhangar.com`
2. Use HTML tag verification method.
3. Confirm the meta tag value matches `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`.
4. Re-deploy if needed and click Verify.

### Bing Webmaster Tools

1. Add site: `https://fullhangar.com`
2. Use meta tag verification method.
3. Confirm token matches `NEXT_PUBLIC_BING_SITE_VERIFICATION`.
4. Re-deploy if needed and click Verify.

## 3) Submit Sitemaps

Submit both:

- `https://fullhangar.com/sitemap.xml`
- `https://fullhangar.com/listings/sitemap.xml`

## 4) Validation Checklist

For a representative sample of listing detail URLs:

1. Run [Rich Results Test](https://search.google.com/test/rich-results).
2. Confirm JSON-LD parses for:
   - `Product`
   - `Offer` (when price exists)
   - `BreadcrumbList`
3. Use URL Inspection in Google Search Console and request indexing.
4. Repeat URL inspection in Bing Webmaster Tools.

## 5) Monitoring Cadence (Weekly)

Track these KPIs:

- Indexed pages (overall + `/listings/[id]`)
- Impressions and clicks for curated landing pages
- CTR and average position by landing URL
- Crawl stats and discovered URLs
- Excluded pages due to `noindex`

## 6) Expected Outcomes

- Better listing-detail discovery and indexing consistency
- Reduced duplicate URL indexation from query-parameter variants
- Higher quality snippets from structured data and route metadata
