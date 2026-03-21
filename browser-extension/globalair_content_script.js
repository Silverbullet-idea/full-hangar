'use strict';

const BASE = 'https://www.globalair.com';

function parseIntSafe(value) {
  const digits = String(value || '').replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : null;
}

function parseHours(value) {
  const text = String(value || '');
  const hhmm = text.match(/(\d{1,3}(?:,\d{3})*|\d+)\s*:\s*(\d{1,2})/);
  if (hhmm) {
    const hours = Number(hhmm[1].replace(/,/g, ''));
    const minutes = Number(hhmm[2]);
    if (Number.isFinite(hours) && Number.isFinite(minutes)) return Math.round(hours + minutes / 60);
  }
  const m = text.match(/[\d,]+(?:\.\d+)?/);
  if (!m) return null;
  const num = Number(m[0].replace(/,/g, ''));
  return Number.isFinite(num) ? Math.round(num) : null;
}

function abs(url) {
  const v = String(url || '').trim();
  if (!v) return null;
  return v.startsWith('http') ? v : `${BASE}${v}`;
}

function sourceIdFromUrl(url) {
  const value = String(url || '');
  const primary = value.match(/\/listing-detail\/aircraft-for-sale\/(\d+)(?:\/|$)/i);
  if (primary) return `ga_${primary[1]}`;
  const tail = value.match(/\/(\d+)(?:\/)?(?:\?.*)?$/);
  if (tail) return `ga_${tail[1]}`;
  return null;
}

function splitLoc(value) {
  const text = String(value || '').trim();
  if (!text) return [null, null];
  if (/.+,\s*[A-Z]{2}$/.test(text)) {
    const idx = text.lastIndexOf(',');
    return [text.slice(0, idx).trim(), text.slice(idx + 1).trim().toUpperCase()];
  }
  return [text, null];
}

function extractRegistrationToken(value) {
  const text = String(value || '');
  if (!text.trim()) return null;
  const label = text.match(/\b(?:registration|tail(?:\s*number)?|n[\s\-]*number)\b\s*[#:\-]?\s*([A-Z0-9\-]{2,12})\b/i);
  if (label && label[1]) return label[1].toUpperCase();
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
    '/cdn-cgi/challenge-platform',
    'cf-chl',
    'captcha-delivery',
    'access denied',
  ];
  const weakMarkers = ['captcha', 'cloudflare', 'security verification', 'security check', 'just a moment'];
  const strongMatched = strongMarkers.filter((m) => text.includes(m) || title.includes(m) || html.includes(m));
  const weakMatched = weakMarkers.filter((m) => text.includes(m) || title.includes(m) || html.includes(m));

  // If GlobalAir listing/detail content is present, do not treat generic captcha/cloudflare
  // strings in embedded scripts as an active challenge page.
  const listingSignals =
    document.querySelectorAll('div.list-item.result-container, div.result-container.list-item, a.result-title').length > 0 ||
    /aircraft\s+for\s+sale|featured listings|general listings/i.test(String(document.body?.innerText || ''));
  const detailSignals =
    document.querySelectorAll('#listing-detail, #divaddetails, a[href*="ac-reg/search.aspx?regnum="]').length > 0 ||
    /aircraft details|specifications|serial number|registration/i.test(String(document.body?.innerText || ''));
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
    window.scrollBy({ top: 160 + Math.floor(Math.random() * 520), behavior: 'smooth' });
    await new Promise((resolve) => setTimeout(resolve, 250 + Math.floor(Math.random() * 600)));
  }
}

async function expandLoadMore() {
  for (let i = 0; i < 60; i += 1) {
    const btn = document.querySelector('button#loadPageX');
    if (!btn || btn.disabled || btn.offsetParent === null) break;
    btn.click();
    await new Promise((resolve) => setTimeout(resolve, 1100));
  }
}

function textFrom(selector) {
  const raw = document.querySelector(selector)?.textContent || '';
  const trimmed = String(raw).replace(/\s+/g, ' ').trim();
  return trimmed || null;
}

