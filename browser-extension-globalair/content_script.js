'use strict';

const BASE = 'https://www.globalair.com';

function parseIntSafe(v) {
  const d = String(v || '').replace(/[^\d]/g, '');
  return d ? parseInt(d, 10) : null;
}
function sourceId(url) {
  const m = String(url || '').match(/\/(\d+)(?:\/)?$/);
  return m ? `ga_${m[1]}` : null;
}
function abs(url) {
  const u = String(url || '').trim();
  if (!u) return null;
  return u.startsWith('http') ? u : `${BASE}${u}`;
}
function splitLoc(v) {
  const t = String(v || '').trim();
  if (!t) return [null, null];
  if (/.+,\s*[A-Z]{2}$/.test(t)) {
    const idx = t.lastIndexOf(',');
    return [t.slice(0, idx).trim(), t.slice(idx + 1).trim().toUpperCase()];
  }
  return [t, null];
}
async function expandLoadMore() {
  for (let i = 0; i < 60; i++) {
    const btn = document.querySelector('button#loadPageX');
    if (!btn || btn.disabled || btn.offsetParent === null) break;
    btn.click();
    await new Promise((r) => setTimeout(r, 1200));
  }
}

function extractCardsNow() {
  const cards = Array.from(document.querySelectorAll('div.list-item.result-container, div.result-container.list-item'));
  const rows = [];
  for (const card of cards) {
    const a = card.querySelector('a.result-title, a[href*="/listing-detail/"]');
    if (!a) continue;
    const url = abs(a.getAttribute('href'));
    if (!url) continue;
    const sid = sourceId(url);
    if (!sid) continue;
    const title = (a.textContent || '').trim();
    const yMatch = title.match(/^(\d{4})/);
    const year = yMatch ? parseInt(yMatch[1], 10) : parseIntSafe(card.getAttribute('data-year'));
    const price = parseIntSafe(card.getAttribute('data-price'));
    const total = parseIntSafe(card.getAttribute('data-totaltime'));
    const seller = card.querySelector('a[href*="/listings-by-seller/"]')?.textContent?.trim() || null;
    const location_raw = card.querySelector('div.result-broker-notes, div[class*=broker]')?.textContent?.trim() || null;
    const [location_city, location_state] = splitLoc(location_raw);
    const img = card.querySelector('img');
    const primary_image_url = abs(img?.getAttribute('src') || img?.getAttribute('data-src'));
    rows.push({
      source_site: 'globalair',
      listing_source: 'globalair',
      source_id: sid,
      source_listing_id: sid,
      url,
      title: title || null,
      year,
      price_asking: price,
      asking_price: price,
      total_time_airframe: total,
      seller_name: seller,
      seller_type: seller ? 'dealer' : null,
      location_raw,
      location_city,
      location_state,
      state: location_state,
      primary_image_url,
      image_urls: primary_image_url ? [primary_image_url] : null,
      _page_url: window.location.href,
      _extracted_at: new Date().toISOString(),
    });
  }
  return rows;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.action === 'EXTRACT_CARDS') {
      await expandLoadMore();
      const listings = extractCardsNow();
      sendResponse({ success: true, listings, count: listings.length });
    } else {
      sendResponse({ success: false, error: 'Unknown action' });
    }
  })();
  return true;
});
