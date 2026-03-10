// content_script.js
// Full Hangar Harvester - Controller.com DOM extractor
// Uses CONFIRMED selectors from controller_scraper.py

'use strict';

const BRIDGE_URL = 'http://localhost:8765/ingest';
const BRIDGE_PING = 'http://localhost:8765/ping';

// --- UTILITY FUNCTIONS -------------------------------------------------------

function parsePrice(text) {
  if (!text) return null;
  if (/call|offer|request/i.test(text)) return null;
  const digits = text.replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : null;
}

function parseHours(text) {
  if (!text) return null;
  const match = text.match(/[\d,]{2,7}/);
  return match ? parseInt(match[0].replace(/,/g, ''), 10) : null;
}

function extractSourceId(url) {
  // Extract numeric listing ID from Controller.com URLs
  // /listing/1964-Cessna-172-5038176592 -> 5038176592
  const segments = new URL(url).pathname.replace(/\/$/, '').split('/');
  for (let i = segments.length - 1; i >= 0; i--) {
    if (/^\d{6,10}$/.test(segments[i])) return segments[i];
  }
  const match = url.match(/(\d+)$/);
  return match ? match[1] : null;
}

function extractNNumber(text) {
  if (!text) return null;
  const match = text.match(/\b(N\d{1,5}[A-Z]{0,2})\b/i);
  return match ? match[1].toUpperCase() : null;
}

function splitCityState(text) {
  if (!text) return [null, null];
  const parts = text.split(',').map((s) => s.trim());
  if (parts.length >= 2) return [parts[0] || null, parts[1].toUpperCase().slice(0, 2) || null];
  return [text.trim(), null];
}

function isProbableListingImage(url) {
  if (!url) return false;
  const low = url.toLowerCase();
  const blocked = [
    '/cdn/images/flags/',
    'flag.png',
    'logo.svg',
    'privacyoptions',
    'doubleclick.net',
    'googletagmanager',
    'currency-icon',
  ];
  if (blocked.some((b) => low.includes(b))) return false;
  if ((low.includes('logo') || low.includes('icon') || low.includes('sprite')) && !low.includes('img.axd')) return false;
  if (low.includes('img.axd')) return true;
  return /\.(jpe?g|png|webp|gif)(\?|$)/.test(low);
}

// --- SEARCH/LIST PAGE EXTRACTION --------------------------------------------

