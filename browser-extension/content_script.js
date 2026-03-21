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
  const value = String(url || '');
  const listingMatch = value.match(/\/listing\/[^/]+\/[^/]+\/[^/]+\/[^/]+\/(\d+)(?:\/|$)/i);
  if (listingMatch) return listingMatch[1];
  const listingAlt = value.match(/\/listings\/[^/]+\/[^/]+\/[^/]+\/[^/]+\/(\d+)(?:\/|$)/i);
  if (listingAlt) return listingAlt[1];
  const anySegment = value.match(/\/(\d{5,})(?:\/|$)/);
  if (anySegment) return anySegment[1];
  try {
    const u = new URL(value, 'https://www.controller.com');
    const qp = u.searchParams.get('id') || u.searchParams.get('listingId');
    if (qp && /^\d{4,}$/.test(qp)) return qp;
  } catch {
    // ignore
  }
  return null;
}

function splitCityState(text) {
  const v = String(text || '').trim();
  if (!v) return [null, null];
  const parts = v.split(',').map((x) => x.trim());
  if (parts.length >= 2) return [parts[0], parts[1].slice(0, 2).toUpperCase()];
  return [v, null];
}

function extractRegistrationToken(text) {
  const value = String(text || '');
  if (!value.trim()) return null;
  const label = value.match(/\b(?:registration|reg(?:istration)?|tail(?:\s*number)?|n[\s\-]*number)\b\s*[#:\-]?\s*([A-Z0-9\-]{2,12})\b/i);
  if (label && label[1]) return label[1].toUpperCase();
  const us = value.match(/\bN[0-9]{1,5}[A-HJ-NP-Z]{0,2}\b/i);
  if (us && us[0]) return us[0].toUpperCase();
  const generic = value.match(/\b([A-Z]{1,2}-[A-Z0-9]{3,5})\b/i);
  if (generic && generic[1]) return generic[1].toUpperCase();
  return null;
}

function challengeSignals() {
  const text = String((document.body && document.body.innerText) || '').toLowerCase();
  const title = String(document.title || '').toLowerCase();
  const url = String(window.location.href || '').toLowerCase();
  const strongTokens = [
    'captcha',
    'verify you are human',
    'checking your browser',
    'attention required',
    'cloudflare',
    'pardon our interruption',
    'made us think you were a bot',
    'distil',
    'reese',
    '/cdn-cgi/challenge-platform',
  ];
  const weakTokens = [
    'security check',
    'unusual traffic',
    'access denied',
    'request blocked',
    'enable javascript and cookies',
  ];
  const matchedStrong = strongTokens.filter((token) => text.includes(token) || title.includes(token) || url.includes(token));
  const matchedWeak = weakTokens.filter((token) => text.includes(token) || title.includes(token) || url.includes(token));
  const domChallengeSelectors = [
    'iframe[src*="captcha"]',
    'iframe[src*="challenge"]',
    '[id*="captcha"]',
    '[class*="captcha"]',
    '[id*="challenge"]',
    '[class*="challenge"]',
    '#cf-challenge-running',
    '[data-cf-beacon]',
  ];
  const domChallengeHits = domChallengeSelectors.filter((selector) => document.querySelector(selector));
  const likelyListingsPage = /controller\.com\/listings\//i.test(url) || /for sale|listings/i.test(title);
  const hasExpectedListings = document.querySelectorAll('a[href*="/listing/"], a[href*="/listings/"], article, .listing-row').length > 0;
  const suspiciousMissingListings = likelyListingsPage && !hasExpectedListings;
  const blockLike =
    matchedStrong.length > 0
    || domChallengeHits.length > 0
    || (matchedWeak.length > 0 && suspiciousMissingListings)
    || title.includes('pardon our interruption')
    || (text.includes('to regain access') && text.includes('cookies and javascript'))
    || text.includes('browser made us think you were a bot');
  return {
    challengeDetected: blockLike,
    indicators: [...matchedStrong, ...matchedWeak, ...domChallengeHits.map((s) => `dom:${s}`)],
    currentUrl: window.location.href,
    pageTitle: document.title || '',
  };
}

async function humanScroll() {
  const steps = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < steps; i += 1) {
    const delta = 160 + Math.floor(Math.random() * 520);
    window.scrollBy({ top: delta, behavior: 'smooth' });
    await new Promise((resolve) => setTimeout(resolve, 250 + Math.floor(Math.random() * 600)));
  }
}

function textOrNull(selector) {
  const v = document.querySelector(selector)?.textContent || '';
  const s = String(v).trim();
  return s || null;
}

function normalizeLabel(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*:\s*$/, '')
    .trim();
}

