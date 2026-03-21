'use strict';

const BRIDGE_URL = 'http://localhost:8765';
const STATE_KEY = 'unifiedHarvestState';
const BLOCK_COOLDOWN_MS = 30 * 60 * 1000;

const SAFE_TIMING = {
  pageDwellMs: [2200, 4800],
  betweenPagesMs: [2600, 5200],
  betweenMakesMs: [4200, 9000],
  betweenSourcesMs: [2200, 4800],
  retryDelayMs: [1800, 3600],
  detailDwellMs: [2200, 4200],
  betweenDetailsMs: [1200, 2600],
};
const GLOBALAIR_CATEGORY_LISTING_SENTINEL = '__GLOBALAIR_CATEGORY_LISTING__';
const AEROTRADER_CURRENT_PAGE_SENTINEL = '__AEROTRADER_CURRENT_PAGE__';
const AEROTRADER_DEFAULT_ZIP = '83854';
const AEROTRADER_DEFAULT_RADIUS = '10000';

const CONTROLLER_CATEGORY_ROUTES = {
  'jet-aircraft': 3,
  'turboprop-aircraft': 8,
  'piston-single-aircraft': 6,
  'piston-twin-aircraft': 9,
  'light-sport-aircraft': 433,
  'experimental-homebuilt-aircraft': 2,
  'piston-agricultural-aircraft': 47,
  'turbine-agricultural-aircraft': 70,
  'piston-military-aircraft': 10004,
  'turbine-military-aircraft': 10072,
  'piston-amphibious-floatplanes': 1,
  'turbine-amphibious-floatplanes': 71,
  'piston-helicopters': 5,
  'turbine-helicopters': 7,
};

const TAP_CATEGORY_QUERY_MAP = {
  'single-engine-piston': { label: 'Single Engine Piston', categoryLevel1: ['Single Engine Piston'] },
  'multi-engine-piston': { label: 'Multi Engine Piston', categoryLevel1: ['Multi Engine Piston'] },
  turboprop: { label: 'Turboprop', categoryLevel1: ['Turboprop'] },
  jets: { label: 'Jets', categoryLevel1: ['Jets'] },
  helicopters: { label: 'Helicopters', categoryLevel1: ['Piston Helicopters', 'Turbine Helicopters'] },
  gyroplane: { label: 'Gyroplane', categoryLevel1: ['Gyroplane'] },
  'light-sport': { label: 'Light Sport', extraParams: { light_sport: 't' } },
  warbird: { label: 'Warbird', extraParams: { warbird: 't' } },
  'amphibious-float': { label: 'Amphibious/Float', extraParams: { amphibious: 't' } },
  'experimental-homebuilt': { label: 'Experimental/Homebuilt', extraParams: { homebuilt: 't' } },
};

const SOURCE_CONFIG = {
  controller: {
    key: 'controller',
    label: 'Controller',
    tabQuery: 'https://www.controller.com/*',
    bootUrl: 'https://www.controller.com',
    defaultMakes: ['Cessna', 'Piper', 'Beechcraft'],
    maxPagesPerMake: 20,
    makeUrl: (make, page = 1) =>
      page <= 1
        ? `https://www.controller.com/listings/search?keywords=${encodeURIComponent(make)}`
        : `https://www.controller.com/listings/search?page=${page}&keywords=${encodeURIComponent(make)}`,
    singlePassPerMake: false,
  },
  globalair: {
    key: 'globalair',
    label: 'GlobalAir',
    tabQuery: 'https://www.globalair.com/*',
    bootUrl: 'https://www.globalair.com/aircraft-for-sale',
    defaultMakes: ['Cessna 172', 'Cirrus Aircraft', 'Beechcraft'],
    maxPagesPerMake: 1,
    makeUrl: (make, page = 1) => {
      const slug = String(make || '')
        .toLowerCase()
        .replace(/\([^)]*\)/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      const base = `https://www.globalair.com/aircraft-for-sale/single-engine-piston/${slug}`;
      return page <= 1 ? base : `${base}?page=${page}`;
    },
    singlePassPerMake: true,
  },
  tap: {
    key: 'tap',
    label: 'TAP',
    tabQuery: 'https://www.trade-a-plane.com/*',
    bootUrl: 'https://www.trade-a-plane.com/search?s-type=aircraft',
    defaultMakes: ['Cessna', 'Piper', 'Beechcraft'],
    maxPagesPerMake: 20,
    makeUrl: (make, page = 1) => {
      const params = new URLSearchParams({ 's-type': 'aircraft', make: String(make || '').toUpperCase() });
      if (page > 1) params.set('s-page', String(page));
      return `https://www.trade-a-plane.com/search?${params.toString()}`;
    },
    singlePassPerMake: false,
  },
  aerotrader: {
    key: 'aerotrader',
    label: 'AeroTrader',
    tabQuery: 'https://www.aerotrader.com/*',
    bootUrl: `https://www.aerotrader.com/aircraft-for-sale?zip=${AEROTRADER_DEFAULT_ZIP}&radius=${AEROTRADER_DEFAULT_RADIUS}`,
    defaultMakes: ['Cessna', 'Piper', 'Beechcraft'],
    maxPagesPerMake: 20,
    makeUrl: (make, page = 1) => {
      const params = new URLSearchParams({
        make: String(make || ''),
        zip: String(state.aerotraderSearchZip || AEROTRADER_DEFAULT_ZIP),
        radius: String(state.aerotraderSearchRadius || AEROTRADER_DEFAULT_RADIUS),
      });
      if (page > 1) params.set('page', String(page));
      return `https://www.aerotrader.com/aircraft-for-sale?${params.toString()}`;
    },
    singlePassPerMake: false,
  },
};

function defaultSourceState(sourceKey, makes) {
  return {
    source: sourceKey,
    categories: [],
    currentCategory: null,
    currentCategoryIndex: 0,
    makes: Array.isArray(makes) && makes.length ? makes : [...(SOURCE_CONFIG[sourceKey]?.defaultMakes || [])],
    seedMakes: Array.isArray(makes) ? [...makes] : [],
    currentMake: null,
    currentMakeIndex: 0,
    currentPage: 1,
    noProgressCycles: 0,
    cooldownLevel: 0,
    detailDisabled: false,
    lastResultFingerprint: null,
    stagnantResultRepeats: 0,
    progressByMake: {},
    complete: false,
    blocked: false,
    blockedReason: null,
    blockedUntilMs: null,
    needsMakeDiscovery: false,
    warmedUp: false,
    seedPageUrl: null,
  };
}

function sanitizeGlobalAirCategory(value) {
  const raw = String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\-\s]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!raw) return 'single-engine-piston';

  // Keep backward compatibility with earlier popup values and common synonyms.
  const aliases = {
    'multi-engine-piston': 'twin-engine-piston',
    'twin-engine': 'twin-engine-piston',
    turboprop: 'single-engine-turbine',
    'single-engine-turboprop': 'single-engine-turbine',
    'twin-engine-turboprop': 'twin-engine-turbine',
    jets: 'private-jet',
    jet: 'private-jet',
    helicopters: 'helicopters',
    helicopter: 'helicopters',
    rotorcraft: 'helicopters',
  };
  const normalized = aliases[raw] || raw;
  const allowed = new Set([
    'single-engine-piston',
    'twin-engine-piston',
    'single-engine-turbine',
    'twin-engine-turbine',
    'private-jet',
    'helicopters',
    'amphibian',
    'commercial',
    'experimental-kit',
    'light-sport',
    'vintage',
    'warbird',
  ]);
  return allowed.has(normalized) ? normalized : 'single-engine-piston';
}

function sanitizeControllerCategory(value) {
  const raw = String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\-\s]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!raw) return 'piston-single-aircraft';
  return CONTROLLER_CATEGORY_ROUTES[raw] ? raw : 'piston-single-aircraft';
}

function sanitizeTapCategory(value) {
  const raw = String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\-\s]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!raw) return 'single-engine-piston';
  const aliases = {
    'piston-single': 'single-engine-piston',
    'piston-twin': 'multi-engine-piston',
    turbine: 'turboprop',
    'turbine-aircraft': 'turboprop',
    helicopter: 'helicopters',
    helicopters: 'helicopters',
    rotorcraft: 'helicopters',
    'piston-helicopters': 'helicopters',
    'turbine-helicopters': 'helicopters',
    experimental: 'experimental-homebuilt',
    homebuilt: 'experimental-homebuilt',
    'experimental-kit': 'experimental-homebuilt',
    'light-sport-aircraft': 'light-sport',
    amphibian: 'amphibious-float',
    amphibious: 'amphibious-float',
    float: 'amphibious-float',
  };
  const normalized = aliases[raw] || raw;
  return TAP_CATEGORY_QUERY_MAP[normalized] ? normalized : 'single-engine-piston';
}

function sanitizeAeroTraderSearchZip(value) {
  const digits = String(value || '').replace(/\D+/g, '').trim();
  return digits.length === 5 ? digits : AEROTRADER_DEFAULT_ZIP;
}

function sanitizeAeroTraderSearchRadius(value) {
  const digits = String(value || '').replace(/\D+/g, '').trim();
  if (!digits) return AEROTRADER_DEFAULT_RADIUS;
  const asNum = Number(digits);
  if (!Number.isFinite(asNum) || asNum <= 0) return AEROTRADER_DEFAULT_RADIUS;
  return String(Math.trunc(asNum));
}

function normalizeAeroTraderSeedUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.hostname !== 'www.aerotrader.com' && parsed.hostname !== 'aerotrader.com') return null;
    if (!parsed.pathname.toLowerCase().includes('/aircraft-for-sale')) return null;
    if (parsed.pathname.toLowerCase().endsWith('/make')) parsed.pathname = '/aircraft-for-sale';
    if (!parsed.searchParams.get('zip')) parsed.searchParams.set('zip', String(state.aerotraderSearchZip || AEROTRADER_DEFAULT_ZIP));
    if (!parsed.searchParams.get('radius')) parsed.searchParams.set('radius', String(state.aerotraderSearchRadius || AEROTRADER_DEFAULT_RADIUS));
    return parsed.toString();
  } catch {
    return null;
  }
}

