'use strict';

function parsePrice(text) {
  const digits = String(text || '').replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : null;
}

function parseHours(text) {
  const m = String(text || '').match(/[\d,]+/);
  return m ? parseInt(m[0].replace(/,/g, ''), 10) : null;
}

function sourceIdFromUrl(url) {
  const m = String(url || '').match(/(\d+)(?:\/)?$/);
  return m ? m[1] : null;
}

function splitCityState(text) {
  const v = String(text || '').trim();
  if (!v) return [null, null];
  const parts = v.split(',').map((x) => x.trim());
  if (parts.length >= 2) return [parts[0], parts[1].slice(0, 2).toUpperCase()];
  return [v, null];
}

function extractCards() {
  const cards = Array.from(document.querySelectorAll('div.list-listing-card-wrapper, article.search-card'));
  const rows = [];
  for (const card of cards) {
    const a = card.querySelector("a[href*='/listing/']");
    if (!a) continue;
    const href = a.getAttribute('href') || '';
    const url = href.startsWith('http') ? href : `https://www.controller.com${href}`;
    const sid = sourceIdFromUrl(url);
    if (!sid) continue;
    const title = (a.getAttribute('title') || a.textContent || '').trim();
    const yearMatch = title.match(/\b(19|20)\d{2}\b/);
    const year = yearMatch ? parseInt(yearMatch[0], 10) : null;
    const priceText = (card.querySelector('.price, .price-contain')?.textContent || '').trim();
    const price = parsePrice(priceText);
    const specsText = card.querySelector('div.specs-container')?.textContent || '';
    const tt = parseHours((specsText.match(/(?:TT|TTAF|Total Time)[:\s]*([\d,]+)/i) || [])[1]);
    const locText = (card.querySelector('span.location-span, div.location, [class*=location]')?.textContent || '').trim();
    const [location_city, location_state] = splitCityState(locText);
    const img = card.querySelector('img');
    const imgSrc = img ? (img.getAttribute('data-src') || img.getAttribute('src') || '').trim() : '';
    const primary_image_url = imgSrc ? (imgSrc.startsWith('http') ? imgSrc : `https://www.controller.com${imgSrc}`) : null;

    rows.push({
      source_site: 'controller',
      listing_source: 'controller',
      source_id: sid,
      source_listing_id: sid,
      url,
      title: title || null,
      year,
      price_asking: price,
      asking_price: price,
      total_time_airframe: tt,
      location_raw: locText || null,
      location_city,
      location_state,
      state: location_state,
      primary_image_url,
      _page_url: window.location.href,
      _extracted_at: new Date().toISOString(),
    });
  }
  return rows;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'EXTRACT_CARDS') {
    const listings = extractCards();
    sendResponse({ success: true, listings, count: listings.length });
  } else {
    sendResponse({ success: false, error: 'Unknown action' });
  }
  return true;
});
