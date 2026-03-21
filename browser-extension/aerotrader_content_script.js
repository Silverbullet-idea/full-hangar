'use strict';

const BASE = 'https://www.aerotrader.com';

function parseIntSafe(value) {
  const digits = String(value || '').replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : null;
}

function parseHours(value) {
  const m = String(value || '').match(/(\d[\d,]*(?:\.\d+)?)/);
  if (!m) return null;
  const num = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(num) ? Math.round(num) : null;
}

function abs(url) {
  const v = String(url || '').trim();
  if (!v) return null;
  return v.startsWith('http') ? v : `${BASE}${v.startsWith('/') ? '' : '/'}${v}`;
}

function sourceIdFromUrl(url) {
  const path = String(url || '');
  const tail = path.match(/-(\d{7,12})(?:[/?#]|$)/);
  if (tail) return tail[1];
  const sid = path.match(/[?&]sid=(\d+)/i);
  if (sid) return sid[1];
  const anyId = path.match(/(\d{7,12})/);
  if (anyId) return anyId[1];
  return null;
}

function splitLoc(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return [null, null];
  const m = text.match(/^(.+?),\s*([A-Z]{2})\b/i);
  if (m) return [m[1].trim(), m[2].toUpperCase()];
  return [text, null];
}

function challengeSignals() {
  const text = String((document.body && document.body.innerText) || '').toLowerCase();
  const title = String(document.title || '').toLowerCase();
  const html = String(document.documentElement?.innerHTML || '').toLowerCase();
  const hardBlockMarkers = [
    'please enable js and disable any ad blocker',
    'we are sorry',
    'this page may have moved or is no longer available',
  ];
  const strongMarkers = [
    'captcha-delivery',
    'geo.captcha-delivery.com',
    'ct.captcha-delivery.com',
    'var dd=',
    'datadome',
  ];
  const weakMarkers = ['captcha', 'verify you are human', 'access denied'];
  const hardMatched = hardBlockMarkers.filter((m) => text.includes(m) || title.includes(m) || html.includes(m));
  const strongMatched = strongMarkers.filter((m) => text.includes(m) || title.includes(m) || html.includes(m));
  const weakMatched = weakMarkers.filter((m) => text.includes(m) || title.includes(m) || html.includes(m));

  const listingSignals =
    document.querySelectorAll("article[data-ad-id], article[id*='listing'], article[data-dlr-url], a[href*='/listing/']").length > 0 ||
    /aircraft for sale|results|featured/i.test(String(document.body?.innerText || ''));
  const detailSignals =
    document.querySelectorAll("div.dealer-description, [class*='dealer-description'], [id*='Gallery'], a[href*='/listing/']").length > 0 ||
    /aircraft details|specifications|registration|n-number/i.test(String(document.body?.innerText || ''));
  const hasNormalPageSignals = listingSignals || detailSignals;

  const matched = [...hardMatched, ...strongMatched, ...weakMatched];
  const challengeDetected =
    hardMatched.length > 0
    || ((strongMatched.length > 0 || weakMatched.length > 0) && !hasNormalPageSignals);
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
    window.scrollBy({ top: 220 + Math.floor(Math.random() * 620), behavior: 'smooth' });
    await new Promise((resolve) => setTimeout(resolve, 250 + Math.floor(Math.random() * 700)));
  }
}

function parseListingsTotals() {
  const blob = String((document.body && document.body.innerText) || '').replace(/\s+/g, ' ').trim();
  const totalMatch = blob.match(/([\d,]+)\s+(?:aircraft|listings?)\s+(?:for sale|found|results?)/i);
  const rangeMatch = blob.match(/([\d,]+)\s*-\s*([\d,]+)\s*of\s*[\d,]+\s*(?:results|listings)/i);
  return {
    totalListings: totalMatch ? parseInt(totalMatch[1].replace(/,/g, ''), 10) : 0,
    rangeStart: rangeMatch ? parseInt(rangeMatch[1].replace(/,/g, ''), 10) : 0,
    rangeEnd: rangeMatch ? parseInt(rangeMatch[2].replace(/,/g, ''), 10) : 0,
  };
}

function discoverMakes() {
  const challenge = challengeSignals();
  if (challenge.challengeDetected) {
    return { success: false, challengeDetected: true, makes: [], meta: { pageTitle: challenge.pageTitle || '' } };
  }
  const anchors = Array.from(document.querySelectorAll("a[href*='make='][href*='%7C'], a[href*='make='][href*='|']"));
  const byName = new Map();
  for (const anchor of anchors) {
    const href = String(anchor.getAttribute('href') || '');
    const makeMatch = href.match(/[?&]make=([^|%&]+)(?:\||%7C)(\d+)/i);
    if (!makeMatch) continue;
    const rawName = decodeURIComponent(makeMatch[1] || '').replace(/\+/g, ' ').trim();
    if (!rawName) continue;
    const key = rawName.toLowerCase();
    if (!byName.has(key)) byName.set(key, rawName);
  }
  const cardMakeNodes = Array.from(document.querySelectorAll("article[data-make-ymm], article[data-ad-make]"));
  for (const node of cardMakeNodes) {
    const rawMake = String(node.getAttribute('data-make-ymm') || node.getAttribute('data-ad-make') || '').trim();
    if (!rawMake) continue;
    const key = rawMake.toLowerCase();
    if (!byName.has(key)) byName.set(key, rawMake);
  }
  const makes = Array.from(byName.values()).sort((a, b) => a.localeCompare(b));
  return {
    success: true,
    challengeDetected: false,
    makes,
    count: makes.length,
    meta: {
      pageTitle: document.title || '',
      candidateAnchors: anchors.length,
      discovered: makes.length,
    },
  };
}

function normalizeDetailUrl(href) {
  const absUrl = abs(href);
  if (!absUrl) return null;
  try {
    const u = new URL(absUrl);
    const sid = u.hash.match(/sid=(\d+)/i);
    u.hash = '';
    if (sid && sid[1]) u.searchParams.set('sid', sid[1]);
    return u.toString();
  } catch {
    return absUrl;
  }
}

function extractCardsNow() {
  const challenge = challengeSignals();
  if (challenge.challengeDetected) return { challengeDetected: true, listings: [], meta: { pageTitle: challenge.pageTitle || '' } };
  const totals = parseListingsTotals();
  const cards = Array.from(document.querySelectorAll("article[data-ad-id], article[id*='listing'], article.search-card, article[data-dlr-url]"));
  const anchors = Array.from(document.querySelectorAll("a[href*='/listing/'], a[href*='listing-'][href*='aerotrader.com']"));
  const seen = new Set();
  const rows = [];

  const candidates = cards.length
    ? cards.map((card) => ({
      card,
      a: card.querySelector("a[href*='/listing/'], a[href*='listing-'][href*='aerotrader.com']")
        || card.querySelector('a[href]')
        || null,
    }))
    : anchors.map((a) => ({ card: a.closest('article, li, div') || a.parentElement, a }));

  for (const candidate of candidates) {
    const card = candidate.card;
    const a = candidate.a;
    const href = card?.getAttribute('data-dlr-url') || a?.getAttribute('href') || '';
    const url = normalizeDetailUrl(href);
    if (!url) continue;

    let sourceId = String(card?.getAttribute('data-ad-id') || '').trim();
    if (!sourceId) sourceId = sourceIdFromUrl(url) || '';
    if (!sourceId || seen.has(sourceId)) continue;
    seen.add(sourceId);

    const titleRaw = String(a?.textContent || card?.querySelector('h1,h2,h3,h4,[class*="title"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const yearAttr = String(card?.getAttribute('data-ad-year') || '').trim();
    const yearMatch = yearAttr.match(/^(19|20)\d{2}$/) || titleRaw.match(/\b(19|20)\d{2}\b/);
    const make = String(card?.getAttribute('data-make-ymm') || card?.getAttribute('data-ad-make') || '').trim() || null;
    const model = String(card?.getAttribute('data-ad-model') || '').trim() || null;
    const priceAttr = card?.getAttribute('data-ad-price');
    const cardText = String(card?.textContent || '').replace(/\s+/g, ' ').trim();
    const price = parseIntSafe(priceAttr) || parseIntSafe(cardText.match(/\$\s*([\d,]+)/)?.[1]);
    const ttMatch = cardText.match(/\b(?:TTAF|TT)\b[:\s]*([\d,]+(?:\.\d+)?)/i);
    const totalTime = ttMatch ? parseHours(ttMatch[1]) : null;
    const locationRaw = String(card?.getAttribute('data-ad-location') || card?.querySelector("[class*='location']")?.textContent || '').replace(/\s+/g, ' ').trim() || null;
    const [locationCity, locationState] = splitLoc(locationRaw);
    const img = card?.querySelector('img');
    const primaryImageUrl = abs(img?.getAttribute('src') || img?.getAttribute('data-src'));
    const descriptionRaw = card?.querySelector("[class*='content-wrapper'], [class*='description']")?.textContent || null;
    const description = descriptionRaw ? String(descriptionRaw).replace(/\s+/g, ' ').trim() : null;

    rows.push({
      source_site: 'aerotrader',
      listing_source: 'aerotrader',
      source_id: sourceId,
      source_listing_id: sourceId,
      url,
      title: titleRaw || null,
      year: yearMatch ? parseInt(yearMatch[0], 10) : null,
      make,
      model,
      price_asking: price,
      asking_price: price,
      total_time_airframe: totalTime,
      location_raw: locationRaw,
      location_city: locationCity,
      location_state: locationState,
      state: locationState,
      primary_image_url: primaryImageUrl,
      image_urls: primaryImageUrl ? [primaryImageUrl] : null,
      description,
      _page_url: window.location.href,
      _extracted_at: new Date().toISOString(),
    });
  }

  return {
    challengeDetected: false,
    listings: rows,
    meta: {
      pageTitle: document.title || '',
      selectorUsed: cards.length ? 'article_cards' : 'listing_anchors',
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
  const fullText = String(document.body?.innerText || '').replace(/\s+/g, ' ').trim();

  const title = document.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim();
  if (title) payload.title = title;

  const priceText = document.querySelector("[class*='price'], [class*='ask-price']")?.textContent || fullText.match(/\$\s*[\d,]+/)?.[0] || '';
  const price = parseIntSafe(priceText);
  if (price) {
    payload.price_asking = price;
    payload.asking_price = price;
  }

  const descNode = document.querySelector('div.dealer-description.clearBoth, div.dealer-description, [class*="dealer-description"]');
  if (descNode) {
    const descText = String(descNode.textContent || '').trim();
    if (descText) {
      payload.description_full = descText.slice(0, 7000);
      if (!payload.description) payload.description = descText.slice(0, 2000);
    }
  }

  const nNumber = fullText.match(/\bN\d{1,5}[A-HJ-NP-Z]{0,2}\b/i)?.[0];
  if (nNumber && !payload.registration_raw) payload.registration_raw = nNumber.toUpperCase();

  payload.url = payload.url || window.location.href;
  payload._detail_extracted_at = new Date().toISOString();
  return { challengeDetected: false, listing: payload };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    const action = message && message.action;
    if (action === 'CHECK_CHALLENGE') {
      sendResponse({ success: true, ...challengeSignals() });
      return;
    }
    if (action === 'HUMAN_SCROLL') {
      await humanScroll();
      sendResponse({ success: true });
      return;
    }
    if (action === 'DISCOVER_AEROTRADER_MAKES') {
      const discovered = discoverMakes();
      sendResponse(discovered);
      return;
    }
    if (action === 'EXTRACT_CARDS') {
      const out = extractCardsNow();
      if (out.challengeDetected) {
        sendResponse({ success: false, challengeDetected: true, listings: [], count: 0, meta: out.meta || {} });
      } else {
        sendResponse({ success: true, challengeDetected: false, listings: out.listings, count: out.listings.length, meta: out.meta || {} });
      }
      return;
    }
    if (action === 'EXTRACT_DETAIL') {
      const out = extractDetail(message.listing || {});
      if (out.challengeDetected) {
        sendResponse({ success: false, challengeDetected: true, listing: null });
      } else {
        sendResponse({ success: true, challengeDetected: false, listing: out.listing });
      }
      return;
    }
    sendResponse({ success: false, error: 'Unknown action' });
  })();
  return true;
});