function sanitizeCategoryList(values, sanitizer, fallbackValue) {
  const list = Array.isArray(values) ? values : [values];
  const cleaned = [];
  for (const value of list) {
    const normalized = sanitizer(value);
    if (normalized && !cleaned.includes(normalized)) cleaned.push(normalized);
  }
  if (!cleaned.length && fallbackValue) cleaned.push(fallbackValue);
  return cleaned;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function defaultSourceDiagnostics() {
  return {
    controller: { status: 'idle', extracted: 0, saved: 0, lastReason: null, lastMessage: '', lastUrl: null, retries: 0, emptyPages: 0, blockedReason: null },
    globalair: { status: 'idle', extracted: 0, saved: 0, lastReason: null, lastMessage: '', lastUrl: null, retries: 0, emptyPages: 0, blockedReason: null },
    tap: { status: 'idle', extracted: 0, saved: 0, lastReason: null, lastMessage: '', lastUrl: null, retries: 0, emptyPages: 0, blockedReason: null },
    aerotrader: { status: 'idle', extracted: 0, saved: 0, lastReason: null, lastMessage: '', lastUrl: null, retries: 0, emptyPages: 0, blockedReason: null },
  };
}

function normalizedSourceMakes(value) {
  const out = { controller: [], globalair: [], tap: [], aerotrader: [] };
  if (!value || typeof value !== 'object') return out;
  for (const key of Object.keys(out)) {
    out[key] = Array.isArray(value[key])
      ? value[key].map((v) => String(v || '').trim()).filter(Boolean)
      : [];
  }
  return out;
}

function defaultState() {
  return {
    running: false,
    runStatus: 'idle',
    pausedReason: null,
    mode: 'card_only',
    detailNewOnly: false,
    controllerCategories: ['piston-single-aircraft'],
    globalAirCategories: ['single-engine-piston'],
    tapCategories: ['single-engine-piston'],
    controllerCategory: 'piston-single-aircraft',
    globalAirCategory: 'single-engine-piston',
    tapCategory: 'single-engine-piston',
    aerotraderSearchZip: AEROTRADER_DEFAULT_ZIP,
    aerotraderSearchRadius: AEROTRADER_DEFAULT_RADIUS,
    aerotraderStartFromCurrentTab: false,
    riskProfile: 'safe',
    rotateSources: true,
    sources: ['controller', 'globalair', 'tap', 'aerotrader'],
    sourceStates: {
      controller: defaultSourceState('controller'),
      globalair: defaultSourceState('globalair'),
      tap: defaultSourceState('tap'),
      aerotrader: defaultSourceState('aerotrader'),
    },
    sourceDiagnostics: defaultSourceDiagnostics(),
    currentSource: null,
    totalExtracted: 0,
    totalUpserted: 0,
    sessionExtracted: 0,
    sessionUpserted: 0,
    sessionDetailProcessed: 0,
    failedUrls: [],
    startedAt: null,
    pausedAt: null,
    lastMessage: '',
    lastUrl: null,
    lastFailureReason: null,
    challengeDetected: false,
    lastPageTitle: null,
    lastSelectorUsed: null,
    lastCandidateAnchors: 0,
    lastParsedRows: 0,
    currentMakeTotalListings: 0,
    currentMakeRangeStart: 0,
    currentMakeRangeEnd: 0,
  };
}

let state = defaultState();

async function saveState() {
  await chrome.storage.local.set({ [STATE_KEY]: state });
}

async function loadState() {
  const result = await chrome.storage.local.get([STATE_KEY]);
  if (result[STATE_KEY]) state = { ...defaultState(), ...result[STATE_KEY] };
  if (!state.sourceStates || typeof state.sourceStates !== 'object') {
    state.sourceStates = {
      controller: defaultSourceState('controller'),
      globalair: defaultSourceState('globalair'),
      tap: defaultSourceState('tap'),
      aerotrader: defaultSourceState('aerotrader'),
    };
  }
  if (!state.sourceDiagnostics || typeof state.sourceDiagnostics !== 'object') {
    state.sourceDiagnostics = defaultSourceDiagnostics();
  }
  // Canonicalize persisted category values and migrate legacy scalar state.
  state.controllerCategory = sanitizeControllerCategory(state.controllerCategory);
  state.globalAirCategory = sanitizeGlobalAirCategory(state.globalAirCategory);
  state.tapCategory = sanitizeTapCategory(state.tapCategory);
  state.aerotraderSearchZip = sanitizeAeroTraderSearchZip(state.aerotraderSearchZip);
  state.aerotraderSearchRadius = sanitizeAeroTraderSearchRadius(state.aerotraderSearchRadius);
  state.aerotraderStartFromCurrentTab = !!state.aerotraderStartFromCurrentTab;
  state.detailNewOnly = !!state.detailNewOnly;
  state.controllerCategories = sanitizeCategoryList(
    state.controllerCategories && state.controllerCategories.length ? state.controllerCategories : state.controllerCategory,
    sanitizeControllerCategory,
    'piston-single-aircraft'
  );
  state.globalAirCategories = sanitizeCategoryList(
    state.globalAirCategories && state.globalAirCategories.length ? state.globalAirCategories : state.globalAirCategory,
    sanitizeGlobalAirCategory,
    'single-engine-piston'
  );
  state.tapCategories = sanitizeCategoryList(
    state.tapCategories && state.tapCategories.length ? state.tapCategories : state.tapCategory,
    sanitizeTapCategory,
    'single-engine-piston'
  );
  const sourceCategoryDefaults = {
    controller: state.controllerCategories,
    globalair: state.globalAirCategories,
    tap: state.tapCategories,
  };
  for (const sourceKey of Object.keys(sourceCategoryDefaults)) {
    const ss = sourceState(sourceKey);
    if (!Array.isArray(ss.categories) || !ss.categories.length) {
      ss.categories = [...sourceCategoryDefaults[sourceKey]];
    } else {
      const sanitizer = sourceKey === 'controller'
        ? sanitizeControllerCategory
        : sourceKey === 'globalair'
          ? sanitizeGlobalAirCategory
          : sanitizeTapCategory;
      const fallback = sourceKey === 'controller' ? 'piston-single-aircraft' : 'single-engine-piston';
      ss.categories = sanitizeCategoryList(ss.categories, sanitizer, fallback);
    }
    ss.currentCategoryIndex = Math.max(0, Number(ss.currentCategoryIndex || 0));
    if (ss.currentCategoryIndex >= ss.categories.length) ss.currentCategoryIndex = 0;
    ss.currentCategory = ss.categories[ss.currentCategoryIndex];
    ss.seedMakes = Array.isArray(ss.seedMakes)
      ? ss.seedMakes.map((m) => String(m || '').trim()).filter(Boolean)
      : [];
    ss.seedPageUrl = typeof ss.seedPageUrl === 'string' ? ss.seedPageUrl : null;
    ss.detailDisabled = !!ss.detailDisabled;
    ss.lastResultFingerprint = typeof ss.lastResultFingerprint === 'string' ? ss.lastResultFingerprint : null;
    ss.stagnantResultRepeats = Number(ss.stagnantResultRepeats || 0);
    ss.noProgressCycles = Number(ss.noProgressCycles || 0);
    ss.cooldownLevel = Number(ss.cooldownLevel || 0);
  }
}

function randomBetween(min, max) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safePause(range) {
  const delay = randomBetween(range[0], range[1]);
  await sleep(delay);
}

async function humanPause(stage) {
  if (state.riskProfile !== 'safe') return;
  if (stage === 'page_dwell') return safePause(SAFE_TIMING.pageDwellMs);
  if (stage === 'between_pages') return safePause(SAFE_TIMING.betweenPagesMs);
  if (stage === 'between_makes') return safePause(SAFE_TIMING.betweenMakesMs);
  if (stage === 'between_sources') return safePause(SAFE_TIMING.betweenSourcesMs);
  if (stage === 'retry') return safePause(SAFE_TIMING.retryDelayMs);
  if (stage === 'detail_dwell') return safePause(SAFE_TIMING.detailDwellMs);
  if (stage === 'between_details') return safePause(SAFE_TIMING.betweenDetailsMs);
}

async function pingBridge() {
  try {
    const resp = await fetch(`${BRIDGE_URL}/ping`, { signal: AbortSignal.timeout(2000) });
    return resp.ok;
  } catch {
    return false;
  }
}

async function sendToContent(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    return null;
  }
}

async function detectConfirmedChallenge(tabId, attempts = 2) {
  let last = null;
  for (let i = 0; i < attempts; i += 1) {
    const check = await sendToContent(tabId, { action: 'CHECK_CHALLENGE' });
    if (!check || !check.challengeDetected) return { challengeDetected: false };
    last = check;
    if (i < attempts - 1) {
      await humanPause('retry');
      await sendToContent(tabId, { action: 'HUMAN_SCROLL' });
    }
  }
  return {
    challengeDetected: true,
    currentUrl: last?.currentUrl || null,
    pageTitle: last?.pageTitle || '',
    indicators: Array.isArray(last?.indicators) ? last.indicators : [],
  };
}

async function getSourceTab(sourceKey) {
  const cfg = SOURCE_CONFIG[sourceKey];
  const tabs = await chrome.tabs.query({ url: cfg.tabQuery });
  if (tabs.length) return tabs[0].id;
  const tab = await chrome.tabs.create({ url: cfg.bootUrl, active: false });
  return tab.id;
}

