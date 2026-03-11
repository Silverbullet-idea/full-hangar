# Trade-A-Plane Selector and Anti-Bot Audit

Date: 2026-03-08
Environment: local workstation + project venv + browser automation

## 1) Bot Protection Status (Live Audit)

- Plain `requests.get` to category/search URLs returns HTTP `403` with challenge HTML.
- Challenge indicators in response:
  - `Please enable JS and disable any ad blocker`
  - script reference to `https://ct.captcha-delivery.com/c.js`
  - payload containing `geo.captcha-delivery.com`
- JS-enabled Playwright from this environment still receives challenge pages and no listing DOM.
- Conclusion: TAP requires browser-session access that has passed challenge checks. Requests-only scraping is not sufficient in current environment.

### Session refresh note

To refresh the TAP session: open Chrome -> navigate to trade-a-plane.com -> browse normally until fully loaded -> export cookies using EditThisCookie -> save as scraper/tap_cookies.json

## 2) robots.txt

- `https://www.trade-a-plane.com/robots.txt` returned the same anti-bot challenge response from this environment.
- Live robots policy could not be read directly due protection wall.
- Action for operator before production runs: open robots.txt in a challenge-cleared browser session and confirm scraping paths are not explicitly disallowed.

## 3) Category URL Findings

Live category index navigation was challenge-blocked, so category URLs below are compiled from indexed TAP URLs plus known in-site patterns. Confidence is noted per row.

| Category | URL pattern | Confidence | Notes |
|---|---|---|---|
| Single Engine Piston | `https://www.trade-a-plane.com/search?category_level1=Single+Engine+Piston&s-type=aircraft` | High | Most frequently indexed canonical pattern. |
| Multi-Engine Piston | `https://www.trade-a-plane.com/search?category_level1=Multi+Engine+Piston&s-type=aircraft` | High | Indexed category listing pages observed. |
| Turboprop | `https://www.trade-a-plane.com/search?category_level1=Turboprop&s-type=aircraft` | High | Indexed pages observed. |
| Jet | `https://www.trade-a-plane.com/search?category_level1=Jets&s-type=aircraft` | High | Indexed pages observed. |
| Helicopter | `https://www.trade-a-plane.com/search?category_level1=Turbine+Helicopters&s-type=aircraft` and `...category_level1=Piston+Helicopters...` | Medium | Appears split by piston/turbine. |
| Amphibious / Float | No stable top-level category confirmed | Low | Likely represented by make/model filters (example: Lake) or non-top-level filters. |
| Light Sport Aircraft | `https://www.trade-a-plane.com/search?category_level1=Single+Engine+Piston&s-type=aircraft&light_sport=t` | Medium | Exposed as filter flag rather than standalone top-level category. |
| Warbird / Vintage | No canonical top-level URL confirmed | Low | Listings appear within piston/make filters. |
| Experimental / Homebuilt | No canonical top-level URL confirmed | Low | Listings appear within make/model or filtered paths. |
| Agricultural | No canonical top-level URL confirmed | Low | Listings often under Turboprop + make (for example Air Tractor). |

## 4) Pagination Findings

- Indexed TAP URLs show pagination with:
  - `s-page=<N>`
  - `s-page_size=<N>`
- Fallback patterns observed in older links include `page=<N>`.
- Recommended pagination strategy:
  1. Start with `s-page=1`.
  2. Increment `s-page` until no cards are parsed.
  3. Also stop if page repeats source IDs with no net new listings.

## 5) Provisional Selector Map (Needs Live Revalidation)

Because live listing DOM is challenge-blocked, selectors below are provisional from prior TAP parser structure and archived URL patterns.

### Result cards

- Card container:
  - `div.result_listing` (primary)
  - `div[class*='result_listing']`
  - `div.result-listing`
  - `div.result-listing-holder`
  - Confidence: Low
- Listing URL:
  - `a.log_listing_click[href]`
  - `a.result_listing_click[href]`
  - `a.listing_click[href]`
  - `a[href*='listing_id=']`
  - Confidence: Low/Medium
- Title:
  - `a#title`
  - `.result-title`
  - `.listing-title`
  - Confidence: Low
- Asking price:
  - `.price`
  - `.listing-price`
  - `.result-price`
  - `.sale_price`
  - Confidence: Low
- Location:
  - `.location`
  - `.listing-location`
  - `.city-state`
  - `.address`
  - Confidence: Low
- Thumbnail:
  - card `img[src]` fallback
  - Confidence: Low
- Days on market:
  - no confirmed selector
  - Confidence: Unknown
- Total count:
  - no confirmed selector
  - Confidence: Unknown

### Detail page

- Description block:
  - `.description`
  - `#description`
  - `.listing-description`
  - `.remarks`
  - Confidence: Low
- Specs table candidates:
  - `table tr` with `th/td`
  - `dt/dd`
  - label-value blocks under `.spec-label`/`.label`
  - Confidence: Low
- Sectioned detail blocks:
  - `.btm-detail-box` with section header `h3`
  - Confidence: Low
- Seller name:
  - `#seller-info-area .sellerName [itemprop='name']`
  - `#seller-info-area .sellerName`
  - `.seller`, `.dealer`, `.contact-name`, `[itemprop='seller']`
  - Confidence: Low
- Seller phone:
  - no confirmed selector
  - Confidence: Unknown
- Images:
  - `img[src], img[data-src]` then filter out logos/placeholders
  - Confidence: Low

## 6) Listing ID / Source ID Convention

- TAP listing ID is most reliably present as query param `listing_id` on detail URLs.
- Source ID convention:
  - `source = "trade_a_plane"`
  - `source_id = "tap_<listing_id>"`

## 7) Pre-Build Recommendations

1. Default scraper mode should be Playwright-first with optional cookie file loading (`scraper/tap_cookies.json`) for challenge-cleared sessions.
2. Keep requests mode as fallback probe only.
3. Add clear operator logs when challenge is detected and stop after repeated blocks.
4. Re-run this selector audit after obtaining a valid TAP browser session to promote low-confidence selectors to stable selectors.
