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
    if (Number.isFinite(hours) && Number.isFinite(minutes)) {
      return Math.round(hours + (minutes / 60));
    }
  }
  const m = text.match(/[\d,]+(?:\.\d+)?/);
  if (!m) return null;
  const normalized = m[0].replace(/,/g, '');
  const num = Number(normalized);
  if (!Number.isFinite(num)) return null;
  return Math.round(num);
}

function abs(url) {
  const u = String(url || '').trim();
  if (!u) return null;
  return u.startsWith('http') ? u : `${BASE}${u}`;
}

function sourceIdFromUrl(url) {
  const value = String(url || '');
  const primary = value.match(/\/listing-detail\/aircraft-for-sale\/(\d+)(?:\/|$)/i);
  if (primary) return `ga_${primary[1]}`;
  const alt = value.match(/\/(\d+)(?:\/)?(?:\?.*)?$/);
  if (alt) return `ga_${alt[1]}`;
  try {
    const u = new URL(value, BASE);
    const qp = u.searchParams.get('id') || u.searchParams.get('listingid');
    if (qp && /^\d+$/.test(qp)) return `ga_${qp}`;
  } catch {
    // ignore URL parse errors
  }
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

  const label = text.match(/\b(?:registration|tail(?:\s*number)?|n[\s\-]*number|aircraft registration)\b\s*[#:\-]?\s*([A-Z0-9\-]{2,12})\b/i);
  if (label && label[1]) return label[1].toUpperCase();

  const patterns = [
    /\bN[0-9]{1,5}[A-HJ-NP-Z]{0,2}\b/i,
    /\bC\-[FGI][A-Z0-9]{3}\b/i,
    /\bG\-[A-Z]{4}\b/i,
    /\bVH\-[A-Z]{3}\b/i,
    /\bZK\-[A-Z]{3}\b/i,
    /\bD\-[A-Z]{4}\b/i,
    /\bF\-[A-Z]{4}\b/i,
    /\bEC\-[A-Z0-9]{3,5}\b/i,
    /\bX[ABC]\-[A-Z0-9]{3,5}\b/i,
    /\b[A-Z]{1,2}\-[A-Z0-9]{3,5}\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[0]) return match[0].toUpperCase();
  }
  return null;
}

function challengeSignals() {
  const text = String((document.body && document.body.innerText) || '').toLowerCase();
  const title = String(document.title || '').toLowerCase();
  const url = String(window.location.href || '').toLowerCase();
  const html = String(document.documentElement?.innerHTML || '').toLowerCase();
  const tokens = [
    'captcha',
    'verify you are human',
    'checking your browser',
    'attention required',
    'cloudflare',
    'security verification',
    'security check',
    'just a moment',
    'turnstile',
    'cf-chl',
    'challenges.cloudflare.com',
    '/cdn-cgi/challenge-platform',
  ];
  const matched = tokens.filter((token) =>
    text.includes(token) || title.includes(token) || url.includes(token) || html.includes(token)
  );
  return {
    challengeDetected: matched.length > 0,
    indicators: matched,
    currentUrl: window.location.href,
    pageTitle: document.title || '',
  };
}

async function humanScroll() {
  const steps = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < steps; i += 1) {
    const delta = 150 + Math.floor(Math.random() * 500);
    window.scrollBy({ top: delta, behavior: 'smooth' });
    await new Promise((resolve) => setTimeout(resolve, 250 + Math.floor(Math.random() * 550)));
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

function collectLabelValuePairs() {
  const pairs = {};

  const rows = Array.from(document.querySelectorAll('table tr'));
  for (const row of rows) {
    const cells = Array.from(row.querySelectorAll('th, td'));
    if (cells.length < 2) continue;
    const label = String(cells[0].textContent || '').replace(/\s+/g, ' ').trim().replace(/:\s*$/, '').toLowerCase();
    const value = String(cells[1].textContent || '').replace(/\s+/g, ' ').trim();
    if (!label || !value) continue;
    if (!(label in pairs)) pairs[label] = value;
  }

  const labels = Array.from(document.querySelectorAll('div.detail__specs-label'));
  for (const labelEl of labels) {
    const rawLabel = String(labelEl.textContent || '').replace(/\s+/g, ' ').trim().replace(/:\s*$/, '').toLowerCase();
    if (!rawLabel) continue;
    const valueEl = labelEl.nextElementSibling;
    if (!valueEl) continue;
    const value = String(valueEl.textContent || '').replace(/\s+/g, ' ').trim();
    if (!value) continue;
    if (!(rawLabel in pairs)) pairs[rawLabel] = value;
  }

  // GlobalAir listing detail pages commonly render key/value in .row with two .col elements.
  const rowPairs = Array.from(document.querySelectorAll('#listing-detail .row, .card-body .row'));
  for (const row of rowPairs) {
    const cols = Array.from(row.querySelectorAll(':scope > .col'));
    if (cols.length < 2) continue;
    const rawLabel = String(cols[0].textContent || '').replace(/\s+/g, ' ').trim().replace(/:\s*$/, '').toLowerCase();
    const value = String(cols[1].textContent || '').replace(/\s+/g, ' ').trim();
    if (!rawLabel || !value) continue;
    if (!(rawLabel in pairs)) pairs[rawLabel] = value;
  }

  return pairs;
}

function collectDetailCardsByHeading() {
  const out = {};
  const cards = Array.from(document.querySelectorAll('#divaddetails .card, .mobileLHDtl, .card.mt20'));
  for (const card of cards) {
    const headingEl = card.querySelector('.card-header, h4');
    if (!headingEl) continue;
    const heading = String(headingEl.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!heading) continue;
    const bodyEl = card.querySelector('.card-text, .card-body, div');
    if (!bodyEl) continue;
    const text = String(bodyEl.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (!(heading in out)) out[heading] = text;
  }
  return out;
}

function firstSpec(specMap, labels) {
  for (const label of labels) {
    const key = String(label || '').toLowerCase().trim();
    const value = specMap[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return null;
}

function parseListingsTotals() {
  const candidates = [
    textFrom('.listings-count'),
    textFrom('.results-count'),
    textFrom('[class*="count"]'),
    textFrom('h1'),
    String((document.body && document.body.innerText) || '').slice(0, 8000),
  ].filter(Boolean);

  let rangeStart = 0;
  let rangeEnd = 0;
  let totalListings = 0;

  for (const text of candidates) {
    const normalized = String(text).replace(/\s+/g, ' ').trim();
    const totalMatch = normalized.match(/of\s+([\d,]+)\s+(?:results|listings)/i);
    if (totalMatch) {
      totalListings = parseInt(totalMatch[1].replace(/,/g, ''), 10) || totalListings;
    }
    const rangeMatch = normalized.match(/([\d,]+)\s*-\s*([\d,]+)\s*of\s*[\d,]+\s*(?:results|listings)/i);
    if (rangeMatch) {
      rangeStart = parseInt(rangeMatch[1].replace(/,/g, ''), 10) || rangeStart;
      rangeEnd = parseInt(rangeMatch[2].replace(/,/g, ''), 10) || rangeEnd;
    }
    if (totalListings > 0 && rangeEnd >= 0) break;
  }

  return { totalListings, rangeStart, rangeEnd };
}

function extractDetail(listing) {
  const challenge = challengeSignals();
  if (challenge.challengeDetected) return { challengeDetected: true, listing: null };

  const payload = { ...(listing || {}) };
  const extractionSignals = {};
  const h1 = textFrom('h1');
  if (h1) payload.title = h1;
  if (!payload.serial_number && h1) {
    const titleSerial = h1.match(/\bSN[:\s#-]*([A-Z0-9\-\/]{3,})\b/i);
    if (titleSerial) {
      payload.serial_number = titleSerial[1].toUpperCase();
      extractionSignals.serial_number = 'title_sn';
    }
  }

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

  const locationText = textFrom('[class*="broker"]') || textFrom('[class*="location"]');
  if (locationText) {
    const [city, state] = splitLoc(locationText);
    payload.location_raw = locationText;
    payload.location_city = city;
    payload.location_state = state;
    payload.state = state;
  }

  const specs = collectLabelValuePairs();
  const detailCards = collectDetailCardsByHeading();
  const specsTextPairs = [];
  for (const [k, v] of Object.entries(specs)) {
    specsTextPairs.push(`${k}: ${v}`);
  }
  for (const [k, v] of Object.entries(detailCards)) {
    specsTextPairs.push(`${k}: ${v}`);
  }

  const serial = firstSpec(specs, ['serial number', 'serial #', 'serial']);
  if (serial) {
    payload.serial_number = serial;
    extractionSignals.serial_number = extractionSignals.serial_number || 'spec_label';
  }

  const reg =
    firstSpec(specs, ['registration', 'registration #', 'tail number', 'n-number']) ||
    extractRegistrationToken(document.querySelector("a[href*='ac-reg/search.aspx?regnum=']")?.textContent || '') ||
    extractRegistrationToken((document.body && document.body.innerText) || '');
  if (reg) {
    payload.registration_raw = reg;
    extractionSignals.registration_raw = 'detail_page';
  }

  const totalTime = firstSpec(specs, ['total time', 'ttaf', 'airframe total time']);
  if (totalTime) {
    const parsed = parseHours(totalTime);
    if (parsed !== null) {
      payload.total_time_airframe = parsed;
      extractionSignals.total_time_airframe = 'spec_label';
    }
  }
  if (!payload.total_time_airframe) {
    const airframeText = detailCards['airframe'] || '';
    if (airframeText) {
      const airframeMatch =
        airframeText.match(/\b(?:ttsn|ttaf|total time)\b[^0-9]*([\d,:.]+)/i) ||
        airframeText.match(/\b([\d,]+:\d{1,2})\s*(?:hrs?|hours?)?/i);
      if (airframeMatch) payload.total_time_airframe = parseHours(airframeMatch[1]);
      if (airframeMatch && payload.total_time_airframe != null) {
        extractionSignals.total_time_airframe = extractionSignals.total_time_airframe || 'airframe_card';
      }
    }
  }

  const engineModel = firstSpec(specs, ['engine make/model', 'engine model', 'engine 1 make/model']);
  if (engineModel) {
    payload.engine_model = engineModel;
    extractionSignals.engine_model = 'spec_label';
    const makeToken = engineModel.match(/^(lycoming|continental|pratt\s*&?\s*whitney|rotax|honeywell|rolls[\s\-]?royce|ge)\b/i);
    if (makeToken && !payload.engine_make) payload.engine_make = makeToken[1];
  }
  if (!payload.engine_model) {
    const engineText = detailCards['engine(s)'] || detailCards['engines'] || '';
    if (engineText) {
      const engineModelMatch = engineText.match(
        /\b((?:PT6A|TSIO|TIO|IO|O|AE|M14P|RR300|PW1\d{2}|PW[0-9A-Z\-]+|[A-Z]{1,3}\-?\d{2,4}[A-Z\-]*)(?:[\/\-\s][A-Z0-9]+)*)\b/i
      );
      if (engineModelMatch) {
        payload.engine_model = engineModelMatch[1].toUpperCase();
        extractionSignals.engine_model = extractionSignals.engine_model || 'engines_card';
      }
      const makeMatch = engineText.match(/\b(lycoming|continental|pratt\s*&?\s*whitney|honeywell|rotax|rolls[\s\-]?royce|ge)\b/i);
      if (makeMatch && !payload.engine_make) payload.engine_make = makeMatch[1];
    }
  }

  const engineTime = firstSpec(specs, ['engine 1 time', 'engine time', 'smoh', 'tsmoh', 'time since major overhaul']);
  if (engineTime) {
    const parsed = parseHours(engineTime);
    if (parsed !== null) {
      payload.engine_time_since_overhaul = parsed;
      payload.time_since_overhaul = parsed;
      extractionSignals.engine_time_since_overhaul = 'spec_label';
    }
  }
  if (!payload.engine_time_since_overhaul) {
    const engineText = detailCards['engine(s)'] || detailCards['engines'] || '';
    if (engineText) {
      const engineTsoh =
        engineText.match(/\b(?:engine\s*\d+\s*)?(?:tsoh|smoh|tsmoh)\b[^0-9]*([\d,:.]+)/i) ||
        engineText.match(/\boverhaul\b[^0-9]*([\d,:.]+)\s*(?:hrs?|hours?)?/i);
      if (engineTsoh) {
        const parsed = parseHours(engineTsoh[1]);
        if (parsed !== null) {
          payload.engine_time_since_overhaul = parsed;
          payload.time_since_overhaul = parsed;
          extractionSignals.engine_time_since_overhaul = extractionSignals.engine_time_since_overhaul || 'engines_card';
        }
      }
    }
  }

  const propTime = firstSpec(specs, ['prop 1 time', 'prop time', 'spoh', 'tspoh', 'time since prop overhaul']);
  if (propTime) {
    const parsed = parseHours(propTime);
    if (parsed !== null) {
      payload.time_since_prop_overhaul = parsed;
      extractionSignals.time_since_prop_overhaul = 'spec_label';
    }
  }
  if (!payload.time_since_prop_overhaul) {
    const propText = detailCards['prop details'] || detailCards['prop'] || '';
    if (propText) {
      const propTsOh =
        propText.match(/\b(?:tsoh|spoh|tspoh)\b[^0-9]*([\d,:.]+)\s*(?:hrs?|hours?)?/i) ||
        propText.match(/\btime since prop(?:eller)? overhaul\b[^0-9]*([\d,:.]+)/i);
      if (propTsOh) {
        payload.time_since_prop_overhaul = parseHours(propTsOh[1]);
        if (payload.time_since_prop_overhaul != null) {
          extractionSignals.time_since_prop_overhaul = extractionSignals.time_since_prop_overhaul || 'prop_card';
        }
      }
    }
  }

  const bodyRows = Array.from(document.querySelectorAll('tr, li, .spec-item, .details-row'));
  for (const row of bodyRows) {
    const raw = String(row.textContent || '').replace(/\s+/g, ' ').trim();
    if (!raw) continue;
    specsTextPairs.push(raw);
    if (!payload.serial_number) {
      const serialMatch = raw.match(/\bserial(?:\s*number)?\b[:\s#-]*([a-z0-9\-\/]{3,})/i);
      if (serialMatch) {
        payload.serial_number = serialMatch[1].toUpperCase();
        extractionSignals.serial_number = extractionSignals.serial_number || 'body_text_serial';
      }
    }
    if (!payload.serial_number) {
      const snMatch = raw.match(/\bS\/?N\b[:\s#-]*([A-Z0-9\-\/]{3,})/i);
      if (snMatch) {
        payload.serial_number = snMatch[1].toUpperCase();
        extractionSignals.serial_number = extractionSignals.serial_number || 'body_text_sn';
      }
    }
    if (!payload.registration_raw) {
      const regToken = extractRegistrationToken(raw);
      if (regToken) {
        payload.registration_raw = regToken;
        extractionSignals.registration_raw = extractionSignals.registration_raw || 'body_text_registration';
      }
    }
    if (!payload.total_time_airframe) {
      const ttMatch = raw.match(/\b(?:ttaf|tt|total time)\b[:\s]*([\d,]+(?:\.\d+)?)/i);
      if (ttMatch) payload.total_time_airframe = parseHours(ttMatch[1]);
      if (ttMatch && payload.total_time_airframe != null) {
        extractionSignals.total_time_airframe = extractionSignals.total_time_airframe || 'body_text_tt';
      }
    }
    if (!payload.engine_time_since_overhaul) {
      const smohMatch = raw.match(/\b(?:smoh|tsmoh|engine time since overhaul)\b[:\s]*([\d,]+(?:\.\d+)?)/i);
      if (smohMatch) {
        const parsed = parseHours(smohMatch[1]);
        if (parsed !== null) {
          payload.engine_time_since_overhaul = parsed;
          payload.time_since_overhaul = parsed;
          extractionSignals.engine_time_since_overhaul = extractionSignals.engine_time_since_overhaul || 'body_text_smoh';
        }
      }
    }
    if (!payload.engine_time_since_overhaul) {
      const tsohMatch = raw.match(/\b(?:tsoh|overhaul)\b[^0-9]*([\d,:.]+)\s*(?:hrs?|hours?)?/i);
      if (tsohMatch) {
        const parsed = parseHours(tsohMatch[1]);
        if (parsed !== null) {
          payload.engine_time_since_overhaul = parsed;
          payload.time_since_overhaul = parsed;
          extractionSignals.engine_time_since_overhaul = extractionSignals.engine_time_since_overhaul || 'body_text_tsoh';
        }
      }
    }
    if (!payload.time_since_prop_overhaul) {
      const spohMatch =
        raw.match(/\b(?:spoh|tspoh|prop(?:eller)? time since overhaul)\b[:\s]*([\d,:.]+)/i) ||
        raw.match(/\b(?:tsoh)\s+prop(?:eller)?\b[:\s]*([\d,:.]+)/i);
      if (spohMatch) payload.time_since_prop_overhaul = parseHours(spohMatch[1]);
      if (spohMatch && payload.time_since_prop_overhaul != null) {
        extractionSignals.time_since_prop_overhaul = extractionSignals.time_since_prop_overhaul || 'body_text_spoh';
      }
    }
  }

  if (specsTextPairs.length) payload.specs_text = specsTextPairs.slice(0, 120).join(' | ');
  if (Object.keys(extractionSignals).length) payload._extraction_signals = extractionSignals;
  payload._detail_extracted_at = new Date().toISOString();
  payload.url = payload.url || window.location.href;
  return { challengeDetected: false, listing: payload };
}

function extractCardsNow() {
  const challenge = challengeSignals();
  if (challenge.challengeDetected) return { challengeDetected: true, listings: [], meta: { pageTitle: challenge.pageTitle || '' } };

  const totals = parseListingsTotals();
  const cards = Array.from(document.querySelectorAll('div.list-item.result-container, div.result-container.list-item'));
  const anchors = Array.from(document.querySelectorAll("a.result-title, a[href*='/listing-detail/aircraft-for-sale/']"));
  const uniqueById = new Set();
  const rows = [];
  let selectorUsed = cards.length ? 'result_cards' : 'listing_anchors';

  const candidates = cards.length
    ? cards
        .map((card) => ({ card, a: card.querySelector("a.result-title, a[href*='/listing-detail/aircraft-for-sale/']") }))
        .filter((x) => !!x.a)
    : anchors.map((a) => ({ card: a.closest('div.list-item.result-container, div.result-container.list-item, li, article, div') || a.parentElement, a }));

  for (const candidate of candidates) {
    const card = candidate.card;
    const a = candidate.a;
    if (!a) continue;
    const href = a.getAttribute('href') || '';
    const url = abs(href);
    if (!url) continue;
    const sid = sourceIdFromUrl(url);
    if (!sid) continue;
    if (uniqueById.has(sid)) continue;
    uniqueById.add(sid);

    const title = String(a.textContent || '').replace(/\s+/g, ' ').trim();
    const yearMatch = title.match(/\b(19|20)\d{2}\b/);
    const year = yearMatch ? parseInt(yearMatch[0], 10) : parseIntSafe(card?.getAttribute('data-year'));
    const price = parseIntSafe(card?.getAttribute('data-price') || card?.querySelector('[class*="price"]')?.textContent);
    let total = parseIntSafe(card?.getAttribute('data-totaltime'));
    const seller = card?.querySelector('a[href*="/listings-by-seller/"]')?.textContent?.trim() || null;
    const locationRaw = card?.querySelector('div.result-broker-notes, div[class*=broker], [class*=location]')?.textContent?.trim() || null;
    const [locationCity, locationState] = splitLoc(locationRaw);
    const img = card?.querySelector('img');
    const primaryImageUrl = abs(img?.getAttribute('src') || img?.getAttribute('data-src'));
    const cardText = String(card?.textContent || '').replace(/\s+/g, ' ').trim();
    let registrationRaw = extractRegistrationToken(cardText);
    const extractionSignals = {};

    let serialNumber = null;
    const serialMatch = cardText.match(/\bserial(?:\s*number)?\b[:\s#-]*([a-z0-9\-\/]{3,})/i);
    if (serialMatch) {
      serialNumber = serialMatch[1].toUpperCase();
      extractionSignals.serial_number = 'card_text_serial';
    }
    if (!serialNumber) {
      const snMatch = cardText.match(/\bSN[:\s#-]*([A-Z0-9\-\/]{3,})\b/i);
      if (snMatch) {
        serialNumber = snMatch[1].toUpperCase();
        extractionSignals.serial_number = extractionSignals.serial_number || 'card_text_sn';
      }
    }

    // GlobalAir embeds reliable serial/registration in quick-contact button attributes.
    const quickContact = card?.querySelector('button.quick-contact[data-rn], button.quick-contact[data-sn], button[data-rn], button[data-sn]');
    if (quickContact) {
      const rn = String(quickContact.getAttribute('data-rn') || '').trim().toUpperCase();
      const sn = String(quickContact.getAttribute('data-sn') || '').trim().toUpperCase();
      if (rn && !registrationRaw) {
        registrationRaw = rn;
        extractionSignals.registration_raw = 'quick_contact_attr';
      }
      if (sn && !serialNumber) {
        serialNumber = sn;
        extractionSignals.serial_number = extractionSignals.serial_number || 'quick_contact_attr';
      }
    }

    if (total === null) {
      const ttText = cardText.match(/\bTT\b[:\s]*([\d,]+(?:\.\d+)?)/i) || cardText.match(/\bTotal Time\b[:\s]*([\d,]+(?:\.\d+)?)/i);
      if (ttText) {
        total = parseHours(ttText[1]);
        if (total != null) extractionSignals.total_time_airframe = 'card_text_tt';
      }
    }

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
      location_raw: locationRaw,
      location_city: locationCity,
      location_state: locationState,
      state: locationState,
      registration_raw: registrationRaw,
      serial_number: serialNumber,
      _extraction_signals: extractionSignals,
      primary_image_url: primaryImageUrl,
      image_urls: primaryImageUrl ? [primaryImageUrl] : null,
      _page_url: window.location.href,
      _extracted_at: new Date().toISOString(),
    });
  }

  if (!rows.length && anchors.length > 0) selectorUsed = 'anchors_no_valid_ids';
  const maybeBlocked = challengeSignals();
  if (!rows.length && maybeBlocked.challengeDetected) {
    return {
      challengeDetected: true,
      listings: [],
      meta: {
        pageTitle: maybeBlocked.pageTitle || '',
        selectorUsed,
        candidateAnchors: anchors.length,
        totalListings: totals.totalListings,
        rangeStart: totals.rangeStart,
        rangeEnd: totals.rangeEnd,
      },
    };
  }

  return {
    challengeDetected: false,
    listings: rows,
    meta: {
      pageTitle: document.title || '',
      selectorUsed,
      candidateAnchors: anchors.length,
      parsedRows: rows.length,
      wrapperCards: cards.length,
      totalListings: totals.totalListings || rows.length,
      rangeStart: totals.rangeStart || (rows.length ? 1 : 0),
      rangeEnd: totals.rangeEnd || rows.length,
    },
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'EXTRACT_CARDS') {
    expandLoadMore()
      .then(() => {
        const result = extractCardsNow();
        if (result.challengeDetected) {
          sendResponse({ success: false, challengeDetected: true, listings: [], count: 0, meta: result.meta || {} });
        } else {
          sendResponse({
            success: true,
            challengeDetected: false,
            listings: result.listings,
            count: result.listings.length,
            meta: result.meta || {},
          });
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
    if (result.challengeDetected) {
      sendResponse({ success: false, challengeDetected: true, listing: null });
    } else {
      sendResponse({ success: true, challengeDetected: false, listing: result.listing });
    }
    return true;
  }
  sendResponse({ success: false, error: 'Unknown action' });
  return true;
});