function waitForTabComplete(tabId, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timeout = setTimeout(() => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('tab_load_timeout'));
    }, timeoutMs);

    function listener(id, info) {
      if (done) return;
      if (id === tabId && info.status === 'complete') {
        done = true;
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function goTo(tabId, url) {
  await chrome.tabs.update(tabId, { url });
  await waitForTabComplete(tabId);
}

async function postListings(rows) {
  const resp = await fetch(`${BRIDGE_URL}/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rows),
  });
  const json = await resp.json();
  return json.upserted || 0;
}

function rowIdentity(row) {
  const sourceSiteRaw = row?.source_site || row?.listing_source;
  const sourceSite = String(sourceSiteRaw || '').trim().toLowerCase()
    .replace(/^tap$/, 'trade_a_plane')
    .replace(/^trade-a-plane$/, 'trade_a_plane')
    .replace(/^tradeaplane$/, 'trade_a_plane');
  const sourceListingId = String(row?.source_listing_id || row?.source_id || '').trim();
  if (!sourceSite || !sourceListingId) return null;
  return `${sourceSite}::${sourceListingId}`;
}

async function fetchExistingIdentitySet(rows) {
  const items = rows
    .map((row) => ({
      source_site: row?.source_site || row?.listing_source,
      source_listing_id: row?.source_listing_id || row?.source_id || null,
      source_id: row?.source_id || null,
    }))
    .filter((item) => !!item.source_site && !!item.source_listing_id);
  const resp = await fetch(`${BRIDGE_URL}/exists`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  if (!resp.ok) {
    let detail = '';
    try {
      const errJson = await resp.json();
      detail = String(errJson?.error || errJson?.detail || '');
    } catch {
      detail = '';
    }
    throw new Error(detail || `exists_lookup_failed_${resp.status}`);
  }
  const json = await resp.json();
  const existing = Array.isArray(json?.existing_keys) ? json.existing_keys : [];
  const set = new Set();
  for (const item of existing) {
    const id = rowIdentity(item);
    if (id) set.add(id);
  }
  return set;
}

function notifyPopup(type, payload = {}) {
  chrome.runtime.sendMessage({ type, ...payload }).catch(() => {});
}

function sourceState(sourceKey) {
  if (!state.sourceStates[sourceKey]) state.sourceStates[sourceKey] = defaultSourceState(sourceKey);
  return state.sourceStates[sourceKey];
}

function sourceDiag(sourceKey) {
  if (!state.sourceDiagnostics || typeof state.sourceDiagnostics !== 'object') state.sourceDiagnostics = defaultSourceDiagnostics();
  if (!state.sourceDiagnostics[sourceKey]) state.sourceDiagnostics[sourceKey] = defaultSourceDiagnostics()[sourceKey];
  return state.sourceDiagnostics[sourceKey];
}

function hasCheckpoint() {
  return Object.values(state.sourceStates || {}).some((ss) => {
    if (!ss) return false;
    return Number(ss.currentCategoryIndex || 0) > 0
      || Number(ss.currentMakeIndex || 0) > 0
      || Number(ss.currentPage || 1) > 1
      || Object.keys(ss.progressByMake || {}).length > 0;
  });
}

async function pauseRun(reason, context = {}) {
  state.running = false;
  state.runStatus = 'paused';
  state.pausedReason = reason;
  state.pausedAt = new Date().toISOString();
  state.lastMessage = context.message || '';
  state.lastFailureReason = context.failureReason || reason || null;
  if (context.url) state.lastUrl = context.url;
  if (reason === 'challenge_detected') state.challengeDetected = true;
  if (context.url) state.failedUrls.push(context.url);
  await saveState();
  notifyPopup('STATUS_UPDATE', { state });
}

function resetRunState({
  makes,
  sourceMakes,
  mode,
  sources,
  rotateSources,
  controllerCategories,
  globalAirCategories,
  tapCategories,
  aerotraderSearchZip,
  aerotraderSearchRadius,
  aerotraderStartFromCurrentTab,
  detailNewOnly,
}) {
  const fresh = defaultState();
  const sourceMakesSafe = normalizedSourceMakes(sourceMakes);
  const useSharedFallback = !sourceMakes || typeof sourceMakes !== 'object';
  const buildInitialSourceState = (sourceKey) => {
    const explicit = Array.isArray(sourceMakesSafe[sourceKey]) ? sourceMakesSafe[sourceKey] : [];
    const chosen = explicit.length ? explicit : (useSharedFallback && Array.isArray(makes) && makes.length ? makes : []);
    const ss = defaultSourceState(sourceKey, chosen);
    ss.seedMakes = [...chosen];
    const defaults = sourceKey === 'controller'
      ? controllerCategoriesSafe
      : sourceKey === 'globalair'
        ? globalAirCategoriesSafe
        : sourceKey === 'tap'
          ? tapCategoriesSafe
          : [];
    ss.categories = [...defaults];
    ss.currentCategoryIndex = 0;
    ss.currentCategory = ss.categories[0] || null;
    if (!chosen.length) {
      ss.makes = [];
      ss.needsMakeDiscovery = true;
    }
    return ss;
  };
  fresh.mode = mode || 'card_only';
  fresh.detailNewOnly = !!detailNewOnly;
  const controllerCategoriesSafe = sanitizeCategoryList(controllerCategories, sanitizeControllerCategory, 'piston-single-aircraft');
  const globalAirCategoriesSafe = sanitizeCategoryList(globalAirCategories, sanitizeGlobalAirCategory, 'single-engine-piston');
  const tapCategoriesSafe = sanitizeCategoryList(tapCategories, sanitizeTapCategory, 'single-engine-piston');
  fresh.controllerCategories = [...controllerCategoriesSafe];
  fresh.globalAirCategories = [...globalAirCategoriesSafe];
  fresh.tapCategories = [...tapCategoriesSafe];
  fresh.controllerCategory = controllerCategoriesSafe[0];
  fresh.globalAirCategory = globalAirCategoriesSafe[0];
  fresh.tapCategory = tapCategoriesSafe[0];
  fresh.aerotraderSearchZip = sanitizeAeroTraderSearchZip(aerotraderSearchZip);
  fresh.aerotraderSearchRadius = sanitizeAeroTraderSearchRadius(aerotraderSearchRadius);
  fresh.aerotraderStartFromCurrentTab = !!aerotraderStartFromCurrentTab;
  fresh.rotateSources = rotateSources !== false;
  fresh.sources = (Array.isArray(sources) && sources.length ? sources : ['controller', 'globalair', 'tap', 'aerotrader']).filter((s) => !!SOURCE_CONFIG[s]);
  fresh.sourceStates = {
    controller: buildInitialSourceState('controller'),
    globalair: buildInitialSourceState('globalair'),
    tap: buildInitialSourceState('tap'),
    aerotrader: buildInitialSourceState('aerotrader'),
  };
  fresh.sourceDiagnostics = defaultSourceDiagnostics();
  state = fresh;
}

function currentCategoryForSource(sourceKey) {
  const ss = sourceState(sourceKey);
  if (!Array.isArray(ss.categories) || !ss.categories.length) {
    if (sourceKey === 'controller') ss.categories = [...(state.controllerCategories || ['piston-single-aircraft'])];
    else if (sourceKey === 'globalair') ss.categories = [...(state.globalAirCategories || ['single-engine-piston'])];
    else if (sourceKey === 'tap') ss.categories = [...(state.tapCategories || ['single-engine-piston'])];
    else ss.categories = ['all'];
  }
  if (ss.currentCategoryIndex >= ss.categories.length) ss.currentCategoryIndex = 0;
  const category = ss.categories[Math.max(0, ss.currentCategoryIndex)] || ss.categories[0];
  ss.currentCategory = category;
  return category;
}

function applyActiveCategory(sourceKey) {
  const category = currentCategoryForSource(sourceKey);
  if (sourceKey === 'controller') state.controllerCategory = sanitizeControllerCategory(category);
  if (sourceKey === 'globalair') state.globalAirCategory = sanitizeGlobalAirCategory(category);
  if (sourceKey === 'tap') state.tapCategory = sanitizeTapCategory(category);
  return category;
}

function moveToNextCategory(sourceKey, ss) {
  if (!Array.isArray(ss.categories) || !ss.categories.length) {
    ss.complete = true;
    return;
  }
  ss.currentCategoryIndex += 1;
  if (ss.currentCategoryIndex >= ss.categories.length) {
    ss.complete = true;
    return;
  }
  ss.currentCategory = ss.categories[ss.currentCategoryIndex];
  const seeded = Array.isArray(ss.seedMakes) ? ss.seedMakes.map((m) => String(m || '').trim()).filter(Boolean) : [];
  ss.makes = [...seeded];
  ss.currentMake = null;
  ss.currentMakeIndex = 0;
  ss.currentPage = 1;
  ss.progressByMake = {};
  ss.warmedUp = false;
  ss.needsMakeDiscovery = seeded.length === 0;
  ss.blocked = false;
  ss.blockedReason = null;
  ss.blockedUntilMs = null;
  ss.noProgressCycles = 0;
  ss.lastResultFingerprint = null;
  ss.stagnantResultRepeats = 0;
}

function nextCooldownMs(ss) {
  const level = Math.max(0, Number(ss.cooldownLevel || 0));
  const ladder = [5 * 60 * 1000, 15 * 60 * 1000, 30 * 60 * 1000, 60 * 60 * 1000];
  return ladder[Math.min(level, ladder.length - 1)];
}

function escalateCooldown(ss) {
  ss.cooldownLevel = Math.min(Number(ss.cooldownLevel || 0) + 1, 3);
  return nextCooldownMs(ss);
}

function buildResultFingerprint(rows, meta = {}) {
  const ids = rows
    .map((row) => String(row?.source_listing_id || row?.source_id || '').trim())
    .filter(Boolean)
    .sort()
    .slice(0, 20);
  const total = Number(meta?.totalListings || 0);
  const rangeStart = Number(meta?.rangeStart || 0);
  const rangeEnd = Number(meta?.rangeEnd || 0);
  return JSON.stringify({ ids, total, rangeStart, rangeEnd, count: rows.length });
}

function getGlobalAirCategoryUrl() {
  const category = sanitizeGlobalAirCategory(state.globalAirCategory || 'single-engine-piston');
  return `https://www.globalair.com/aircraft-for-sale/${category}`;
}

function getControllerCategoryUrl() {
  const category = sanitizeControllerCategory(state.controllerCategory || 'piston-single-aircraft');
  const categoryId = CONTROLLER_CATEGORY_ROUTES[category];
  if (!categoryId) return 'https://www.controller.com/listings/search?category=aircraft';
  return `https://www.controller.com/listings/for-sale/${category}/${categoryId}`;
}

function getTapCategoryUrl() {
  const category = sanitizeTapCategory(state.tapCategory || 'single-engine-piston');
  const spec = TAP_CATEGORY_QUERY_MAP[category] || TAP_CATEGORY_QUERY_MAP['single-engine-piston'];
  const params = new URLSearchParams({ 's-type': 'aircraft' });
  for (const level of Array.isArray(spec.categoryLevel1) ? spec.categoryLevel1 : []) {
    params.append('category_level1', level);
  }
  const extra = spec.extraParams && typeof spec.extraParams === 'object' ? spec.extraParams : {};
  for (const [key, value] of Object.entries(extra)) params.set(key, String(value));
  return `https://www.trade-a-plane.com/search?${params.toString()}`;
}

function getAeroTraderDiscoveryUrl() {
  const params = new URLSearchParams({
    zip: String(state.aerotraderSearchZip || AEROTRADER_DEFAULT_ZIP),
    radius: String(state.aerotraderSearchRadius || AEROTRADER_DEFAULT_RADIUS),
  });
  return `https://www.aerotrader.com/aircraft-for-sale?${params.toString()}`;
}

function getMakeDiscoveryUrl(sourceKey) {
  if (sourceKey === 'globalair') return getGlobalAirCategoryUrl();
  if (sourceKey === 'controller') return getControllerCategoryUrl();
  if (sourceKey === 'tap') return getTapCategoryUrl();
  if (sourceKey === 'aerotrader') return getAeroTraderDiscoveryUrl();
  return SOURCE_CONFIG[sourceKey]?.bootUrl || null;
}

function buildSourceUrl(sourceKey, make, page = 1) {
  const cfg = SOURCE_CONFIG[sourceKey];
  if (sourceKey === 'controller') {
    const category = sanitizeControllerCategory(state.controllerCategory || 'piston-single-aircraft');
    const categoryId = CONTROLLER_CATEGORY_ROUTES[category];
    if (categoryId) {
      const makeSlug = slugify(make);
      const base = makeSlug
        ? `https://www.controller.com/listings/for-sale/${makeSlug}/${category}/${categoryId}`
        : `https://www.controller.com/listings/for-sale/${category}/${categoryId}`;
      return page <= 1 ? base : `${base}?page=${page}`;
    }
    return cfg.makeUrl(make, page);
  }
  if (sourceKey === 'tap') {
    const category = sanitizeTapCategory(state.tapCategory || 'single-engine-piston');
    const spec = TAP_CATEGORY_QUERY_MAP[category] || TAP_CATEGORY_QUERY_MAP['single-engine-piston'];
    const params = new URLSearchParams({ 's-type': 'aircraft', make: String(make || '').toUpperCase() });
    for (const level of Array.isArray(spec.categoryLevel1) ? spec.categoryLevel1 : []) {
      params.append('category_level1', level);
    }
    const extra = spec.extraParams && typeof spec.extraParams === 'object' ? spec.extraParams : {};
    for (const [key, value] of Object.entries(extra)) params.set(key, String(value));
    if (page > 1) params.set('s-page', String(page));
    return `https://www.trade-a-plane.com/search?${params.toString()}`;
  }
  if (sourceKey === 'aerotrader') {
    if (make === AEROTRADER_CURRENT_PAGE_SENTINEL) {
      const ss = sourceState('aerotrader');
      const seedUrl = normalizeAeroTraderSeedUrl(ss.seedPageUrl || getAeroTraderDiscoveryUrl()) || getAeroTraderDiscoveryUrl();
      try {
        const u = new URL(seedUrl);
        if (page <= 1) return u.toString();
        u.searchParams.set('page', String(page));
        return u.toString();
      } catch {
        return seedUrl;
      }
    }
    const params = new URLSearchParams({
      zip: String(state.aerotraderSearchZip || AEROTRADER_DEFAULT_ZIP),
      radius: String(state.aerotraderSearchRadius || AEROTRADER_DEFAULT_RADIUS),
    });
    if (make) params.set('make', String(make || ''));
    if (page > 1) params.set('page', String(page));
    return `https://www.aerotrader.com/aircraft-for-sale?${params.toString()}`;
  }
  if (sourceKey !== 'globalair') return cfg.makeUrl(make, page);
  const category = sanitizeGlobalAirCategory(state.globalAirCategory || 'single-engine-piston');
  if (!make || make === GLOBALAIR_CATEGORY_LISTING_SENTINEL) {
    const base = `https://www.globalair.com/aircraft-for-sale/${category}`;
    return page <= 1 ? base : `${base}?s-page=${page}`;
  }
  const slug = slugify(make);
  const base = `https://www.globalair.com/aircraft-for-sale/${category}/${slug}`;
  return page <= 1 ? base : `${base}?s-page=${page}`;
}

async function discoverGlobalAirMakes(tabId, ss, sd) {
  const category = sanitizeGlobalAirCategory(state.globalAirCategory || 'single-engine-piston');
  const categoryUrl = getGlobalAirCategoryUrl();
  state.currentSource = 'globalair';
  state.lastUrl = categoryUrl;
  state.lastMessage = `[GlobalAir] discovering makes (${category})`;
  sd.status = 'running';
  sd.lastReason = null;
  sd.lastUrl = categoryUrl;
  sd.lastMessage = `discovering makes in ${category}`;
  await saveState();
  notifyPopup('STATUS_UPDATE', { state });

  try {
    await goTo(tabId, categoryUrl);
  } catch {
    state.lastFailureReason = 'globalair_discovery_navigation_failed';
    sd.lastReason = 'discovery_navigation_failed';
    sd.lastMessage = 'make discovery navigation failed';
    await saveState();
    notifyPopup('STATUS_UPDATE', { state });
    return;
  }

  await humanPause('page_dwell');
  const challenge = await detectConfirmedChallenge(tabId, 2);
  if (challenge && challenge.challengeDetected) {
    const cooldownMs = escalateCooldown(ss);
    const blockedUntilMs = Date.now() + cooldownMs;
    ss.blocked = true;
    ss.blockedReason = 'discovery_challenge_detected';
    ss.blockedUntilMs = blockedUntilMs;
    ss.complete = false;
    state.lastFailureReason = 'globalair_discovery_challenge_detected';
    sd.status = 'blocked';
    sd.lastReason = 'discovery_challenge_detected';
    sd.blockedReason = 'discovery_challenge_detected';
    sd.lastMessage = `blocked during make discovery; retry in ${Math.ceil(cooldownMs / 60000)}m`;
    state.failedUrls.push(challenge.currentUrl || categoryUrl);
    state.lastMessage = `[GlobalAir] blocked during make discovery; auto-retry in ${Math.ceil(cooldownMs / 60000)}m`;
    await saveState();
    notifyPopup('STATUS_UPDATE', { state });
    return;
  }

  await sendToContent(tabId, { action: 'HUMAN_SCROLL' });
  const discovered = await sendToContent(tabId, { action: 'DISCOVER_GLOBALAIR_MAKES', category });
  if (!discovered || discovered.success === false) {
    state.lastFailureReason = 'globalair_make_discovery_failed';
    sd.lastReason = 'make_discovery_failed';
    sd.lastMessage = 'make discovery failed';
    await saveState();
    notifyPopup('STATUS_UPDATE', { state });
    return;
  }

  const makes = Array.isArray(discovered.makes)
    ? discovered.makes.map((m) => String(m || '').trim()).filter(Boolean)
    : [];
  if (!makes.length) {
    // Some GlobalAir categories show all listings on one sheet with no make links.
    // In that case, scrape the category listing page directly.
    ss.makes = [GLOBALAIR_CATEGORY_LISTING_SENTINEL];
    ss.currentMakeIndex = 0;
    ss.currentPage = 1;
    ss.complete = false;
    ss.needsMakeDiscovery = false;
    ss.warmedUp = true;
    state.lastFailureReason = null;
    sd.status = 'running';
    sd.lastReason = null;
    sd.lastMessage = 'no make links found; using category listing page';
    state.lastMessage = `[GlobalAir] no make links found; scraping ${category} category listing page`;
    await saveState();
    notifyPopup('STATUS_UPDATE', { state });
    return;
  }

  ss.makes = makes;
  ss.currentMakeIndex = 0;
  ss.currentPage = 1;
  ss.complete = false;
  ss.needsMakeDiscovery = false;
  ss.warmedUp = true;
  state.lastFailureReason = null;
  state.lastMessage = `[GlobalAir] discovered ${makes.length} makes in ${category}`;
  sd.status = 'running';
  sd.lastReason = null;
  sd.lastMessage = `discovered ${makes.length} makes`;
  await saveState();
  notifyPopup('STATUS_UPDATE', { state });
}

async function discoverControllerMakes(tabId, ss, sd) {
  const discoveryUrl = getMakeDiscoveryUrl('controller');
  const category = sanitizeControllerCategory(state.controllerCategory || 'piston-single-aircraft');
  state.currentSource = 'controller';
  state.lastUrl = discoveryUrl;
  state.lastMessage = `[Controller] discovering makes (${category})`;
  sd.status = 'running';
  sd.lastReason = null;
  sd.lastUrl = discoveryUrl;
  sd.lastMessage = `discovering makes in ${category}`;
  await saveState();
  notifyPopup('STATUS_UPDATE', { state });

  try {
    await goTo(tabId, discoveryUrl);
  } catch {
    state.lastFailureReason = 'controller_discovery_navigation_failed';
    sd.lastReason = 'discovery_navigation_failed';
    sd.lastMessage = 'make discovery navigation failed';
    await saveState();
    notifyPopup('STATUS_UPDATE', { state });
    return;
  }

  await humanPause('page_dwell');
  const challenge = await detectConfirmedChallenge(tabId, 2);
  if (challenge && challenge.challengeDetected) {
    const cooldownMs = escalateCooldown(ss);
    const blockedUntilMs = Date.now() + cooldownMs;
    ss.blocked = true;
    ss.blockedReason = 'discovery_challenge_detected';
    ss.blockedUntilMs = blockedUntilMs;
    ss.complete = false;
    state.lastFailureReason = 'controller_discovery_challenge_detected';
    sd.status = 'blocked';
    sd.lastReason = 'discovery_challenge_detected';
    sd.blockedReason = 'discovery_challenge_detected';
    sd.lastMessage = `blocked during make discovery; retry in ${Math.ceil(cooldownMs / 60000)}m`;
    state.failedUrls.push(challenge.currentUrl || discoveryUrl);
    state.lastMessage = `[Controller] blocked during make discovery; auto-retry in ${Math.ceil(cooldownMs / 60000)}m`;
    await saveState();
    notifyPopup('STATUS_UPDATE', { state });
    return;
  }

  await sendToContent(tabId, { action: 'HUMAN_SCROLL' });
  const discovered = await sendToContent(tabId, { action: 'DISCOVER_CONTROLLER_MAKES' });
  if (!discovered || discovered.success === false) {
    state.lastFailureReason = 'controller_make_discovery_failed';
    sd.lastReason = 'make_discovery_failed';
    sd.lastMessage = 'make discovery failed';
    await saveState();
    notifyPopup('STATUS_UPDATE', { state });
    return;
  }

  const makes = Array.isArray(discovered.makes)
    ? discovered.makes.map((m) => String(m || '').trim()).filter(Boolean)
    : [];
  if (!makes.length) {
    ss.makes = [];
    ss.currentMakeIndex = 0;
    ss.currentPage = 1;
    ss.needsMakeDiscovery = false;
    state.lastFailureReason = 'controller_no_makes_discovered';
    sd.status = 'running';
    sd.lastReason = 'no_makes_discovered';
    sd.lastMessage = 'no makes discovered; advancing category';
    moveToNextCategory('controller', ss);
    if (ss.complete) sd.status = 'complete';
    await saveState();
    notifyPopup('STATUS_UPDATE', { state });
    return;
  }

  ss.makes = makes;
  ss.currentMakeIndex = 0;
  ss.currentPage = 1;
  ss.complete = false;
  ss.needsMakeDiscovery = false;
  ss.warmedUp = true;
  state.lastFailureReason = null;
  state.lastMessage = `[Controller] discovered ${makes.length} makes in ${category}`;
  sd.status = 'running';
  sd.lastReason = null;
  sd.lastMessage = `discovered ${makes.length} makes`;
  await saveState();
  notifyPopup('STATUS_UPDATE', { state });
}

async function discoverTapMakes(tabId, ss, sd) {
  const discoveryUrl = getMakeDiscoveryUrl('tap');
  const category = sanitizeTapCategory(state.tapCategory || 'single-engine-piston');
  const categorySpec = TAP_CATEGORY_QUERY_MAP[category] || TAP_CATEGORY_QUERY_MAP['single-engine-piston'];
  const categoryLabel = categorySpec.label || category;
  state.currentSource = 'tap';
  state.lastUrl = discoveryUrl;
  state.lastMessage = `[TAP] discovering makes (${categoryLabel})`;
  sd.status = 'running';
  sd.lastReason = null;
  sd.lastUrl = discoveryUrl;
  sd.lastMessage = `discovering makes in ${categoryLabel}`;
  await saveState();
  notifyPopup('STATUS_UPDATE', { state });

  try {
    await goTo(tabId, discoveryUrl);
  } catch {
    state.lastFailureReason = 'tap_discovery_navigation_failed';
    sd.lastReason = 'discovery_navigation_failed';
    sd.lastMessage = 'make discovery navigation failed';
    await saveState();
    notifyPopup('STATUS_UPDATE', { state });
    return;
  }

  await humanPause('page_dwell');
  const challenge = await detectConfirmedChallenge(tabId, 2);
  if (challenge && challenge.challengeDetected) {
    const cooldownMs = escalateCooldown(ss);
    const blockedUntilMs = Date.now() + cooldownMs;
    ss.blocked = true;
    ss.blockedReason = 'discovery_challenge_detected';
    ss.blockedUntilMs = blockedUntilMs;
    ss.complete = false;
    state.lastFailureReason = 'tap_discovery_challenge_detected';
    sd.status = 'blocked';
    sd.lastReason = 'discovery_challenge_detected';
    sd.blockedReason = 'discovery_challenge_detected';
    sd.lastMessage = `blocked during make discovery; retry in ${Math.ceil(cooldownMs / 60000)}m`;
    state.failedUrls.push(challenge.currentUrl || discoveryUrl);
    state.lastMessage = `[TAP] blocked during make discovery; auto-retry in ${Math.ceil(cooldownMs / 60000)}m`;
    await saveState();
    notifyPopup('STATUS_UPDATE', { state });
    return;
  }

  await sendToContent(tabId, { action: 'HUMAN_SCROLL' });
  const discovered = await sendToContent(tabId, { action: 'DISCOVER_TAP_MAKES', categorySpec });
  if (!discovered || discovered.success === false) {
    state.lastFailureReason = 'tap_make_discovery_failed';
    sd.lastReason = 'make_discovery_failed';
    sd.lastMessage = 'make discovery failed';
    await saveState();
    notifyPopup('STATUS_UPDATE', { state });
    return;
  }

  const makes = Array.isArray(discovered.makes)
    ? discovered.makes.map((m) => String(m || '').trim()).filter(Boolean)
    : [];
  if (!makes.length) {
    ss.makes = [];
    ss.currentMakeIndex = 0;
    ss.currentPage = 1;
    ss.needsMakeDiscovery = false;
    state.lastFailureReason = 'tap_no_makes_discovered';
    sd.status = 'running';
    sd.lastReason = 'no_makes_discovered';
    sd.lastMessage = 'no makes discovered; advancing category';
    moveToNextCategory('tap', ss);
    if (ss.complete) sd.status = 'complete';
    await saveState();
    notifyPopup('STATUS_UPDATE', { state });
    return;
  }

  ss.makes = makes;
  ss.currentMakeIndex = 0;
  ss.currentPage = 1;
  ss.complete = false;
  ss.needsMakeDiscovery = false;
  ss.warmedUp = true;
  state.lastFailureReason = null;
  state.lastMessage = `[TAP] discovered ${makes.length} makes in ${categoryLabel}`;
  sd.status = 'running';
  sd.lastReason = null;
  sd.lastMessage = `discovered ${makes.length} makes`;
  await saveState();
  notifyPopup('STATUS_UPDATE', { state });
}

async function discoverAeroTraderMakes(tabId, ss, sd) {
  const discoveryUrl = getMakeDiscoveryUrl('aerotrader');
  state.currentSource = 'aerotrader';
  state.lastUrl = discoveryUrl;
  state.lastMessage = `[AeroTrader] discovering makes (zip=${state.aerotraderSearchZip} radius=${state.aerotraderSearchRadius})`;
  sd.status = 'running';
  sd.lastReason = null;
  sd.lastUrl = discoveryUrl;
  sd.lastMessage = `discovering makes zip=${state.aerotraderSearchZip} radius=${state.aerotraderSearchRadius}`;
  await saveState();
  notifyPopup('STATUS_UPDATE', { state });

  try {
    await goTo(tabId, discoveryUrl);
  } catch {
    state.lastFailureReason = 'aerotrader_discovery_navigation_failed';
    sd.lastReason = 'discovery_navigation_failed';
    sd.lastMessage = 'make discovery navigation failed';
    await saveState();
    notifyPopup('STATUS_UPDATE', { state });
    return;
  }

  await humanPause('page_dwell');
  const challenge = await detectConfirmedChallenge(tabId, 2);
  if (challenge && challenge.challengeDetected) {
    const cooldownMs = escalateCooldown(ss);
    const blockedUntilMs = Date.now() + cooldownMs;
    ss.blocked = true;
    ss.blockedReason = 'discovery_challenge_detected';
    ss.blockedUntilMs = blockedUntilMs;
    ss.complete = false;
    state.lastFailureReason = 'aerotrader_discovery_challenge_detected';
    sd.status = 'blocked';
    sd.lastReason = 'discovery_challenge_detected';
    sd.blockedReason = 'discovery_challenge_detected';
    sd.lastMessage = `blocked during make discovery; retry in ${Math.ceil(cooldownMs / 60000)}m`;
    state.failedUrls.push(challenge.currentUrl || discoveryUrl);
    state.lastMessage = `[AeroTrader] blocked during make discovery; auto-retry in ${Math.ceil(cooldownMs / 60000)}m`;
    await saveState();
    notifyPopup('STATUS_UPDATE', { state });
    return;
  }

  await sendToContent(tabId, { action: 'HUMAN_SCROLL' });
  const discovered = await sendToContent(tabId, {
    action: 'DISCOVER_AEROTRADER_MAKES',
    zip: state.aerotraderSearchZip,
    radius: state.aerotraderSearchRadius,
  });
  if (!discovered || discovered.success === false) {
    state.lastFailureReason = 'aerotrader_make_discovery_failed';
    sd.lastReason = 'make_discovery_failed';
    sd.lastMessage = 'make discovery failed';
    await saveState();
    notifyPopup('STATUS_UPDATE', { state });
    return;
  }

  const makes = Array.isArray(discovered.makes)
    ? discovered.makes.map((m) => String(m || '').trim()).filter(Boolean)
    : [];
  if (!makes.length) {
    // AeroTrader pages can hide make facets behind anti-bot UX while still showing listing cards.
    // Fall back to crawling directly from this results page.
    ss.seedPageUrl = discoveryUrl;
    ss.makes = [AEROTRADER_CURRENT_PAGE_SENTINEL];
    ss.currentMakeIndex = 0;
    ss.currentPage = 1;
    ss.complete = false;
    ss.needsMakeDiscovery = false;
    ss.warmedUp = true;
    state.lastFailureReason = null;
    sd.status = 'running';
    sd.lastReason = null;
    sd.lastMessage = 'no make facets; using listing-sheet crawl fallback';
    state.lastMessage = '[AeroTrader] no make facets found; crawling listing-sheet pages directly';
    await saveState();
    notifyPopup('STATUS_UPDATE', { state });
    return;
  }

  ss.makes = makes;
  ss.currentMakeIndex = 0;
  ss.currentPage = 1;
  ss.complete = false;
  ss.needsMakeDiscovery = false;
  ss.warmedUp = true;
  state.lastFailureReason = null;
  state.lastMessage = `[AeroTrader] discovered ${makes.length} makes`;
  sd.status = 'running';
  sd.lastReason = null;
  sd.lastMessage = `discovered ${makes.length} makes`;
  await saveState();
  notifyPopup('STATUS_UPDATE', { state });
}

async function fetchCards(tabId) {
  let lastResult = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const challenge = await detectConfirmedChallenge(tabId, 2);
    if (challenge && challenge.challengeDetected) {
      return { challengeDetected: true, challengeUrl: challenge.currentUrl || null, meta: challenge };
    }
    await sendToContent(tabId, { action: 'HUMAN_SCROLL' });
    const result = await sendToContent(tabId, { action: 'EXTRACT_CARDS' });
    if (!result) return { success: false, listings: [], error: 'content_script_unavailable' };
    if (result.challengeDetected) return result;
    lastResult = result;

    const listings = Array.isArray(result.listings) ? result.listings : [];
    const meta = result.meta || {};
    const totalListings = Number(meta.totalListings || 0);
    const rangeEnd = Number(meta.rangeEnd || 0);
    if (listings.length === 0 && totalListings > 0 && rangeEnd === 0 && attempt < 3) {
      await humanPause('retry');
      continue;
    }
    return result;
  }
  return lastResult || { success: false, listings: [], error: 'extract_cards_failed' };
}

async function enrichWithDetails(rows) {
  const enriched = [];
  let detailProcessed = 0;
  let challengeHits = 0;
  let disableDetailsForRemainder = false;
  for (const row of rows) {
    if (!state.running) break;
    if (disableDetailsForRemainder) {
      enriched.push(row);
      continue;
    }
    let detailTabId = null;
    let rowWasChallenged = false;
    try {
      const detailTab = await chrome.tabs.create({ url: row.url, active: false });
      detailTabId = detailTab.id;
      await waitForTabComplete(detailTabId);
      await humanPause('detail_dwell');
      const challenge = await detectConfirmedChallenge(detailTabId, 2);
      if (challenge && challenge.challengeDetected) {
        rowWasChallenged = true;
        challengeHits += 1;
        enriched.push(row);
        if (challengeHits >= 2) disableDetailsForRemainder = true;
      } else {
        await sendToContent(detailTabId, { action: 'HUMAN_SCROLL' });
        const detail = await sendToContent(detailTabId, { action: 'EXTRACT_DETAIL', listing: row });
        if (detail && detail.success && detail.listing) enriched.push({ ...row, ...detail.listing });
        else enriched.push(row);
      }
    } catch {
      enriched.push(row);
    } finally {
      if (detailTabId) await chrome.tabs.remove(detailTabId).catch(() => {});
    }
    detailProcessed += 1;
    state.sessionDetailProcessed = detailProcessed;
    state.lastMessage = `Detail ${detailProcessed}/${rows.length}`;
    await saveState();
    notifyPopup('STATUS_UPDATE', { state });
    if (!rowWasChallenged) await humanPause('between_details');
  }
  return {
    challengeDetected: false,
    rows: enriched,
    downgraded: disableDetailsForRemainder,
    challengeHits,
  };
}

async function processOneMakeForSource(sourceKey) {
  const cfg = SOURCE_CONFIG[sourceKey];
  const ss = sourceState(sourceKey);
  const sd = sourceDiag(sourceKey);
  const isController = sourceKey === 'controller';
  const emptyPageBreakThreshold = isController ? 3 : 2;
  const noProgressBreakThreshold = isController ? 5 : 4;
  if (ss.complete) return;
  const activeCategory = applyActiveCategory(sourceKey);
  if (ss.blocked) {
    const nowMs = Date.now();
    const untilMs = Number(ss.blockedUntilMs || 0);
    if (untilMs > nowMs) {
      const remainingMin = Math.max(1, Math.ceil((untilMs - nowMs) / 60000));
      sd.status = 'blocked';
      sd.lastMessage = `cooldown ${remainingMin}m remaining`;
      return;
    }
    // Cooldown elapsed; clear block and resume from checkpointed make/page.
    ss.blocked = false;
    ss.blockedReason = null;
    ss.blockedUntilMs = null;
    ss.cooldownLevel = 0;
    sd.status = 'running';
    sd.lastReason = null;
    sd.blockedReason = null;
    sd.lastMessage = 'cooldown elapsed, retrying';
    await saveState();
    notifyPopup('STATUS_UPDATE', { state });
  }
  if (ss.needsMakeDiscovery || !ss.makes.length) {
    if (sourceKey === 'aerotrader' && state.aerotraderStartFromCurrentTab) {
      let seedTab = null;
      try {
        const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const active = activeTabs && activeTabs.length ? activeTabs[0] : null;
        const activeUrl = String(active?.url || '').toLowerCase();
        if (active && activeUrl.includes('aerotrader.com') && activeUrl.includes('/aircraft-for-sale')) {
          seedTab = active;
        }
      } catch {
        seedTab = null;
      }
      if (!seedTab) {
        const seedTabId = await getSourceTab(sourceKey);
        try {
          seedTab = await chrome.tabs.get(seedTabId);
        } catch {
          seedTab = null;
        }
      }
      try {
        const seedUrl = normalizeAeroTraderSeedUrl(seedTab?.url || '');
        if (seedUrl) {
          ss.seedPageUrl = seedUrl;
          ss.makes = [AEROTRADER_CURRENT_PAGE_SENTINEL];
          ss.currentMakeIndex = 0;
          ss.currentPage = 1;
          ss.complete = false;
          ss.needsMakeDiscovery = false;
          ss.warmedUp = true;
          state.lastFailureReason = null;
          state.lastMessage = '[AeroTrader] using current tab as seed page';
          sd.status = 'running';
          sd.lastReason = null;
          sd.lastUrl = seedUrl;
          sd.lastMessage = 'using current tab as seed page';
          await saveState();
          notifyPopup('STATUS_UPDATE', { state });
        }
      } catch {
        // Fall through to normal make discovery.
      }
    }
    const discoveryTabId = await getSourceTab(sourceKey);
    if (sourceKey === 'globalair') await discoverGlobalAirMakes(discoveryTabId, ss, sd);
    if (sourceKey === 'controller') await discoverControllerMakes(discoveryTabId, ss, sd);
    if (sourceKey === 'tap') await discoverTapMakes(discoveryTabId, ss, sd);
    if (sourceKey === 'aerotrader' && (ss.needsMakeDiscovery || !ss.makes.length)) await discoverAeroTraderMakes(discoveryTabId, ss, sd);
    if (ss.complete || ss.blocked || !ss.makes.length) return;
  }
  if (!ss.makes.length) ss.makes = [...cfg.defaultMakes];
  if (ss.currentMakeIndex >= ss.makes.length) {
    moveToNextCategory(sourceKey, ss);
    return;
  }

  const make = ss.makes[ss.currentMakeIndex];
  const makeLabel = make === GLOBALAIR_CATEGORY_LISTING_SENTINEL
    ? `${sanitizeGlobalAirCategory(state.globalAirCategory)} (all listings)`
    : make;
  const categoryLabel = String(activeCategory || 'default').replaceAll('-', ' ');
  let page = Math.max(1, Number(ss.currentPage || 1));
  let emptyPages = 0;
  let extractionFailures = 0;
  const tabId = await getSourceTab(sourceKey);

  // Cold-start warm-up: first visit commonly sets anti-bot/session cookies.
  if (!ss.warmedUp) {
    try {
      await goTo(tabId, cfg.bootUrl);
      await humanPause('page_dwell');
      const warmChallenge = await sendToContent(tabId, { action: 'CHECK_CHALLENGE' });
      if (warmChallenge && warmChallenge.challengeDetected) {
        sd.lastReason = 'warmup_challenge_detected';
        sd.lastMessage = 'warmup challenge; continuing';
      } else {
        ss.warmedUp = true;
        sd.lastMessage = 'warmup complete';
      }
      await saveState();
      notifyPopup('STATUS_UPDATE', { state });
    } catch {
      sd.lastReason = 'warmup_navigation_failed';
      sd.lastMessage = 'warmup failed; continuing';
      await saveState();
      notifyPopup('STATUS_UPDATE', { state });
    }
  }

  state.currentSource = sourceKey;
  state.lastMessage = `[${cfg.label}] ${categoryLabel} | ${makeLabel} page ${page}`;
  sd.status = 'running';
  sd.lastMessage = `category=${categoryLabel} make=${makeLabel} page=${page}`;
  sd.lastReason = null;
  await saveState();
  notifyPopup('STATUS_UPDATE', { state });

  while (state.running) {
    ss.currentMake = make;
    ss.currentPage = page;
    const pageUrl = buildSourceUrl(sourceKey, make, page);
    state.lastUrl = pageUrl;
    sd.lastUrl = pageUrl;
    try {
      await goTo(tabId, pageUrl);
    } catch {
      extractionFailures += 1;
      state.lastFailureReason = 'tab_load_timeout';
      sd.lastReason = 'tab_load_timeout';
      sd.retries += 1;
      state.failedUrls.push(pageUrl);
      if (extractionFailures >= 2) break;
      await humanPause('retry');
      continue;
    }

    await humanPause('page_dwell');
    const res = await fetchCards(tabId);
    if (res && res.meta) {
      state.lastPageTitle = res.meta.pageTitle || state.lastPageTitle;
      state.lastSelectorUsed = res.meta.selectorUsed || state.lastSelectorUsed;
      state.lastCandidateAnchors = Number(res.meta.candidateAnchors || 0);
      state.lastParsedRows = Number(res.meta.parsedRows || 0);
      state.currentMakeTotalListings = Number(res.meta.totalListings || state.currentMakeTotalListings || 0);
      state.currentMakeRangeStart = Number(res.meta.rangeStart || 0);
      state.currentMakeRangeEnd = Number(res.meta.rangeEnd || 0);
    }
    if (res && res.challengeDetected) {
      const cooldownMs = escalateCooldown(ss);
      const blockedUntilMs = Date.now() + cooldownMs;
      ss.blocked = true;
      ss.blockedReason = 'challenge_detected';
      ss.blockedUntilMs = blockedUntilMs;
      ss.complete = false;
      state.lastFailureReason = `${sourceKey}_challenge_detected`;
      sd.status = 'blocked';
      sd.lastReason = 'challenge_detected';
      sd.blockedReason = 'challenge_detected';
      sd.lastMessage = `blocked on cards; retry in ${Math.ceil(cooldownMs / 60000)}m`;
      state.failedUrls.push(res.challengeUrl || pageUrl);
      state.lastMessage = `[${cfg.label}] blocked by challenge; auto-retry in ${Math.ceil(cooldownMs / 60000)}m`;
      await saveState();
      notifyPopup('STATUS_UPDATE', { state });
      return;
    }
    if (!res || res.success === false) {
      extractionFailures += 1;
      state.lastFailureReason = (res && res.error) || 'extract_cards_failed';
      sd.lastReason = (res && res.error) || 'extract_cards_failed';
      sd.retries += 1;
      state.failedUrls.push(pageUrl);
      if (extractionFailures >= 2) break;
      await humanPause('retry');
      continue;
    }

    const rows = Array.isArray(res.listings) ? res.listings : [];
    const rowsTagged = rows.map((r) => ({ ...r, source_site: r.source_site || (sourceKey === 'tap' ? 'trade_a_plane' : sourceKey) }));
    const pageTotal = Number((res.meta && res.meta.totalListings) || 0);
    const pageRangeEnd = Number((res.meta && res.meta.rangeEnd) || 0);
    const candidateAnchors = Number((res.meta && res.meta.candidateAnchors) || 0);
    if (rowsTagged.length === 0) {
      if (page === 1 && candidateAnchors === 0 && extractionFailures < 2) {
        extractionFailures += 1;
        state.lastFailureReason = 'first_page_cold_start';
        sd.lastReason = 'first_page_cold_start';
        sd.retries += 1;
        await humanPause('retry');
        continue;
      }
      if (pageTotal > 0 && pageRangeEnd === 0) {
        extractionFailures += 1;
        state.lastFailureReason = 'render_not_ready';
        sd.lastReason = 'render_not_ready';
        sd.retries += 1;
        if (extractionFailures >= 4) break;
        await humanPause('retry');
        continue;
      }
      emptyPages += 1;
      ss.noProgressCycles += 1;
      state.lastFailureReason = 'empty_cards';
      sd.lastReason = 'empty_cards';
      sd.emptyPages += 1;
      if (ss.noProgressCycles >= noProgressBreakThreshold) {
        state.lastFailureReason = 'no_progress_detected';
        sd.lastReason = 'no_progress_detected';
        break;
      }
      if (emptyPages >= emptyPageBreakThreshold) break;
      page += 1;
      ss.currentPage = page;
      await humanPause('between_pages');
      continue;
    }

    extractionFailures = 0;
    emptyPages = 0;
    ss.noProgressCycles = 0;
    ss.cooldownLevel = 0;
    state.lastFailureReason = null;
    state.challengeDetected = false;
    state.totalExtracted += rowsTagged.length;
    state.sessionExtracted += rowsTagged.length;
    sd.extracted += rowsTagged.length;
    sd.status = 'running';
    sd.lastReason = null;
    state.sessionDetailProcessed = 0;
    state.lastMessage = `[${cfg.label}] Parsed ${rowsTagged.length} cards (${makeLabel} p${page})`;
    sd.lastMessage = `parsed ${rowsTagged.length} cards`;
    await saveState();
    notifyPopup('STATUS_UPDATE', { state });

    if (sourceKey === 'tap' && page > 1) {
      const fingerprint = buildResultFingerprint(rowsTagged, res.meta || {});
      if (ss.lastResultFingerprint && ss.lastResultFingerprint === fingerprint) {
        ss.stagnantResultRepeats = Number(ss.stagnantResultRepeats || 0) + 1;
      } else {
        ss.stagnantResultRepeats = 0;
      }
      ss.lastResultFingerprint = fingerprint;
      if (ss.stagnantResultRepeats >= 2) {
        state.lastFailureReason = 'tap_stagnant_results';
        sd.lastReason = 'tap_stagnant_results';
        sd.lastMessage = 'stagnant TAP results; advancing make';
        break;
      }
    } else if (sourceKey === 'tap') {
      ss.lastResultFingerprint = buildResultFingerprint(rowsTagged, res.meta || {});
      ss.stagnantResultRepeats = 0;
    }

    let rowsToSave = rowsTagged;
    if (state.mode === 'detailed' && !ss.detailDisabled) {
      let rowsForDetails = rowsTagged;
      if (state.detailNewOnly) {
        try {
          const existingSet = await fetchExistingIdentitySet(rowsTagged);
          rowsForDetails = rowsTagged.filter((row) => {
            const id = rowIdentity(row);
            return !id || !existingSet.has(id);
          });
          const existingCount = Math.max(0, rowsTagged.length - rowsForDetails.length);
          sd.lastMessage = `new-only ${rowsForDetails.length} new / ${existingCount} existing`;
          state.lastMessage = `[${cfg.label}] New-only details ${rowsForDetails.length} new / ${existingCount} existing`;
        } catch (lookupErr) {
          state.lastFailureReason = 'exists_lookup_failed';
          sd.lastReason = 'exists_lookup_failed';
          sd.lastMessage = 'new-only lookup failed; using full detailed pass';
          state.lastMessage = `[${cfg.label}] new-only lookup failed; fallback to full detailed`;
        }
      }
      const detailed = rowsForDetails.length > 0
        ? await enrichWithDetails(rowsForDetails)
        : { challengeDetected: false, rows: [], downgraded: false };
      if (detailed.challengeDetected) {
        const cooldownMs = escalateCooldown(ss);
        const blockedUntilMs = Date.now() + cooldownMs;
        ss.blocked = true;
        ss.blockedReason = 'detail_challenge_detected';
        ss.blockedUntilMs = blockedUntilMs;
        ss.complete = false;
        state.lastFailureReason = `${sourceKey}_detail_challenge_detected`;
        sd.status = 'blocked';
        sd.lastReason = 'detail_challenge_detected';
        sd.blockedReason = 'detail_challenge_detected';
        sd.lastMessage = `blocked on detail; retry in ${Math.ceil(cooldownMs / 60000)}m`;
        state.failedUrls.push(detailed.challengeUrl || pageUrl);
        state.lastMessage = `[${cfg.label}] detail challenge; auto-retry in ${Math.ceil(cooldownMs / 60000)}m`;
        await saveState();
        notifyPopup('STATUS_UPDATE', { state });
        return;
      }
      if (rowsForDetails.length > 0) {
        const detailedByIdentity = new Map();
        for (const row of detailed.rows || []) {
          const id = rowIdentity(row);
          if (id) detailedByIdentity.set(id, row);
        }
        rowsToSave = rowsTagged.map((row) => {
          const id = rowIdentity(row);
          if (!id) return row;
          return detailedByIdentity.get(id) || row;
        });
      } else {
        rowsToSave = rowsTagged;
      }
      if (detailed.downgraded) {
        ss.detailDisabled = true;
        state.lastFailureReason = `${sourceKey}_detail_challenge_soft`;
        sd.lastReason = 'detail_challenge_soft';
        sd.lastMessage = 'detail challenged; continuing card-only';
      }
    }

    try {
      const savedCount = await postListings(rowsToSave);
      state.totalUpserted += savedCount;
      state.sessionUpserted += savedCount;
      sd.saved += savedCount;
      state.lastMessage = `[${cfg.label}] Saved ${savedCount} rows (${makeLabel} p${page})`;
      sd.lastMessage = `saved ${savedCount} rows`;
    } catch {
      state.lastFailureReason = 'bridge_ingest_failed';
      sd.lastReason = 'bridge_ingest_failed';
      state.failedUrls.push(pageUrl);
    }

    ss.progressByMake[make] = {
      lastCompletedPage: page,
      updatedAt: new Date().toISOString(),
      mode: state.mode,
      source: sourceKey,
    };
    await saveState();

    if (cfg.singlePassPerMake) break;
    page += 1;
    ss.currentPage = page;
    if ((pageTotal > 0 && pageRangeEnd >= pageTotal) || page > cfg.maxPagesPerMake) break;
    await humanPause('between_pages');
  }

  ss.progressByMake[make] = {
    ...(ss.progressByMake[make] || {}),
    complete: true,
    updatedAt: new Date().toISOString(),
    mode: state.mode,
    totalListings: Number(state.currentMakeTotalListings || 0),
    lastRangeStart: Number(state.currentMakeRangeStart || 0),
    lastRangeEnd: Number(state.currentMakeRangeEnd || 0),
    source: sourceKey,
  };
  ss.currentMakeIndex += 1;
  ss.currentPage = 1;
  ss.lastResultFingerprint = null;
  ss.stagnantResultRepeats = 0;
  if (ss.currentMakeIndex >= ss.makes.length) moveToNextCategory(sourceKey, ss);
  if (ss.complete && !ss.blocked) sd.status = 'complete';
  await saveState();
}

function allSourcesComplete() {
  const selected = Array.isArray(state.sources) && state.sources.length ? state.sources : Object.keys(SOURCE_CONFIG);
  return selected.every((sourceKey) => sourceState(sourceKey).complete);
}

async function runHarvest() {
  const alive = await pingBridge();
  if (!alive) {
    state.running = false;
    state.runStatus = 'paused';
    state.pausedReason = 'bridge_offline';
    state.lastFailureReason = 'bridge_offline';
    await saveState();
    notifyPopup('ERROR', { message: 'Unified bridge not running on 8765' });
    return;
  }

  state.running = true;
  state.runStatus = 'running';
  state.pausedReason = null;
  state.startedAt = state.startedAt || new Date().toISOString();
  await saveState();
  notifyPopup('STATUS_UPDATE', { state });

  const selected = Array.isArray(state.sources) && state.sources.length ? state.sources : ['controller', 'globalair', 'tap', 'aerotrader'];
  while (state.running) {
    if (allSourcesComplete()) break;
    for (const sourceKey of selected) {
      if (!state.running) break;
      if (!SOURCE_CONFIG[sourceKey]) continue;
      const ss = sourceState(sourceKey);
      if (ss.complete) continue;
      if (state.rotateSources) {
        await processOneMakeForSource(sourceKey);
        await humanPause('between_sources');
      } else {
        while (state.running && !ss.complete) {
          await processOneMakeForSource(sourceKey);
          await humanPause('between_makes');
        }
      }
    }
  }

  state.running = false;
  state.runStatus = 'complete';
  state.pausedReason = null;
  state.currentSource = null;
  state.lastMessage = `Run complete (${state.mode})`;
  for (const sourceKey of Object.keys(SOURCE_CONFIG)) {
    const sd = sourceDiag(sourceKey);
    const ss = sourceState(sourceKey);
    if (ss.blocked) sd.status = 'blocked';
    else if (ss.complete) sd.status = 'complete';
    else if (!state.running) sd.status = 'idle';
  }
  await saveState();
  notifyPopup('HARVEST_COMPLETE', { state });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.action === 'GET_STATE') {
      await loadState();
      sendResponse({ state });
      return;
    }
    if (message.action === 'GET_BRIDGE_STATUS') {
      sendResponse({ alive: await pingBridge() });
      return;
    }
    if (message.action === 'START_HARVEST') {
      await loadState();
      if (state.running) return sendResponse({ ok: false, error: 'Already running' });
      const makes = Array.isArray(message.makes) ? message.makes : [];
      const sourceMakes = normalizedSourceMakes(message.sourceMakes);
      const mode = message.mode === 'detailed' ? 'detailed' : 'card_only';
      const detailNewOnly = !!message.detailNewOnly;
      const incomingController = message.controllerCategories && message.controllerCategories.length
        ? message.controllerCategories
        : (message.controllerCategory || state.controllerCategories);
      const incomingGlobal = message.globalAirCategories && message.globalAirCategories.length
        ? message.globalAirCategories
        : (message.globalAirCategory || state.globalAirCategories);
      const incomingTap = message.tapCategories && message.tapCategories.length
        ? message.tapCategories
        : (message.tapCategory || state.tapCategories);
      const controllerCategories = sanitizeCategoryList(
        incomingController,
        sanitizeControllerCategory,
        'piston-single-aircraft'
      );
      const globalAirCategories = sanitizeCategoryList(
        incomingGlobal,
        sanitizeGlobalAirCategory,
        'single-engine-piston'
      );
      const tapCategories = sanitizeCategoryList(
        incomingTap,
        sanitizeTapCategory,
        'single-engine-piston'
      );
      const aerotraderSearchZip = sanitizeAeroTraderSearchZip(message.aerotraderSearchZip || state.aerotraderSearchZip);
      const aerotraderSearchRadius = sanitizeAeroTraderSearchRadius(message.aerotraderSearchRadius || state.aerotraderSearchRadius);
      const aerotraderStartFromCurrentTab = !!message.aerotraderStartFromCurrentTab;
      const startFresh = !!message.startFresh;
      const sources = (Array.isArray(message.sources) ? message.sources : ['controller', 'globalair', 'tap', 'aerotrader']).filter((s) => !!SOURCE_CONFIG[s]);
      const rotateSources = message.rotateSources !== false;

      state.sessionExtracted = 0;
      state.sessionUpserted = 0;
      state.sessionDetailProcessed = 0;
      state.lastMessage = '';
      state.challengeDetected = false;
      state.lastFailureReason = null;
      state.sourceDiagnostics = defaultSourceDiagnostics();
      state.controllerCategories = [...controllerCategories];
      state.globalAirCategories = [...globalAirCategories];
      state.tapCategories = [...tapCategories];
      state.controllerCategory = controllerCategories[0];
      state.globalAirCategory = globalAirCategories[0];
      state.tapCategory = tapCategories[0];
      state.aerotraderSearchZip = aerotraderSearchZip;
      state.aerotraderSearchRadius = aerotraderSearchRadius;
      state.aerotraderStartFromCurrentTab = aerotraderStartFromCurrentTab;
      state.detailNewOnly = detailNewOnly;

      if (startFresh || !hasCheckpoint()) {
        resetRunState({
          makes,
          sourceMakes,
          mode,
          sources,
          rotateSources,
          controllerCategories,
          globalAirCategories,
          tapCategories,
          aerotraderSearchZip,
          aerotraderSearchRadius,
          aerotraderStartFromCurrentTab,
          detailNewOnly,
        });
      } else {
        state.mode = mode;
        state.controllerCategories = [...controllerCategories];
        state.globalAirCategories = [...globalAirCategories];
        state.tapCategories = [...tapCategories];
        state.controllerCategory = controllerCategories[0];
        state.globalAirCategory = globalAirCategories[0];
        state.tapCategory = tapCategories[0];
        state.aerotraderSearchZip = aerotraderSearchZip;
        state.aerotraderSearchRadius = aerotraderSearchRadius;
        state.aerotraderStartFromCurrentTab = aerotraderStartFromCurrentTab;
        state.detailNewOnly = detailNewOnly;
        state.rotateSources = rotateSources;
        state.sources = sources.length ? sources : state.sources;
        const categoryBySource = {
          controller: controllerCategories,
          globalair: globalAirCategories,
          tap: tapCategories,
          aerotrader: [],
        };
        for (const sourceKey of ['controller', 'globalair', 'tap', 'aerotrader']) {
          const ss = sourceState(sourceKey);
          ss.categories = [...(categoryBySource[sourceKey] || [])];
          ss.currentCategoryIndex = 0;
          ss.currentCategory = ss.categories[0] || null;
          ss.blocked = false;
          ss.blockedReason = null;
          ss.blockedUntilMs = null;
          ss.cooldownLevel = 0;
          ss.noProgressCycles = 0;
          ss.detailDisabled = false;
          ss.needsMakeDiscovery = false;
          ss.warmedUp = false;
          const sd = sourceDiag(sourceKey);
          sd.status = 'idle';
          sd.lastReason = null;
          sd.lastMessage = '';
          sd.lastUrl = null;
          sd.retries = 0;
          sd.emptyPages = 0;
          sd.blockedReason = null;
          const specific = sourceMakes[sourceKey];
          if (Array.isArray(specific) && specific.length === 0) {
            ss.seedMakes = [];
            ss.makes = [];
            ss.complete = false;
            ss.currentMakeIndex = 0;
            ss.currentPage = 1;
            ss.needsMakeDiscovery = true;
            continue;
          }
          if (specific && specific.length) {
            ss.seedMakes = [...specific];
            ss.makes = [...specific];
            ss.complete = false;
            ss.currentMakeIndex = 0;
            ss.currentPage = 1;
            ss.needsMakeDiscovery = false;
        ss.lastResultFingerprint = null;
        ss.stagnantResultRepeats = 0;
            continue;
          }
          if (makes.length) {
            ss.seedMakes = [...makes];
            ss.makes = [...makes];
            ss.complete = false;
            ss.currentMakeIndex = 0;
            ss.currentPage = 1;
            ss.needsMakeDiscovery = false;
        ss.lastResultFingerprint = null;
        ss.stagnantResultRepeats = 0;
          } else {
            ss.seedMakes = [];
          }
        }
      }

      await saveState();
      runHarvest().catch(async (err) => {
        await pauseRun('runtime_error', { message: String(err && err.message ? err.message : err) });
      });
      sendResponse({ ok: true });
      return;
    }
    if (message.action === 'SET_GLOBALAIR_CATEGORIES' || message.action === 'SET_GLOBALAIR_CATEGORY') {
      await loadState();
      if (!state.running) {
        const incoming = message.categories || message.category;
        state.globalAirCategories = sanitizeCategoryList(incoming, sanitizeGlobalAirCategory, 'single-engine-piston');
        state.globalAirCategory = state.globalAirCategories[0];
        const ss = sourceState('globalair');
        ss.categories = [...state.globalAirCategories];
        ss.currentCategoryIndex = 0;
        ss.currentCategory = ss.categories[0] || null;
        await saveState();
      }
      sendResponse({ ok: true, categories: state.globalAirCategories });
      return;
    }
    if (message.action === 'SET_CONTROLLER_CATEGORIES' || message.action === 'SET_CONTROLLER_CATEGORY') {
      await loadState();
      if (!state.running) {
        const incoming = message.categories || message.category;
        state.controllerCategories = sanitizeCategoryList(incoming, sanitizeControllerCategory, 'piston-single-aircraft');
        state.controllerCategory = state.controllerCategories[0];
        const ss = sourceState('controller');
        ss.categories = [...state.controllerCategories];
        ss.currentCategoryIndex = 0;
        ss.currentCategory = ss.categories[0] || null;
        await saveState();
      }
      sendResponse({ ok: true, categories: state.controllerCategories });
      return;
    }
    if (message.action === 'SET_TAP_CATEGORIES' || message.action === 'SET_TAP_CATEGORY') {
      await loadState();
      if (!state.running) {
        const incoming = message.categories || message.category;
        state.tapCategories = sanitizeCategoryList(incoming, sanitizeTapCategory, 'single-engine-piston');
        state.tapCategory = state.tapCategories[0];
        const ss = sourceState('tap');
        ss.categories = [...state.tapCategories];
        ss.currentCategoryIndex = 0;
        ss.currentCategory = ss.categories[0] || null;
        await saveState();
      }
      sendResponse({ ok: true, categories: state.tapCategories });
      return;
    }
    if (message.action === 'SET_AEROTRADER_SEARCH') {
      await loadState();
      if (!state.running) {
        state.aerotraderSearchZip = sanitizeAeroTraderSearchZip(message.zip || state.aerotraderSearchZip);
        state.aerotraderSearchRadius = sanitizeAeroTraderSearchRadius(message.radius || state.aerotraderSearchRadius);
        await saveState();
      }
      sendResponse({ ok: true, zip: state.aerotraderSearchZip, radius: state.aerotraderSearchRadius });
      return;
    }
    if (message.action === 'SET_MODE') {
      await loadState();
      if (state.running) return sendResponse({ ok: false, error: 'Cannot change mode while running' });
      state.mode = message.mode === 'detailed' ? 'detailed' : 'card_only';
      await saveState();
      notifyPopup('STATUS_UPDATE', { state });
      sendResponse({ ok: true, mode: state.mode });
      return;
    }
    if (message.action === 'STOP_HARVEST') {
      state.running = false;
      state.runStatus = 'paused';
      state.pausedReason = 'operator_stop';
      state.pausedAt = new Date().toISOString();
      await saveState();
      sendResponse({ ok: true });
      return;
    }
    sendResponse({ ok: false, error: 'Unknown action' });
  })();
  return true;
});
