'use strict';

const BASE_URL = 'https://www.globalair.com';

function parseIntSafe(value) {
  const digits = String(value || '').replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : null;
}

function parseTitle(title) {
  const clean = String(title || '').trim();
  const yearMatch = clean.match(/^(\d{4})\s+(.+)$/);
  if (!yearMatch) return { year: null, make: null, model: null };
  const year = parseInt(yearMatch[1], 10);
  const rest = yearMatch[2].trim();
  const parts = rest.split(/\s+/);
  return {
    year,
    make: parts[0] || null,
    model: parts.length > 1 ? parts.slice(1).join(' ') : null,
  };
}

function splitLocation(location) {
  const text = String(location || '').replace(/\s+/g, ' ').trim();
  if (!text) return [null, null];
  if (/.+,\s*[A-Z]{2}$/.test(text)) {
    const idx = text.lastIndexOf(',');
    return [text.slice(0, idx).trim(), text.slice(idx + 1).trim().toUpperCase()];
  }
  const stateMatch = text.match(/\b([A-Z]{2})\b/);
  return [text, stateMatch ? stateMatch[1] : null];
}

function extractSourceIdFromUrl(url) {
  try {
    const path = new URL(url).pathname;
    const m = path.match(/\/(\d+)(?:\/)?$/);
    return m ? `ga_${m[1]}` : null;
  } catch {
    return null;
  }
}

function getAbsoluteUrl(rawUrl) {
  const u = String(rawUrl || '').trim();
  if (!u) return null;
  return u.startsWith('http') ? u : `${BASE_URL}${u}`;
}

function getIconField(card, iconName) {
  const img = card.querySelector(`img[src*="${iconName}"]`);
  if (!img || !img.parentElement) return null;
  const text = (img.parentElement.textContent || '').replace(/\s+/g, ' ').trim();
  return text || null;
}

async function expandAllLoadMore() {
  let clicks = 0;
  while (clicks < 60) {
    const btn = document.querySelector('button#loadPageX');
    if (!btn) break;
    const hidden = btn.offsetParent === null || btn.disabled;
    if (hidden) break;
    btn.click();
    clicks += 1;
    await new Promise((resolve) => setTimeout(resolve, 1500 + Math.random() * 1500));
  }
  return clicks;
}

function extractListingCardsSync() {
  const cards = Array.from(document.querySelectorAll('div.list-item.result-container, div.result-container.list-item'));
  if (!cards.length) return [];

  const listings = [];
  for (const card of cards) {
    try {
      const titleLink = card.querySelector('a.result-title, a[href*="/listing-detail/"]');
      if (!titleLink) continue;
      const listingUrl = getAbsoluteUrl(titleLink.getAttribute('href'));
      if (!listingUrl || !listingUrl.startsWith(BASE_URL)) continue;

      const sourceId = extractSourceIdFromUrl(listingUrl);
      if (!sourceId) continue;

      const title = (titleLink.textContent || '').replace(/\s+/g, ' ').trim();
      const parsedTitle = parseTitle(title);

      const year = parseIntSafe(card.getAttribute('data-year')) || parsedTitle.year;
      const price = parseIntSafe(card.getAttribute('data-price'));
      const totalTime = parseIntSafe(card.getAttribute('data-totaltime')) || parseIntSafe(getIconField(card, 'totaltime'));

      const serialNumber = getIconField(card, 'serialnumber');
      const nNumber = getIconField(card, 'registrationnumber');

      const sellerEl = card.querySelector('a[href*="/listings-by-seller/"]');
      const sellerName = sellerEl ? sellerEl.textContent.trim() : null;
      const sellerType = sellerName ? 'dealer' : null;

      const locEl = card.querySelector('div.result-broker-notes, div[class*="broker"]');
      const locationRaw = locEl ? locEl.textContent.replace(/\s+/g, ' ').trim().slice(0, 200) : null;
      const [locationCity, locationState] = splitLocation(locationRaw);

      let primaryImageUrl = null;
      const img = card.querySelector('img.img-fluid, img.aircraft-img, img');
      if (img) {
        const src = img.getAttribute('src') || img.getAttribute('data-src');
        const abs = getAbsoluteUrl(src);
        if (abs && !abs.toLowerCase().endsWith('.svg') && !abs.toLowerCase().includes('coming-soon')) {
          primaryImageUrl = abs;
        }
      }

      listings.push({
        source_site: 'globalair',
        listing_source: 'globalair',
        source_id: sourceId,
        source_listing_id: sourceId,
        url: listingUrl,
        title,
        year,
        make: parsedTitle.make,
        model: parsedTitle.model,
        aircraft_type: 'single_engine_piston',
        price_asking: price,
        asking_price: price,
        n_number: nNumber,
        serial_number: serialNumber,
        total_time_airframe: totalTime,
        seller_name: sellerName,
        seller_type: sellerType,
        location_raw: locationRaw,
        location_city: locationCity,
        location_state: locationState,
        state: locationState,
        primary_image_url: primaryImageUrl,
        image_urls: primaryImageUrl ? [primaryImageUrl] : null,
        description: null,
        description_full: null,
        _extraction_source: 'list_card',
        _extracted_at: new Date().toISOString(),
        _page_url: window.location.href,
      });
    } catch (err) {
      console.warn('[FullHangar][GlobalAir] Card parse error:', err);
    }
  }
  return listings;
}

