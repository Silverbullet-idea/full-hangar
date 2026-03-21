'use strict';

const BASE = 'https://www.trade-a-plane.com';

function parseIntSafe(value) {
  const m = String(value || '').match(/[\d,]+/);
  if (!m) return null;
  const num = parseInt(String(m[0]).replace(/,/g, ''), 10);
  return Number.isFinite(num) ? num : null;
}

function parseHours(value) {
  const m = String(value || '').match(/(\d[\d,]*(?:\.\d+)?)/);
  if (!m) return null;
  const num = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(num) ? Math.round(num) : null;
}

function parsePriceFromText(value) {
  const text = String(value || '');
  if (!text) return null;
  if (/call\s+for\s+price|contact\s+for\s+price/i.test(text)) return null;
  const dollar = text.match(/\$\s*([\d,]+)/);
  if (dollar) return parseIntSafe(dollar[1]);
  return parseIntSafe(text);
}

function abs(url) {
  const v = String(url || '').trim();
  if (!v) return null;
  return v.startsWith('http') ? v : `${BASE}${v}`;
}

function sourceIdFromUrl(url) {
  const value = String(url || '');
  const qp = value.match(/[?&]listing_id=(\d+)/i);
  if (qp) return `tap_${qp[1]}`;
  const tail = value.match(/\/(\d{4,12})(?:\/|$)/);
  if (tail) return `tap_${tail[1]}`;
  return null;
}

function splitLoc(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return [null, null];
  const m = text.match(/^(.+?),\s*([A-Z]{2})\b/i);
  if (m) return [m[1].trim(), m[2].toUpperCase()];
  return [text, null];
}