function parseYesNo(value) {
  const s = String(value || '').trim().toLowerCase();
  if (!s) return null;
  if (['yes', 'y', 'true'].includes(s)) return true;
  if (['no', 'n', 'false'].includes(s)) return false;
  return null;
}

function firstSpec(specMap, ...labels) {
  for (const label of labels) {
    const key = normalizeLabel(label);
    const val = specMap[key];
    if (val !== undefined && val !== null && String(val).trim()) {
      return String(val).trim();
    }
  }
  return null;
}

function parseGroupedSpecs() {
  const groups = {};
  const flat = {};
  const allPairsText = [];

  const headings = Array.from(document.querySelectorAll('h3.detail__specs-heading'));
  for (const heading of headings) {
    const groupName = String(heading.textContent || '').trim();
    if (!groupName) continue;
    const wrapper = heading.nextElementSibling;
    if (!wrapper || !wrapper.classList?.contains('detail__specs-wrapper')) continue;
    if (!groups[groupName]) groups[groupName] = {};

    const labels = Array.from(wrapper.querySelectorAll('div.detail__specs-label'));
    for (const labelEl of labels) {
      const rawLabel = String(labelEl.textContent || '').trim().replace(/:\s*$/, '');
      if (!rawLabel) continue;
      const valueEl = labelEl.nextElementSibling;
      if (!valueEl || !valueEl.classList?.contains('detail__specs-value')) continue;
      const rawValue = String(valueEl.innerText || valueEl.textContent || '').replace(/\s+/g, ' ').trim();
      if (!rawValue) continue;
      groups[groupName][rawLabel] = rawValue;
      const normalized = normalizeLabel(rawLabel);
      if (!(normalized in flat)) {
        flat[normalized] = rawValue;
      }
      allPairsText.push(`${rawLabel}: ${rawValue}`);
    }
  }

  // Fallback path: page has labels but headings were not captured.
  if (!Object.keys(flat).length) {
    const labels = Array.from(document.querySelectorAll('div.detail__specs-label'));
    for (const labelEl of labels) {
      const rawLabel = String(labelEl.textContent || '').trim().replace(/:\s*$/, '');
      if (!rawLabel) continue;
      const valueEl = labelEl.nextElementSibling;
      if (!valueEl || !valueEl.classList?.contains('detail__specs-value')) continue;
      const rawValue = String(valueEl.innerText || valueEl.textContent || '').replace(/\s+/g, ' ').trim();
      if (!rawValue) continue;
      const normalized = normalizeLabel(rawLabel);
      if (!(normalized in flat)) {
        flat[normalized] = rawValue;
      }
      allPairsText.push(`${rawLabel}: ${rawValue}`);
    }
  }

  return { groups, flat, allPairsText };
}