async function extractListingCards() {
  await expandAllLoadMore();
  return extractListingCardsSync();
}

function extractDetailPage() {
  if (!window.location.pathname.includes('/listing-detail/')) return null;
  const sourceId = extractSourceIdFromUrl(window.location.href);
  if (!sourceId) return null;

  const detail = {
    source_site: 'globalair',
    listing_source: 'globalair',
    source_id: sourceId,
    source_listing_id: sourceId,
    url: window.location.href,
    _extraction_source: 'detail_page',
    _extracted_at: new Date().toISOString(),
  };

  const priceEl = document.querySelector('span#convertedPrice');
  if (priceEl) {
    const price = parseIntSafe(priceEl.textContent || '');
    if (price) {
      detail.price_asking = price;
      detail.asking_price = price;
    }
  }

  const specs = {};
  const rows = Array.from(document.querySelectorAll('div.row'));
  for (const row of rows) {
    const cols = Array.from(row.querySelectorAll(':scope > div.col'));
    if (cols.length !== 2) continue;
    const label = (cols[0].textContent || '').trim().toLowerCase().replace(/:$/, '');
    const value = (cols[1].textContent || '').replace(/\s+/g, ' ').trim();
    if (label && value) specs[label] = value;
  }

  if (specs.year) {
    const y = parseIntSafe(specs.year);
    if (y) detail.year = y;
  }
  if (specs.manufacturer) detail.make = specs.manufacturer;
  if (specs.model) detail.model = specs.model;
  if (specs['serial number']) detail.serial_number = specs['serial number'];
  if (specs.registration) detail.n_number = specs.registration;
  if (specs['total time'] || specs.tt) {
    const ttaf = parseIntSafe(specs['total time'] || specs.tt);
    if (ttaf) detail.total_time_airframe = ttaf;
  }
  if (specs.location) {
    detail.location_raw = specs.location;
    const [city, state] = splitLocation(specs.location);
    detail.location_city = city;
    detail.location_state = state;
    detail.state = state;
  }

  const sectionMap = {
    summary: 'description_full',
    avionics: 'avionics_notes',
    airframe: 'airframe_notes',
    engine: 'engine_notes',
    maintenance: 'maintenance_notes',
    interior: 'interior_notes',
  };
  const sectionEls = Array.from(document.querySelectorAll('div.mobileLHDtl'));
  for (const sectionEl of sectionEls) {
    const heading = sectionEl.querySelector('h4');
    if (!heading) continue;
    const header = heading.textContent.trim().toLowerCase();
    const content = sectionEl.textContent.replace(heading.textContent, '').replace(/\s+/g, ' ').trim();
    if (!content) continue;
    for (const [key, field] of Object.entries(sectionMap)) {
      if (!header.includes(key)) continue;
      if (field === 'description_full') {
        detail.description = content.slice(0, 3500);
        detail.description_full = content.slice(0, 3500);
      } else {
        detail[field] = content.slice(0, 3000);
      }
      break;
    }
  }

  const gallery = [];
  const seen = new Set();
  const imgs = Array.from(document.querySelectorAll('img[src], img[data-src]'));
  for (const img of imgs) {
    const src = img.getAttribute('data-src') || img.getAttribute('src');
    const abs = getAbsoluteUrl(src);
    if (!abs) continue;
    const low = abs.toLowerCase();
    if (low.endsWith('.svg')) continue;
    if (low.includes('logo') || low.includes('icon') || low.includes('sprite') || low.includes('coming-soon')) continue;
    if (seen.has(abs)) continue;
    seen.add(abs);
    gallery.push(abs);
  }
  if (gallery.length) {
    detail.image_urls = gallery.slice(0, 25);
    detail.primary_image_url = gallery[0];
  }

  detail._raw_specs = specs;
  return detail;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.action === 'EXTRACT_CARDS') {
      const cards = await extractListingCards();
      sendResponse({ success: true, count: cards.length, listings: cards });
    } else if (message.action === 'EXTRACT_DETAIL') {
      const detail = extractDetailPage();
      sendResponse({ success: !!detail, detail });
    } else if (message.action === 'GET_CURRENT_URL') {
      sendResponse({ url: window.location.href });
    }
  })();
  return true;
});

if (window.location.hostname === 'www.globalair.com') {
  chrome.runtime
    .sendMessage({
      action: 'PAGE_LOADED',
      url: window.location.href,
      isDetailPage: window.location.pathname.includes('/listing-detail/'),
      isListPage: window.location.pathname.includes('/aircraft-for-sale'),
    })
    .catch(() => {});
}