function extractRegistrationToken(value) {
  const text = String(value || '');
  if (!text.trim()) return null;
  const labeled = text.match(/\b(?:registration|tail(?:\s*number)?|n[\s\-]*number|reg)\b\s*[#:\-]?\s*([A-Z0-9\-]{2,12})\b/i);
  if (labeled && labeled[1]) return labeled[1].toUpperCase();
  const us = text.match(/\bN[0-9]{1,5}[A-HJ-NP-Z]{0,2}\b/i);
  if (us && us[0]) return us[0].toUpperCase();
  return null;
}

function challengeSignals() {
  const text = String((document.body && document.body.innerText) || '').toLowerCase();
  const title = String(document.title || '').toLowerCase();
  const html = String(document.documentElement?.innerHTML || '').toLowerCase();
  const strongMarkers = [
    'verify you are human',
    'checking your browser',
    'attention required',
    'captcha-delivery',
    '/cdn-cgi/challenge-platform',
    'cf-chl',
    'access denied',
    'please enable js and disable any ad blocker',
  ];
  const weakMarkers = ['captcha', 'cloudflare', 'security verification', 'just a moment'];
  const strongMatched = strongMarkers.filter((m) => text.includes(m) || title.includes(m) || html.includes(m));
  const weakMatched = weakMarkers.filter((m) => text.includes(m) || title.includes(m) || html.includes(m));

  // TAP pages can include challenge-related script text even when listings are visible.
  // Prefer real page-shape signals to avoid false positives on normal result/detail pages.
  const listingSignals =
    document.querySelectorAll('div.result_listing, div[class*="result_listing"], a.log_listing_click[href]').length > 0 ||
    /for sale|used\s*&\s*new|search results/i.test(String(document.title || '')) ||
    /featured listings|general listings|showing/i.test(String(document.body?.innerText || ''));
  const detailSignals =
    document.querySelectorAll('.btm-detail-box, #info-list-seller, #general_specs, #additional_classifications, input#listing_id').length > 0 ||
    /detailed description|engines\s*\/\s*mods\s*\/\s*prop|avionics/i.test(String(document.body?.innerText || ''));
  const hasNormalPageSignals = listingSignals || detailSignals;

  const matched = [...strongMatched, ...weakMatched];
  const challengeDetected = strongMatched.length > 0 || (weakMatched.length > 0 && !hasNormalPageSignals);
  return {
    challengeDetected,
    indicators: matched,
    currentUrl: window.location.href,
    pageTitle: document.title || '',
  };
}

async function humanScroll() {
  const steps = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < steps; i += 1) {
    window.scrollBy({ top: 200 + Math.floor(Math.random() * 600), behavior: 'smooth' });
    await new Promise((resolve) => setTimeout(resolve, 250 + Math.floor(Math.random() * 650)));
  }
}

function textFrom(selector) {
  const raw = document.querySelector(selector)?.textContent || '';
  const trimmed = String(raw).replace(/\s+/g, ' ').trim();
  return trimmed || null;
}

function parseListingsTotals() {
  const blob = String((document.body && document.body.innerText) || '').replace(/\s+/g, ' ').trim();
  const totalMatch = blob.match(/of\s+([\d,]+)\s+results?/i);
  const rangeMatch = blob.match(/([\d,]+)\s*-\s*([\d,]+)\s*of\s*[\d,]+\s*results?/i);
  return {
    totalListings: totalMatch ? parseInt(totalMatch[1].replace(/,/g, ''), 10) : 0,
    rangeStart: rangeMatch ? parseInt(rangeMatch[1].replace(/,/g, ''), 10) : 0,
    rangeEnd: rangeMatch ? parseInt(rangeMatch[2].replace(/,/g, ''), 10) : 0,
  };
}

function parseCategoryType(categoryValue) {
  const value = String(categoryValue || '').toLowerCase();
  if (value.includes('single engine piston')) return 'piston_single';
  if (value.includes('multi engine piston')) return 'piston_multi';
  if (value.includes('turboprop')) return 'turboprop';
  if (value.includes('jet')) return 'jet';
  if (value.includes('helicopter') || value.includes('rotor')) return 'rotorcraft';
  return null;
}

function extractCardsNow() {
  const challenge = challengeSignals();
  if (challenge.challengeDetected) return { challengeDetected: true, listings: [], meta: { pageTitle: challenge.pageTitle || '' } };
  const totals = parseListingsTotals();
  const cards = Array.from(document.querySelectorAll('div.result_listing, div[class*="result_listing"], div.result-listing'));
  const anchors = Array.from(document.querySelectorAll("a.log_listing_click[href], a[href*='listing_id='][href]"));
  const rows = [];
  const seen = new Set();

  const candidates = cards.length
    ? cards.map((card) => ({ card, a: card.querySelector("a.log_listing_click[href], a[href*='listing_id='][href]") })).filter((x) => !!x.a)
    : anchors.map((a) => ({ card: a.closest('div.result_listing, article, li, div') || a.parentElement, a }));

  for (const candidate of candidates) {
    const card = candidate.card;
    const a = candidate.a;
    if (!a) continue;
    const url = abs(a.getAttribute('href'));
    if (!url) continue;
    const sid = sourceIdFromUrl(url);
    if (!sid || seen.has(sid)) continue;
    seen.add(sid);

    const titleEl = card?.querySelector('a#title, .result-title, .listing-title, h2, h3, h4');
    const title = String(titleEl?.textContent || a.textContent || '').replace(/\s+/g, ' ').trim();
    const yearMatch = title.match(/\b(19|20)\d{2}\b/);
    const cardText = String(card?.textContent || '').replace(/\s+/g, ' ').trim();
    const price = parsePriceFromText(card?.querySelector('.price, .listing-price, .result-price, .sale_price')?.textContent || cardText);
    const ttMatch = cardText.match(/\bTT\b[:\s]*([\d,]+(?:\.\d+)?)/i);
    const totalTime = ttMatch ? parseHours(ttMatch[1]) : null;
    const locationRaw = card?.querySelector('.address, .location, .listing-location, [itemprop="address"]')?.textContent?.trim() || null;
    const [locationCity, locationState] = splitLoc(locationRaw);
    const img = card?.querySelector('img');
    const primaryImageUrl = abs(img?.getAttribute('src') || img?.getAttribute('data-src'));
    const categoryValue = card?.getAttribute('data-cat') || null;

    rows.push({
      source_site: 'trade_a_plane',
      listing_source: 'trade_a_plane',
      source_id: sid,
      source_listing_id: sid,
      url,
      title: title || null,
      year: yearMatch ? parseInt(yearMatch[0], 10) : null,
      price_asking: price,
      asking_price: price,
      total_time_airframe: totalTime,
      location_raw: locationRaw,
      location_city: locationCity,
      location_state: locationState,
      state: locationState,
      registration_raw: extractRegistrationToken(cardText),
      primary_image_url: primaryImageUrl,
      image_urls: primaryImageUrl ? [primaryImageUrl] : null,
      tap_category_level1: categoryValue,
      aircraft_type: parseCategoryType(categoryValue),
      _page_url: window.location.href,
      _extracted_at: new Date().toISOString(),
    });
  }

  return {
    challengeDetected: false,
    listings: rows,
    meta: {
      pageTitle: document.title || '',
      selectorUsed: cards.length ? 'result_cards' : 'listing_anchors',
      candidateAnchors: anchors.length,
      parsedRows: rows.length,
      wrapperCards: cards.length,
      totalListings: totals.totalListings || rows.length,
      rangeStart: totals.rangeStart || (rows.length ? 1 : 0),
      rangeEnd: totals.rangeEnd || rows.length,
    },
  };
}

function extractSectionMap() {
  const sections = {};
  const boxes = Array.from(document.querySelectorAll('.btm-detail-box'));
  for (const box of boxes) {
    const heading = String(box.querySelector('h3')?.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!heading) continue;
    const text = String(box.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    sections[heading] = text;
  }
  return sections;
}

function extractLabeledValues() {
  const out = {};
  const nodes = Array.from(document.querySelectorAll('#info-list-seller li, #general_specs p, #additional_classifications p'));
  for (const node of nodes) {
    const labelEl = node.querySelector('label');
    if (!labelEl) continue;
    const key = String(labelEl.textContent || '').replace(/\s+/g, ' ').trim().replace(/:\s*$/, '').toLowerCase();
    let value = String(node.textContent || '').replace(/\s+/g, ' ').trim();
    const labelText = String(labelEl.textContent || '').replace(/\s+/g, ' ').trim();
    if (value.toLowerCase().startsWith(labelText.toLowerCase())) {
      value = value.slice(labelText.length).trim().replace(/^[:\-\s]+/, '');
    }
    if (key && value && !(key in out)) out[key] = value;
  }
  return out;
}

function extractDetail(listing) {
  const challenge = challengeSignals();
  if (challenge.challengeDetected) return { challengeDetected: true, listing: null };
  const payload = { ...(listing || {}) };
  const h1 = textFrom('h1');
  if (h1) payload.title = h1;

  const priceText = textFrom('.price, .listing-price, .ask-price');
  const price = parsePriceFromText(priceText);
  if (price) {
    payload.price_asking = price;
    payload.asking_price = price;
  }

  const sections = extractSectionMap();
  const labels = extractLabeledValues();
  if (sections['detailed description']) {
    payload.description_full = sections['detailed description'];
    if (!payload.description) payload.description = sections['detailed description'];
  }
  if (sections['avionics / equipment'] && !payload.avionics_description) payload.avionics_description = sections['avionics / equipment'];
  if (!payload.description_full) {
    const desc = textFrom('#detailed_desc pre, .description, #description');
    if (desc) payload.description_full = desc;
  }

  const locationRaw = labels['location'] || textFrom('[itemprop="address"], .address, .location');
  if (locationRaw) {
    const [city, state] = splitLoc(locationRaw);
    payload.location_raw = locationRaw;
    payload.location_city = city;
    payload.location_state = state;
    payload.state = state;
  }

  const serial = labels['serial #'] || labels['serial number'] || labels['serial'];
  if (serial && !/^not listed$/i.test(serial)) payload.serial_number = serial;
  const registrationRaw = labels['registration #'] || labels['registration'] || extractRegistrationToken((document.body && document.body.innerText) || '');
  if (registrationRaw) payload.registration_raw = registrationRaw;

  const totalTime = labels['total time'];
  if (totalTime) payload.total_time_airframe = parseHours(totalTime);
  const engine1 = labels['engine 1 time'];
  if (engine1) {
    payload.engine_1_time_text = engine1;
    payload.engine_1_time_hours = parseHours(engine1);
    if (!payload.engine_time_since_overhaul) payload.engine_time_since_overhaul = payload.engine_1_time_hours;
  }
  const engine2 = labels['engine 2 time'];
  if (engine2) {
    payload.engine_2_time_text = engine2;
    payload.engine_2_time_hours = parseHours(engine2);
  }
  const prop1 = labels['prop 1 time'];
  if (prop1) {
    payload.prop_1_time_text = prop1;
    payload.prop_1_time_hours = parseHours(prop1);
    if (!payload.time_since_prop_overhaul) payload.time_since_prop_overhaul = payload.prop_1_time_hours;
  }
  const prop2 = labels['prop 2 time'];
  if (prop2) {
    payload.prop_2_time_text = prop2;
    payload.prop_2_time_hours = parseHours(prop2);
  }

  const category = labels['category'] || document.querySelector('input#category')?.getAttribute('value') || payload.tap_category_level1;
  if (category) {
    payload.tap_category_level1 = category;
    if (!payload.aircraft_type) payload.aircraft_type = parseCategoryType(category);
  }

  const listingId = document.querySelector('input#listing_id')?.getAttribute('value');
  if (listingId) payload.tap_listing_id = listingId;
  const phones = Array.from(document.querySelectorAll('a.click_to_call[data-phone-original], a[href^="tel:"]'))
    .map((el) => (el.getAttribute('data-phone-original') || el.textContent || '').trim())
    .filter(Boolean);
  if (phones.length) payload.tap_phone_numbers = Array.from(new Set(phones));

  const specsText = [];
  for (const [k, v] of Object.entries(labels)) specsText.push(`${k}: ${v}`);
  for (const [k, v] of Object.entries(sections)) specsText.push(`${k}: ${v}`);
  if (specsText.length) payload.specs_text = specsText.slice(0, 120).join(' | ');

  payload.tap_specs_flat = labels;
  payload.tap_detail_sections = sections;
  payload._detail_extracted_at = new Date().toISOString();
  payload.url = payload.url || window.location.href;
  return { challengeDetected: false, listing: payload };
}

function normalizeDiscoveredTapMake(value) {
  const cleaned = String(value || '')
    .replace(/\s*\([\d,]+\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  const lower = cleaned.toLowerCase();
  if (['all makes', 'all manufacturers', 'all', 'search', 'show all'].includes(lower)) return null;
  if (!/^[a-z0-9][a-z0-9 '&\-/.]{1,39}$/i.test(cleaned)) return null;
  return cleaned;
}

function toTapCategorySpec(input) {
  if (input && typeof input === 'object') {
    const level1 = Array.isArray(input.categoryLevel1)
      ? input.categoryLevel1.map((v) => String(v || '').trim()).filter(Boolean)
      : [];
    const extraRaw = input.extraParams && typeof input.extraParams === 'object' ? input.extraParams : {};
    const extraParams = {};
    for (const [key, value] of Object.entries(extraRaw)) {
      const cleanKey = String(key || '').trim();
      const cleanValue = String(value || '').trim();
      if (!cleanKey || !cleanValue) continue;
      extraParams[cleanKey] = cleanValue;
    }
    return { categoryLevel1: level1, extraParams };
  }
  const legacy = String(input || '').replace(/\+/g, ' ').trim();
  return legacy ? { categoryLevel1: [legacy], extraParams: {} } : { categoryLevel1: [], extraParams: {} };
}

function tapUrlMatchesCategory(url, categorySpec) {
  try {
    const parsed = new URL(url, window.location.origin);
    const expected = toTapCategorySpec(categorySpec);
    const expectedLevels = expected.categoryLevel1.map((v) => v.toLowerCase());
    if (expectedLevels.length) {
      const actualLevels = parsed.searchParams.getAll('category_level1').map((v) => String(v || '').trim().toLowerCase());
      for (const level of expectedLevels) {
        if (!actualLevels.includes(level)) return false;
      }
    }
    const extra = expected.extraParams || {};
    for (const [key, value] of Object.entries(extra)) {
      const actual = String(parsed.searchParams.get(key) || '').trim().toLowerCase();
      if (actual !== String(value).trim().toLowerCase()) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function discoverTapMakes(categorySpecInput) {
  const challenge = challengeSignals();
  if (challenge.challengeDetected) {
    return { success: false, challengeDetected: true, makes: [], meta: { pageTitle: challenge.pageTitle || '' } };
  }
  const categorySpec = toTapCategorySpec(categorySpecInput);

  const seen = new Map();
  const addMake = (raw) => {
    const normalized = normalizeDiscoveredTapMake(raw);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (!seen.has(key)) seen.set(key, normalized);
  };

  const makeOptions = document.querySelectorAll(
    'select[name="make"] option, select[id*="make" i] option, select[name*="manufacturer" i] option, select[id*="manufacturer" i] option'
  );
  for (const opt of makeOptions) {
    addMake(opt.textContent || '');
    const val = String(opt.getAttribute('value') || '').trim();
    if (val && !/^(all|any)$/i.test(val)) addMake(val);
  }

  const makeAnchors = document.querySelectorAll("a[href*='make='], a[href*='manufacturer=']");
  for (const anchor of makeAnchors) {
    try {
      const url = new URL(anchor.href, window.location.origin);
      if (!tapUrlMatchesCategory(url.toString(), categorySpec)) continue;
      addMake(url.searchParams.get('make') || '');
      addMake(url.searchParams.get('manufacturer') || '');
    } catch {
      // ignore malformed URLs
    }
    addMake(anchor.textContent || '');
  }

  const makes = Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
  return {
    success: true,
    challengeDetected: false,
    makes,
    count: makes.length,
    meta: {
      pageTitle: document.title || '',
      discovered: makes.length,
      makeOptions: makeOptions.length,
      makeAnchors: makeAnchors.length,
    },
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'EXTRACT_CARDS') {
    const result = extractCardsNow();
    if (result.challengeDetected) sendResponse({ success: false, challengeDetected: true, listings: [], count: 0, meta: result.meta || {} });
    else sendResponse({ success: true, challengeDetected: false, listings: result.listings, count: result.listings.length, meta: result.meta || {} });
    return true;
  }
  if (message.action === 'CHECK_CHALLENGE') {
    sendResponse({ success: true, ...challengeSignals() });
    return true;
  }
  if (message.action === 'HUMAN_SCROLL') {
    humanScroll().then(() => sendResponse({ success: true })).catch(() => sendResponse({ success: false }));
    return true;
  }
  if (message.action === 'EXTRACT_DETAIL') {
    const result = extractDetail(message.listing || {});
    if (result.challengeDetected) sendResponse({ success: false, challengeDetected: true, listing: null });
    else sendResponse({ success: true, challengeDetected: false, listing: result.listing });
    return true;
  }
  if (message.action === 'DISCOVER_TAP_MAKES') {
    const result = discoverTapMakes(message.categorySpec || message.categoryLevel1 || '');
    sendResponse(result);
    return true;
  }
  sendResponse({ success: false, error: 'Unknown action' });
  return true;
});