function extractListingCards() {
  // Confirmed selectors from controller_scraper.py
  let cards = document.querySelectorAll('div.list-listing-card-wrapper');
  if (!cards.length) cards = document.querySelectorAll('article.search-card');
  if (!cards.length) return [];

  const listings = [];

  cards.forEach((card) => {
    try {
      // Source ID and URL
      const dataEl = card.querySelector('div[data-listing-id]');
      let sourceId = dataEl ? dataEl.getAttribute('data-listing-id').trim() : null;

      const linkEl =
        card.querySelector("a.list-listing-title-link[href*='/listing/']") || card.querySelector("a[href*='/listing/']");
      if (!linkEl) return;
      const href = linkEl.getAttribute('href') || '';
      if (!href) return;
      const listingUrl = href.startsWith('http') ? href : 'https://www.controller.com' + href;
      if (!listingUrl.startsWith('https://www.controller.com')) return;
      if (!sourceId) sourceId = extractSourceId(listingUrl);

      // Title -> year, make, model
      const titleText = (linkEl.getAttribute('title') || linkEl.textContent || '').trim();
      let year = null;
      let make = null;
      let model = null;
      const yearMatch = titleText.match(/\b(19|20)\d{2}\b/);
      if (yearMatch) {
        year = parseInt(yearMatch[0], 10);
        const afterYear = titleText.slice(titleText.indexOf(yearMatch[0]) + 4).trim();
        const parts = afterYear.split(/\s+/);
        if (parts.length) make = parts[0];
        if (parts.length > 1) model = parts.slice(1).join(' ');
      }

      // Price
      const priceEl =
        card.querySelector('div.price-contain') || card.querySelector('span.price') || card.querySelector('.price.main');
      const priceText = priceEl ? priceEl.textContent.trim() : '';
      const price = parsePrice(priceText);

      // N-Number
      const stockEl = card.querySelector('div.stock-number, span.registration, div.specs-container');
      const stockText = stockEl ? stockEl.textContent.trim() : '';
      const nNumber = extractNNumber(stockText);

      // TT and serial from specs container
      const specsEl = card.querySelector('div.specs-container');
      const specsText = specsEl ? specsEl.textContent : '';
      const ttMatch = specsText.match(/(?:Total\s+Time|TTAF|TT)[:\s]*([\d,]+)/i);
      const totalTime = ttMatch ? parseInt(ttMatch[1].replace(/,/g, ''), 10) : null;
      const snMatch = specsText.match(/(?:S\/N|Serial(?:\s+Number)?)[:\s#]*([A-Z0-9\-]{3,20})/i);
      const serialNumber = snMatch ? snMatch[1] : null;

      // Location
      let locationText = '';
      const locNodes = card.querySelectorAll('span.location-span, div.listing-location, div.location, [class*="location"]');
      locNodes.forEach((node) => {
        const t = node.textContent.trim();
        if (t && t.toLowerCase() !== 'location' && (t.includes(',') || /\b[A-Z]{2}\b$/.test(t))) {
          if (!locationText) locationText = t.replace(/^Location\s*:\s*/i, '').trim();
        }
      });
      const [locationCity, locationState] = splitCityState(locationText);

      // Primary image
      let primaryImageUrl = null;
      const imgEl = card.querySelector('div.listing-image img, img');
      if (imgEl) {
        const src = (imgEl.getAttribute('data-src') || imgEl.getAttribute('src') || '').trim();
        const abs = src.startsWith('http') ? src : 'https://www.controller.com' + src;
        if (isProbableListingImage(abs)) primaryImageUrl = abs;
      }

      // Description
      const descEl = card.querySelector('.listing-content, .description-wrapper');
      const description = descEl ? descEl.textContent.trim() : null;

      listings.push({
        source_site: 'controller',
        source_id: sourceId,
        source_listing_id: sourceId,
        url: listingUrl,
        make: make || null,
        model: model || null,
        year,
        price_asking: price,
        asking_price: price,
        n_number: nNumber,
        serial_number: serialNumber,
        location_raw: locationText || null,
        location_city: locationCity,
        location_state: locationState,
        state: locationState,
        total_time_airframe: totalTime,
        primary_image_url: primaryImageUrl,
        description: description || null,
        aircraft_type: 'single_engine_piston', // default; overridden by bridge if known
        _extraction_source: 'list_card',
        _extracted_at: new Date().toISOString(),
        _page_url: window.location.href,
      });
    } catch (err) {
      console.warn('[FullHangar] Card parse error:', err);
    }
  });

  return listings;
}

// --- DETAIL PAGE EXTRACTION --------------------------------------------------

function extractDetailPage() {
  // Only run on detail pages
  if (!window.location.pathname.includes('/listing/')) return null;

  const sourceId = extractSourceId(window.location.href);
  if (!sourceId) return null;

  const detail = {
    source_site: 'controller',
    source_id: sourceId,
    source_listing_id: sourceId,
    url: window.location.href,
    _extraction_source: 'detail_page',
    _extracted_at: new Date().toISOString(),
  };

  // Price: confirmed selector
  const priceEl = document.querySelector('strong.listing-prices_retail-price');
  if (priceEl) {
    const priceText = priceEl.textContent.trim();
    if (!/call/i.test(priceText)) {
      const p = parsePrice(priceText);
      if (p) {
        detail.price_asking = p;
        detail.asking_price = p;
      }
    }
  }

  // Location: confirmed selector (double underscore)
  const locEl = document.querySelector('div.detail__machine-location');
  if (locEl) {
    const locText = locEl.textContent.replace(/Aircraft\s*Location\s*:/i, '').trim();
    if (locText) {
      detail.location_raw = locText;
      const [city, state] = splitCityState(locText);
      if (city) detail.location_city = city;
      if (state) {
        detail.location_state = state;
        detail.state = state;
      }
    }
  }

  // Specs: confirmed div.detail__specs-label + next sibling div
  const specs = {};
  document.querySelectorAll('div.detail__specs-label').forEach((labelEl) => {
    const label = labelEl.textContent.trim().toLowerCase().replace(/:$/, '');
    const valueEl = labelEl.nextElementSibling;
    if (valueEl) {
      const value = valueEl.textContent.trim();
      if (label && value) specs[label] = value;
    }
  });

  // Parse confirmed spec keys
  if (specs.manufacturer) detail.make = specs.manufacturer.trim();
  if (specs.model) detail.model = specs.model.trim();
  if (specs.year) {
    const y = parseInt(specs.year, 10);
    if (y > 1900) detail.year = y;
  }
  if (specs['serial number']) detail.serial_number = specs['serial number'].trim();
  if (specs['registration #']) {
    const m = specs['registration #'].match(/([A-Z]\d{1,5}[A-Z]{0,2})/i);
    if (m) detail.n_number = m[1].toUpperCase();
  }
  if (specs.description) detail.description = specs.description.trim();

  // Airframe
  if (specs['total time']) {
    const h = parseHours(specs['total time']);
    if (h) detail.total_time_airframe = h;
  }
  if (specs['number of seats']) {
    const m = specs['number of seats'].match(/\d+/);
    if (m) detail.num_seats = parseInt(m[0], 10);
  }

  // Engine
  const engineModelKeys = ['engine 1 make/model', 'engine make/model', 'engine model', 'powerplant'];
  for (const k of engineModelKeys) {
    if (specs[k]) {
      detail.engine_model = specs[k].trim();
      break;
    }
  }
  const engineTimeKeys = ['engine 1 time', 'engine time', 'smoh', 'time since overhaul'];
  for (const k of engineTimeKeys) {
    if (specs[k]) {
      const h = parseHours(specs[k]);
      if (h) {
        detail.engine_time_since_overhaul = h;
        detail.time_since_overhaul = h;
        break;
      }
    }
  }
  if (specs['engine tbo']) {
    const h = parseHours(specs['engine tbo']);
    if (h) detail.engine_tbo_hours = h;
  }

  // Propeller
  const propTimeKeys = ['prop 1 time', 'prop time', 'propeller time', 'spoh', 'prop smoh', 'time since prop overhaul'];
  for (const k of propTimeKeys) {
    if (specs[k]) {
      const h = parseHours(specs[k]);
      if (h) {
        detail.time_since_prop_overhaul = h;
        break;
      }
    }
  }

  // Avionics
  const avionicsKeys = ['flight deck manufacturer/model', 'avionics/radios', 'avionics'];
  for (const k of avionicsKeys) {
    if (specs[k]) {
      detail.avionics_description = specs[k].trim();
      break;
    }
  }

  // Airworthy
  if (specs.airworthy) detail.is_airworthy = specs.airworthy.toLowerCase() === 'yes';

  // Gallery images
  const galleryUrls = [];
  const seen = new Set();
  document.querySelectorAll('section.photos img, .photos img, .gallery img').forEach((img) => {
    const src = (img.getAttribute('data-src') || img.getAttribute('src') || '').trim();
    if (!src) return;
    const abs = src.startsWith('http') ? src : 'https://www.controller.com' + src;
    if (isProbableListingImage(abs) && !seen.has(abs)) {
      seen.add(abs);
      galleryUrls.push(abs);
    }
  });
  if (galleryUrls.length) {
    detail.image_urls = galleryUrls;
    detail.primary_image_url = galleryUrls[0];
  }

  // Seller info
  const sellerEl = document.querySelector('.dealer-contact__branch-name strong, .dealer-contact__branch-name');
  if (sellerEl) {
    detail.seller_name = sellerEl.textContent.trim();
    detail.seller_type = 'dealer';
  }

  // Store all raw specs for debugging
  detail._raw_specs = specs;

  return detail;
}

// --- MESSAGING + BRIDGE ------------------------------------------------------

async function pingBridge() {
  try {
    const resp = await fetch(BRIDGE_PING, { method: 'GET', signal: AbortSignal.timeout(2000) });
    return resp.ok;
  } catch {
    return false;
  }
}

async function postToBridge(payload) {
  try {
    const resp = await fetch(BRIDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    return { ok: resp.ok, status: resp.status };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// --- MESSAGE HANDLER (from background.js) -----------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.action === 'EXTRACT_CARDS') {
      const cards = extractListingCards();
      sendResponse({ success: true, count: cards.length, listings: cards });
    } else if (message.action === 'EXTRACT_DETAIL') {
      const detail = extractDetailPage();
      sendResponse({ success: !!detail, detail });
    } else if (message.action === 'PING_BRIDGE') {
      const alive = await pingBridge();
      sendResponse({ alive });
    } else if (message.action === 'PUSH_TO_BRIDGE') {
      // message.payload is an array of listing objects
      const result = await postToBridge(message.payload);
      sendResponse(result);
    } else if (message.action === 'GET_CURRENT_URL') {
      sendResponse({ url: window.location.href });
    }
  })();
  return true; // keeps message channel open for async
});

// Auto-announce to background when page loads on Controller
if (window.location.hostname === 'www.controller.com') {
  chrome.runtime
    .sendMessage({
      action: 'PAGE_LOADED',
      url: window.location.href,
      isDetailPage:
        window.location.pathname.includes('/listing/for-sale/') || /\/listing\/\d/.test(window.location.pathname),
      isListPage:
        window.location.pathname.includes('/listings/') || window.location.pathname.includes('/search'),
    })
    .catch(() => {
      // background may not be ready - ignore
    });
}