function parseListingsTotals() {
  const candidates = [
    textOrNull('.list-listings-count'),
    textOrNull('.listings-count'),
    textOrNull('[class*="listings-count"]'),
    textOrNull('[class*="results-count"]'),
    textOrNull('h1'),
    String((document.body && document.body.innerText) || '').slice(0, 8000),
  ].filter(Boolean);

  let rangeStart = 0;
  let rangeEnd = 0;
  let totalListings = 0;

  for (const text of candidates) {
    const normalized = String(text).replace(/\s+/g, ' ').trim();
    const totalMatch = normalized.match(/of\s+([\d,]+)\s+listings?/i);
    if (totalMatch) {
      totalListings = parseInt(totalMatch[1].replace(/,/g, ''), 10) || totalListings;
    }
    const rangeMatch = normalized.match(/([\d,]+)\s*-\s*([\d,]+)\s*of\s*[\d,]+\s*listings?/i);
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
  const h1 = textOrNull('h1');
  if (h1) payload.title = h1;

  const description =
    textOrNull('[data-testid*="description"]') ||
    textOrNull('.description') ||
    textOrNull('.listing-description') ||
    textOrNull('#Description') ||
    textOrNull('section[class*="description"]');
  if (description) {
    payload.description_full = description;
    if (!payload.description) payload.description = description;
  }

  const priceText =
    textOrNull('[class*="price"]') ||
    textOrNull('.price') ||
    textOrNull('.price-contain');
  const price = parsePrice(priceText);
  if (price) {
    payload.price_asking = price;
    payload.asking_price = price;
  }

  const locationText =
    textOrNull('[class*="location"]') ||
    textOrNull('.location') ||
    textOrNull('span.location-span');
  if (locationText) {
    const [city, st] = splitCityState(locationText);
    payload.location_raw = locationText;
    payload.location_city = city;
    payload.location_state = st;
    payload.state = st;
  }

  const specData = parseGroupedSpecs();
  if (Object.keys(specData.groups).length) {
    payload.controller_specs_groups = specData.groups;
  }
  if (Object.keys(specData.flat).length) {
    payload.controller_specs_flat = specData.flat;
  }

  const detailRows = Array.from(document.querySelectorAll('tr, .spec-item, .details-row, li'));
  const specsCollected = [...specData.allPairsText];
  let registrationRaw =
    firstSpec(specData.flat, 'Registration #', 'Registration', 'Tail Number', 'N-Number') ||
    null;

  // Map high-value normalized fields.
  const yearText = firstSpec(specData.flat, 'Year');
  if (yearText && !payload.year) {
    const parsed = parseInt(yearText, 10);
    if (Number.isFinite(parsed)) payload.year = parsed;
  }
  const manufacturer = firstSpec(specData.flat, 'Manufacturer');
  if (manufacturer && !payload.make) payload.make = manufacturer;
  const model = firstSpec(specData.flat, 'Model');
  if (model && !payload.model) payload.model = model;
  const serial = firstSpec(specData.flat, 'Serial Number');
  if (serial && !payload.serial_number) payload.serial_number = serial;
  const generalDescription = firstSpec(specData.flat, 'Description');
  if (generalDescription && !payload.description) payload.description = generalDescription;
  const basedAt = firstSpec(specData.flat, 'Based at');
  if (basedAt) payload.based_at = basedAt;
  const flightRules = firstSpec(specData.flat, 'FlightRules', 'Flight Rules');
  if (flightRules) payload.flight_rules = flightRules;
  const condition = firstSpec(specData.flat, 'Condition');
  if (condition) payload.listing_condition = condition;
  const inspection = firstSpec(specData.flat, 'Inspection Status');
  if (inspection) payload.inspection_status = inspection;

  const totalTimeText = firstSpec(specData.flat, 'Total Time');
  if (totalTimeText && !payload.total_time_airframe) {
    const ttHours = parseHours(totalTimeText);
    if (ttHours !== null) payload.total_time_airframe = ttHours;
  }
  const completeLogs = parseYesNo(firstSpec(specData.flat, 'Complete Logs'));
  if (completeLogs !== null) payload.complete_logs = completeLogs;

  const engine1Model = firstSpec(specData.flat, 'Engine 1 Make/Model', 'Engine Make/Model', 'Engine Model');
  if (engine1Model) {
    payload.engine_1_model = engine1Model;
    if (!payload.engine_model) payload.engine_model = engine1Model;
  }
  const engine1TimeText = firstSpec(specData.flat, 'Engine 1 Time', 'Engine Time');
  if (engine1TimeText) {
    payload.engine_1_time_text = engine1TimeText;
    const hours = parseHours(engine1TimeText);
    if (hours !== null) {
      payload.engine_1_time_hours = hours;
      if (!payload.engine_time_since_overhaul) payload.engine_time_since_overhaul = hours;
    }
  }
  const engine1TboText = firstSpec(specData.flat, 'Engine 1 TBO', 'Engine TBO');
  if (engine1TboText) {
    const hours = parseHours(engine1TboText);
    if (hours !== null) {
      payload.engine_1_tbo_hours = hours;
      if (!payload.engine_tbo_hours) payload.engine_tbo_hours = hours;
    }
  }
  const engine1Notes = firstSpec(specData.flat, 'Engine 1 Notes', 'Engine Notes');
  if (engine1Notes) {
    payload.engine_1_notes = engine1Notes;
    if (!payload.engine_notes) payload.engine_notes = engine1Notes;
  }

  const engine2Model = firstSpec(specData.flat, 'Engine 2 Make/Model');
  if (engine2Model) payload.engine_2_model = engine2Model;
  const engine2TimeText = firstSpec(specData.flat, 'Engine 2 Time');
  if (engine2TimeText) {
    payload.engine_2_time_text = engine2TimeText;
    const hours = parseHours(engine2TimeText);
    if (hours !== null) payload.engine_2_time_hours = hours;
  }
  const engine2TboText = firstSpec(specData.flat, 'Engine 2 TBO');
  if (engine2TboText) {
    const hours = parseHours(engine2TboText);
    if (hours !== null) payload.engine_2_tbo_hours = hours;
  }
  const engine2Notes = firstSpec(specData.flat, 'Engine 2 Notes');
  if (engine2Notes) payload.engine_2_notes = engine2Notes;

  const prop1Mfr = firstSpec(specData.flat, 'Prop 1 Manufacturer', 'Prop Manufacturer');
  if (prop1Mfr) payload.prop_1_manufacturer = prop1Mfr;
  const prop1Model = firstSpec(specData.flat, 'Prop 1 Model', 'Prop Model');
  if (prop1Model) {
    payload.prop_1_model = prop1Model;
    if (!payload.prop_model) payload.prop_model = prop1Model;
  }
  const prop1TimeText = firstSpec(specData.flat, 'Prop 1 Time', 'Prop Time');
  if (prop1TimeText) {
    payload.prop_1_time_text = prop1TimeText;
    const hours = parseHours(prop1TimeText);
    if (hours !== null) {
      payload.prop_1_time_hours = hours;
      if (!payload.time_since_prop_overhaul) payload.time_since_prop_overhaul = hours;
    }
  }
  const prop2Mfr = firstSpec(specData.flat, 'Prop 2 Manufacturer');
  if (prop2Mfr) payload.prop_2_manufacturer = prop2Mfr;
  const prop2Model = firstSpec(specData.flat, 'Prop 2 Model');
  if (prop2Model) payload.prop_2_model = prop2Model;
  const prop2TimeText = firstSpec(specData.flat, 'Prop 2 Time');
  if (prop2TimeText) {
    payload.prop_2_time_text = prop2TimeText;
    const hours = parseHours(prop2TimeText);
    if (hours !== null) payload.prop_2_time_hours = hours;
  }
  const propBladesText = firstSpec(specData.flat, 'Number of Blades');
  if (propBladesText) {
    const blades = parseHours(propBladesText);
    if (blades !== null) payload.prop_blade_count = blades;
  }
  const propNotes = firstSpec(specData.flat, 'Prop Notes');
  if (propNotes) payload.prop_notes = propNotes;

  const avionicsFlightDeck = firstSpec(specData.flat, 'Flight Deck Manufacturer/Model');
  if (avionicsFlightDeck) payload.avionics_flight_deck = avionicsFlightDeck;
  const avionicsText = firstSpec(specData.flat, 'Avionics/Radios', 'Avionics');
  if (avionicsText && !payload.avionics_description) payload.avionics_description = avionicsText;
  const waas = parseYesNo(firstSpec(specData.flat, 'WAAS'));
  if (waas !== null) payload.avionics_waas = waas;
  const svt = parseYesNo(firstSpec(specData.flat, 'SVT'));
  if (svt !== null) payload.avionics_svt = svt;
  const activeTraffic = parseYesNo(firstSpec(specData.flat, 'Active Traffic'));
  if (activeTraffic !== null) payload.avionics_active_traffic = activeTraffic;
  const terrainWarning = parseYesNo(firstSpec(specData.flat, 'Terrain Warning System'));
  if (terrainWarning !== null) payload.avionics_terrain_warning = terrainWarning;

  const oxygen = parseYesNo(firstSpec(specData.flat, 'Oxygen System'));
  if (oxygen !== null) payload.oxygen_system = oxygen;
  const fiki = parseYesNo(firstSpec(specData.flat, 'Flight Into Known Icing (FIKI)'));
  if (fiki !== null) payload.flight_into_known_icing = fiki;
  const inadvertentIce = parseYesNo(firstSpec(specData.flat, 'Inadvertent Ice Protection'));
  if (inadvertentIce !== null) payload.inadvertent_ice_protection = inadvertentIce;
  const hasAc = parseYesNo(firstSpec(specData.flat, 'A/C'));
  if (hasAc !== null) payload.has_air_conditioning = hasAc;
  const addlEq = firstSpec(specData.flat, 'Additional Equipment');
  if (addlEq) payload.additional_equipment_text = addlEq;

  const yearPaintedText = firstSpec(specData.flat, 'Year Painted');
  if (yearPaintedText) {
    const value = parseInt(yearPaintedText, 10);
    if (Number.isFinite(value)) payload.year_painted = value;
  }
  const yearInteriorText = firstSpec(specData.flat, 'Year Interior');
  if (yearInteriorText) {
    const value = parseInt(yearInteriorText, 10);
    if (Number.isFinite(value)) payload.year_interior = value;
  }
  const interiorConfig = firstSpec(specData.flat, 'Configuration');
  if (interiorConfig) payload.interior_configuration = interiorConfig;
  const interiorNotes = firstSpec(specData.flat, 'Interior Notes');
  if (interiorNotes && !payload.interior_notes) payload.interior_notes = interiorNotes;
  const seatsText = firstSpec(specData.flat, 'Number of Seats');
  if (seatsText && !payload.num_seats) {
    const value = parseHours(seatsText);
    if (value !== null) payload.num_seats = value;
  }

  for (const row of detailRows) {
    const raw = String(row.textContent || '').replace(/\s+/g, ' ').trim();
    if (!raw) continue;
    specsCollected.push(raw);
    if (!payload.total_time_airframe) {
      const tt = raw.match(/(?:ttaf|tt|total time)[:\s]*([\d,]+)/i);
      if (tt) payload.total_time_airframe = parseHours(tt[1]);
    }
    if (!payload.year) {
      const year = raw.match(/\b(19|20)\d{2}\b/);
      if (year) payload.year = parseInt(year[0], 10);
    }
    if (!payload.n_number) {
      const tail = raw.match(/\bN[0-9A-Z]{1,6}\b/i);
      if (tail) payload.n_number = tail[0].toUpperCase();
    }
    if (!registrationRaw) {
      registrationRaw = extractRegistrationToken(raw);
    }
  }

  if (!registrationRaw) {
    registrationRaw = extractRegistrationToken(
      [
        textOrNull('[class*="spec"]'),
        textOrNull('[class*="details"]'),
        textOrNull('[class*="listing-details"]'),
        textOrNull('body'),
      ]
        .filter(Boolean)
        .join(' ')
    );
  }
  if (registrationRaw) {
    payload.registration_raw = registrationRaw;
  }
  if (specsCollected.length) {
    payload.specs_text = specsCollected.slice(0, 80).join(' | ');
  }

  payload._detail_extracted_at = new Date().toISOString();
  payload.url = payload.url || window.location.href;
  return { challengeDetected: false, listing: payload };
}

function extractCards() {
  const challenge = challengeSignals();
  if (challenge.challengeDetected) return { challengeDetected: true, listings: [], meta: { pageTitle: challenge.pageTitle || '' } };
  const totals = parseListingsTotals();

  const cards = Array.from(document.querySelectorAll('div.list-listing-card-wrapper, article.search-card, [data-testid*="listing-card"], [class*="listing-card"], [data-testid*="result-card"]'));
  const anchorSelector = [
    "a[href*='/listing/']",
    "a[href*='/listings/']",
    "a[href*='/for-sale/']",
    "a[title*='View Details' i]",
    "a[aria-label*='details' i]",
  ].join(', ');
  const anchors = Array.from(document.querySelectorAll(anchorSelector));
  const uniqueById = new Set();
  const rows = [];
  let selectorUsed = cards.length ? 'card_containers' : 'listing_anchors';
  const candidates = cards.length
    ? cards.map((card) => ({
        card,
        a: card.querySelector(anchorSelector),
      })).filter((x) => !!x.a)
    : anchors.map((a) => {
        const card = a.closest('div.list-listing-card-wrapper, article.search-card, [data-testid*="listing-card"], [class*="listing-card"], li, article, div');
        return { card: card || a.parentElement, a };
      });

  for (const candidate of candidates) {
    const card = candidate.card;
    const a = candidate.a;
    if (!a) continue;
    const href = a.getAttribute('href') || '';
    const url = href.startsWith('http') ? href : `https://www.controller.com${href}`;
    const sid = sourceIdFromUrl(url);
    if (!sid) continue;
    if (uniqueById.has(sid)) continue;
    uniqueById.add(sid);
    const title = (a.getAttribute('title') || a.textContent || '').trim();
    const yearMatch = title.match(/\b(19|20)\d{2}\b/);
    const year = yearMatch ? parseInt(yearMatch[0], 10) : null;
    const priceText = (card?.querySelector('.price, .price-contain, [class*="price"]')?.textContent || '').trim();
    const price = parsePrice(priceText);
    const specsText = card?.querySelector('div.specs-container, [class*="spec"]')?.textContent || '';
    const tt = parseHours((specsText.match(/(?:TT|TTAF|Total Time)[:\s]*([\d,]+)/i) || [])[1]);
    const locText = (card?.querySelector('span.location-span, div.location, [class*=location]')?.textContent || '').trim();
    const [location_city, location_state] = splitCityState(locText);
    const img = card?.querySelector('img');
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

  if (!rows.length && anchors.length > 0) {
    selectorUsed = 'anchors_no_valid_ids';
  }

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
      totalListings: totals.totalListings,
      rangeStart: totals.rangeStart,
      rangeEnd: totals.rangeEnd,
    },
  };
}