function parseListingsTotals() {
  const blob = String((document.body && document.body.innerText) || '').replace(/\s+/g, ' ').trim();
  const totalMatch = blob.match(/of\s+([\d,]+)\s+(?:results|listings)/i);
  const rangeMatch = blob.match(/([\d,]+)\s*-\s*([\d,]+)\s*of\s*[\d,]+\s*(?:results|listings)/i);
  return {
    totalListings: totalMatch ? parseInt(totalMatch[1].replace(/,/g, ''), 10) : 0,
    rangeStart: rangeMatch ? parseInt(rangeMatch[1].replace(/,/g, ''), 10) : 0,
    rangeEnd: rangeMatch ? parseInt(rangeMatch[2].replace(/,/g, ''), 10) : 0,
  };
}

function normalizeMakeLabelFromSlug(slug) {
  const cleaned = String(slug || '')
    .replace(/[^a-z0-9\-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  if (!cleaned) return null;
  return cleaned
    .split('-')
    .filter(Boolean)
    .map((part) => (/^\d+$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ');
}

function discoverMakesForCategory(category) {
  const challenge = challengeSignals();
  if (challenge.challengeDetected) {
    return { success: false, challengeDetected: true, makes: [], meta: { pageTitle: challenge.pageTitle || '' } };
  }
  const targetCategory = String(category || '')
    .toLowerCase()
    .replace(/[^a-z0-9\-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  const anchors = Array.from(document.querySelectorAll("a[href*='/aircraft-for-sale/']"));
  const bySlug = new Map();

  for (const anchor of anchors) {
    const rawHref = anchor.getAttribute('href') || '';
    const url = abs(rawHref);
    if (!url) continue;
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length < 3) continue;
    if (parts[0].toLowerCase() !== 'aircraft-for-sale') continue;
    const categorySlug = String(parts[1] || '').toLowerCase();
    const makeSlug = String(parts[2] || '').toLowerCase();
    if (!makeSlug || makeSlug === 'listing-detail') continue;
    if (targetCategory && categorySlug !== targetCategory) continue;
    if (makeSlug === 'search-results-page') continue;

    const anchorText = String(anchor.textContent || '').replace(/\s+/g, ' ').trim();
    const normalizedText = anchorText
      .replace(/\s*\([\d,]+\)\s*$/, '')
      .replace(/\s+\d+\s+Aircraft\s+For\s+Sale$/i, '')
      .trim();
    const label = normalizedText || normalizeMakeLabelFromSlug(makeSlug);
    if (!label) continue;
    if (!bySlug.has(makeSlug)) bySlug.set(makeSlug, label);
  }

  const makes = Array.from(bySlug.values()).sort((a, b) => a.localeCompare(b));
  return {
    success: true,
    challengeDetected: false,
    makes,
    count: makes.length,
    meta: {
      pageTitle: document.title || '',
      category: targetCategory || null,
      candidateAnchors: anchors.length,
      discovered: makes.length,
    },
  };
}

function extractCardsNow() {
  const challenge = challengeSignals();
  if (challenge.challengeDetected) return { challengeDetected: true, listings: [], meta: { pageTitle: challenge.pageTitle || '' } };
  const totals = parseListingsTotals();
  const cards = Array.from(document.querySelectorAll('div.list-item.result-container, div.result-container.list-item'));
  const anchors = Array.from(document.querySelectorAll("a.result-title, a[href*='/listing-detail/aircraft-for-sale/']"));
  const uniqueById = new Set();
  const rows = [];

  const candidates = cards.length
    ? cards.map((card) => ({ card, a: card.querySelector("a.result-title, a[href*='/listing-detail/aircraft-for-sale/']") })).filter((x) => !!x.a)
    : anchors.map((a) => ({ card: a.closest('div.list-item.result-container, li, article, div') || a.parentElement, a }));

  for (const candidate of candidates) {
    const card = candidate.card;
    const a = candidate.a;
    if (!a) continue;
    const url = abs(a.getAttribute('href'));
    if (!url) continue;
    const sid = sourceIdFromUrl(url);
    if (!sid || uniqueById.has(sid)) continue;
    uniqueById.add(sid);

    const title = String(a.textContent || '').replace(/\s+/g, ' ').trim();
    const yearMatch = title.match(/\b(19|20)\d{2}\b/);
    const price = parseIntSafe(card?.getAttribute('data-price') || card?.querySelector('[class*="price"]')?.textContent);
    const total = parseIntSafe(card?.getAttribute('data-totaltime'));
    const locationRaw = card?.querySelector('div.result-broker-notes, div[class*=broker], [class*=location]')?.textContent?.trim() || null;
    const [locationCity, locationState] = splitLoc(locationRaw);
    const img = card?.querySelector('img');
    const primaryImageUrl = abs(img?.getAttribute('src') || img?.getAttribute('data-src'));
    const cardText = String(card?.textContent || '').replace(/\s+/g, ' ').trim();

    rows.push({
      source_site: 'globalair',
      listing_source: 'globalair',
      source_id: sid,
      source_listing_id: sid,
      url,
      title: title || null,
      year: yearMatch ? parseInt(yearMatch[0], 10) : null,
      price_asking: price,
      asking_price: price,
      total_time_airframe: total,
      location_raw: locationRaw,
      location_city: locationCity,
      location_state: locationState,
      state: locationState,
      registration_raw: extractRegistrationToken(cardText),
      primary_image_url: primaryImageUrl,
      image_urls: primaryImageUrl ? [primaryImageUrl] : null,
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

function extractDetail(listing) {
  const challenge = challengeSignals();
  if (challenge.challengeDetected) return { challengeDetected: true, listing: null };
  const payload = { ...(listing || {}) };
  const h1 = textFrom('h1');
  if (h1) payload.title = h1;

  const description = textFrom('#Description') || textFrom('.description') || textFrom('.listing-description');
  if (description) {
    payload.description_full = description;
    if (!payload.description) payload.description = description;
  }
  const priceText = textFrom('[class*="price"]') || textFrom('.price');
  const price = parseIntSafe(priceText);
  if (price) {
    payload.price_asking = price;
    payload.asking_price = price;
  }

  const rows = Array.from(document.querySelectorAll('tr, li, .spec-item, .details-row, #divaddetails .card'));
  const specsText = [];
  for (const row of rows) {
    const raw = String(row.textContent || '').replace(/\s+/g, ' ').trim();
    if (!raw) continue;
    specsText.push(raw);
    if (!payload.total_time_airframe) {
      const tt = raw.match(/\b(?:ttaf|tt|total time)\b[:\s]*([\d,:.]+)/i);
      if (tt) payload.total_time_airframe = parseHours(tt[1]);
    }
    if (!payload.engine_time_since_overhaul) {
      const smoh = raw.match(/\b(?:smoh|tsmoh|engine time since overhaul)\b[:\s]*([\d,:.]+)/i);
      if (smoh) payload.engine_time_since_overhaul = parseHours(smoh[1]);
    }
    if (!payload.time_since_prop_overhaul) {
      const spoh = raw.match(/\b(?:spoh|tspoh|prop(?:eller)? time since overhaul)\b[:\s]*([\d,:.]+)/i);
      if (spoh) payload.time_since_prop_overhaul = parseHours(spoh[1]);
    }
    if (!payload.registration_raw) {
      const reg = extractRegistrationToken(raw);
      if (reg) payload.registration_raw = reg;
    }
    if (!payload.serial_number) {
      const sn = raw.match(/\b(?:serial(?:\s*number)?|s\/?n)\b[:\s#-]*([A-Z0-9\-\/]{3,})/i);
      if (sn) payload.serial_number = sn[1].toUpperCase();
    }
  }

  if (specsText.length) payload.specs_text = specsText.slice(0, 120).join(' | ');
  payload._detail_extracted_at = new Date().toISOString();
  payload.url = payload.url || window.location.href;
  return { challengeDetected: false, listing: payload };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'EXTRACT_CARDS') {
    expandLoadMore()
      .then(() => {
        const result = extractCardsNow();
        if (result.challengeDetected) {
          sendResponse({ success: false, challengeDetected: true, listings: [], count: 0, meta: result.meta || {} });
        } else {
          sendResponse({ success: true, challengeDetected: false, listings: result.listings, count: result.listings.length, meta: result.meta || {} });
        }
      })
      .catch(() => sendResponse({ success: false, error: 'extract_cards_failed' }));
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
  if (message.action === 'DISCOVER_GLOBALAIR_MAKES') {
    const result = discoverMakesForCategory(message.category || '');
    sendResponse(result);
    return true;
  }
  sendResponse({ success: false, error: 'Unknown action' });
  return true;
});