function normalizeDiscoveredMake(value) {
  const cleaned = String(value || '')
    .replace(/\s*\([\d,]+\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  const banned = new Set([
    'all makes',
    'all manufacturers',
    'aircraft',
    'aircraft for sale',
    'show all',
    'search',
    'more',
    'filter',
    'filters',
  ]);
  if (banned.has(cleaned.toLowerCase())) return null;
  if (!/^[a-z0-9][a-z0-9 '&\-/.]{1,39}$/i.test(cleaned)) return null;
  return cleaned;
}

function discoverControllerMakes() {
  const challenge = challengeSignals();
  if (challenge.challengeDetected) {
    return { success: false, challengeDetected: true, makes: [], meta: { pageTitle: challenge.pageTitle || '' } };
  }

  const seen = new Map();
  const addMake = (raw) => {
    const normalized = normalizeDiscoveredMake(raw);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (!seen.has(key)) seen.set(key, normalized);
  };

  const makeOptions = document.querySelectorAll(
    'select[name*="make" i] option, select[id*="make" i] option, select[name*="manufacturer" i] option, select[id*="manufacturer" i] option'
  );
  for (const opt of makeOptions) {
    addMake(opt.textContent || '');
  }

  const manufacturerScopedNodes = document.querySelectorAll(
    '[id*="manufacturer" i] a, [class*="manufacturer" i] a, [data-testid*="manufacturer" i] a, [aria-label*="manufacturer" i] a, [id*="manufacturer" i] label, [class*="manufacturer" i] label'
  );
  for (const node of manufacturerScopedNodes) {
    addMake(node.textContent || '');
  }

  const keywordAnchors = document.querySelectorAll("a[href*='keywords=']");
  for (const anchor of keywordAnchors) {
    try {
      const url = new URL(anchor.href, window.location.origin);
      const keyword = String(url.searchParams.get('keywords') || '').trim();
      if (keyword) addMake(keyword);
    } catch {
      // ignore malformed URLs
    }
  }

  const titleAnchors = document.querySelectorAll("a[href*='/listing/'], a[href*='/listings/']");
  for (const anchor of titleAnchors) {
    const title = String(anchor.textContent || '').replace(/\s+/g, ' ').trim();
    const m = title.match(/^(?:19|20)\d{2}\s+([A-Za-z][A-Za-z0-9&'\-/.]{1,30})\b/);
    if (m && m[1]) addMake(m[1]);
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
      anchors: document.querySelectorAll('a[href]').length,
      makeOptions: makeOptions.length,
    },
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'EXTRACT_CARDS') {
    const result = extractCards();
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
  } else if (message.action === 'CHECK_CHALLENGE') {
    sendResponse({ success: true, ...challengeSignals() });
  } else if (message.action === 'HUMAN_SCROLL') {
    humanScroll().then(() => sendResponse({ success: true })).catch(() => sendResponse({ success: false }));
    return true;
  } else if (message.action === 'EXTRACT_DETAIL') {
    const result = extractDetail(message.listing || {});
    if (result.challengeDetected) {
      sendResponse({ success: false, challengeDetected: true, listing: null });
    } else {
      sendResponse({ success: true, challengeDetected: false, listing: result.listing });
    }
  } else if (message.action === 'DISCOVER_CONTROLLER_MAKES') {
    const result = discoverControllerMakes();
    sendResponse(result);
  } else {
    sendResponse({ success: false, error: 'Unknown action' });
  }
  return true;
});
