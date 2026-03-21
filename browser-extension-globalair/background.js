'use strict';

const BRIDGE_URL = 'http://localhost:8766';
const GLOBALAIR_BASE = 'https://www.globalair.com';
const CATEGORY = 'single-engine-piston';
const DEFAULT_MAKES = ['Cessna 172', 'Cirrus Aircraft', 'Beechcraft'];
const SAFE_TIMING = {
  pageDwellMs: [2200, 4800],
  betweenPagesMs: [2600, 5200],
  betweenMakesMs: [4200, 9000],
  retryDelayMs: [1800, 3600],
  detailDwellMs: [2200, 4200],
  betweenDetailsMs: [1200, 2600],
};

function defaultState() {
  return {
    running: false,
    runStatus: 'idle',
    pausedReason: null,
    mode: 'card_only',
    riskProfile: 'safe',
    currentMake: null,
    currentMakeIndex: 0,
    currentPage: 1,
    totalExtracted: 0,
    totalUpserted: 0,
    sessionExtracted: 0,
    sessionUpserted: 0,
    sessionDetailProcessed: 0,
    failedUrls: [],
    makes: [],
    progressByMake: {},
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
  await chrome.storage.local.set({ globalAirHarvestState: state });
}

async function loadState() {
  const result = await chrome.storage.local.get(['globalAirHarvestState']);
  if (result.globalAirHarvestState) state = { ...defaultState(), ...result.globalAirHarvestState };
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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

async function getGlobalAirTab() {
  const tabs = await chrome.tabs.query({ url: 'https://www.globalair.com/*' });
  if (tabs.length) return tabs[0].id;
  const tab = await chrome.tabs.create({ url: `${GLOBALAIR_BASE}/aircraft-for-sale`, active: false });
  return tab.id;
}

function waitForTabComplete(tabId, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timeout = setTimeout(() => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('tab load timeout'));
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

function notifyPopup(type, payload = {}) {
  chrome.runtime.sendMessage({ type, ...payload }).catch(() => {});
}

function makeUrl(make, page = 1) {
  const base = `${GLOBALAIR_BASE}/aircraft-for-sale/${CATEGORY}/${slugify(make)}`;
  if (page <= 1) return base;
  return `${base}?page=${page}`;
}

function hasCheckpoint() {
  return (
    Number(state.currentMakeIndex || 0) > 0 ||
    Number(state.currentPage || 1) > 1 ||
    Object.keys(state.progressByMake || {}).length > 0
  );
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

function resetRunState({ makes, mode }) {
  state.running = false;
  state.runStatus = 'idle';
  state.pausedReason = null;
  state.currentMake = null;
  state.currentMakeIndex = 0;
  state.currentPage = 1;
  state.totalExtracted = 0;
  state.totalUpserted = 0;
  state.sessionExtracted = 0;
  state.sessionUpserted = 0;
  state.sessionDetailProcessed = 0;
  state.failedUrls = [];
  state.progressByMake = {};
  state.startedAt = null;
  state.pausedAt = null;
  state.lastMessage = '';
  state.lastUrl = null;
  state.lastFailureReason = null;
  state.challengeDetected = false;
  state.lastPageTitle = null;
  state.lastSelectorUsed = null;
  state.lastCandidateAnchors = 0;
  state.lastParsedRows = 0;
  state.currentMakeTotalListings = 0;
  state.currentMakeRangeStart = 0;
  state.currentMakeRangeEnd = 0;
  state.makes = Array.isArray(makes) && makes.length ? makes : [];
  state.mode = mode || 'card_only';
}

async function fetchCards(tabId) {
  let lastResult = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const challenge = await sendToContent(tabId, { action: 'CHECK_CHALLENGE' });
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
  for (const row of rows) {
    if (!state.running) break;
    let detailTabId = null;
    try {
      const detailTab = await chrome.tabs.create({ url: row.url, active: false });
      detailTabId = detailTab.id;
      await waitForTabComplete(detailTabId);
      await humanPause('detail_dwell');

      const challenge = await sendToContent(detailTabId, { action: 'CHECK_CHALLENGE' });
      if (challenge && challenge.challengeDetected) {
        if (detailTabId) await chrome.tabs.remove(detailTabId).catch(() => {});
        return { challengeDetected: true, challengeUrl: challenge.currentUrl || row.url };
      }

      await sendToContent(detailTabId, { action: 'HUMAN_SCROLL' });
      const detail = await sendToContent(detailTabId, { action: 'EXTRACT_DETAIL', listing: row });
      if (detail && detail.success && detail.listing) {
        enriched.push({ ...row, ...detail.listing });
      } else {
        enriched.push(row);
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
    await humanPause('between_details');
  }
  return { challengeDetected: false, rows: enriched };
}

async function runHarvest() {
  const alive = await pingBridge();
  if (!alive) {
    state.running = false;
    state.runStatus = 'paused';
    state.pausedReason = 'bridge_offline';
    state.lastFailureReason = 'bridge_offline';
    await saveState();
    notifyPopup('ERROR', { message: 'GlobalAir bridge not running on 8766' });
    return;
  }

  const tabId = await getGlobalAirTab();
  state.running = true;
  state.runStatus = 'running';
  state.pausedReason = null;
  state.startedAt = state.startedAt || new Date().toISOString();
  await saveState();
  notifyPopup('STATUS_UPDATE', { state });

  if (!state.makes.length) state.makes = [...DEFAULT_MAKES];
  if (state.currentMakeIndex >= state.makes.length) {
    state.currentMakeIndex = 0;
    state.currentPage = 1;
  }

  for (let makeIdx = state.currentMakeIndex; makeIdx < state.makes.length; makeIdx += 1) {
    if (!state.running) break;
    const make = state.makes[makeIdx];
    state.currentMake = make;
    state.currentMakeIndex = makeIdx;
    let page = makeIdx === state.currentMakeIndex ? Math.max(1, state.currentPage || 1) : 1;
    let emptyPages = 0;
    let extractionFailures = 0;

    while (state.running) {
      state.currentPage = page;
      await saveState();
      notifyPopup('STATUS_UPDATE', { state });

      const pageUrl = makeUrl(make, page);
      state.lastUrl = pageUrl;
      try {
        await goTo(tabId, pageUrl);
      } catch {
        extractionFailures += 1;
        state.lastFailureReason = 'tab_load_timeout';
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
        await pauseRun('challenge_detected', {
          url: res.challengeUrl || pageUrl,
          message: `Challenge detected at ${pageUrl}`,
          failureReason: 'challenge_detected',
        });
        return;
      }

      if (!res || res.success === false) {
        extractionFailures += 1;
        state.lastFailureReason = (res && res.error) || 'extract_cards_failed';
        state.failedUrls.push(pageUrl);
        if (extractionFailures >= 2) break;
        await humanPause('retry');
        continue;
      }

      const rows = Array.isArray(res.listings) ? res.listings : [];
      const pageTotal = Number((res.meta && res.meta.totalListings) || 0);
      const pageRangeEnd = Number((res.meta && res.meta.rangeEnd) || 0);
      if (rows.length === 0) {
        if (pageTotal > 0 && pageRangeEnd === 0) {
          extractionFailures += 1;
          state.lastFailureReason = 'render_not_ready';
          if (extractionFailures >= 4) break;
          await humanPause('retry');
          continue;
        }
        emptyPages += 1;
        state.lastFailureReason = 'empty_cards';
        state.lastParsedRows = 0;
        if (emptyPages >= 1) break;
        page += 1;
        state.currentPage = page;
        await humanPause('between_pages');
        continue;
      }

      extractionFailures = 0;
      emptyPages = 0;
      state.lastFailureReason = null;
      state.challengeDetected = false;
      state.totalExtracted += rows.length;
      state.sessionExtracted += rows.length;
      state.sessionDetailProcessed = 0;
      state.lastMessage = `Parsed ${rows.length} cards on page ${page}`;
      await saveState();
      notifyPopup('STATUS_UPDATE', { state });

      let rowsToSave = rows;
      if (state.mode === 'detailed') {
        const detailed = await enrichWithDetails(rows);
        if (detailed.challengeDetected) {
          await pauseRun('challenge_detected', {
            url: detailed.challengeUrl || pageUrl,
            message: `Challenge detected while loading details for ${make}`,
            failureReason: 'detail_challenge_detected',
          });
          return;
        }
        rowsToSave = detailed.rows;
      }

      try {
        const savedCount = await postListings(rowsToSave);
        state.totalUpserted += savedCount;
        state.sessionUpserted += savedCount;
        state.lastMessage = `Saved ${savedCount} rows on page ${page}`;
      } catch {
        state.lastFailureReason = 'bridge_ingest_failed';
        state.failedUrls.push(pageUrl);
      }

      state.progressByMake[make] = {
        lastCompletedPage: page,
        updatedAt: new Date().toISOString(),
        mode: state.mode,
      };

      await saveState();
      // GlobalAir uses load-more on one URL; page progression is currently single-pass.
      break;
    }

    if (!state.running) {
      await saveState();
      break;
    }

    state.progressByMake[make] = {
      ...(state.progressByMake[make] || {}),
      complete: true,
      updatedAt: new Date().toISOString(),
      mode: state.mode,
      totalListings: Number(state.currentMakeTotalListings || 0),
      lastRangeStart: Number(state.currentMakeRangeStart || 0),
      lastRangeEnd: Number(state.currentMakeRangeEnd || 0),
    };
    state.currentMakeIndex = makeIdx + 1;
    state.currentPage = 1;
    await saveState();
    await humanPause('between_makes');
  }

  state.running = false;
  state.runStatus = 'complete';
  state.pausedReason = null;
  state.lastMessage = `Run complete (${state.mode})`;
  await saveState();
  notifyPopup('HARVEST_COMPLETE', { state });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.action === 'GET_STATE') {
      await loadState();
      sendResponse({ state });
    } else if (message.action === 'GET_BRIDGE_STATUS') {
      sendResponse({ alive: await pingBridge() });
    } else if (message.action === 'START_HARVEST') {
      await loadState();
      if (state.running) return sendResponse({ ok: false, error: 'Already running' });

      const makes = Array.isArray(message.makes) ? message.makes : [];
      const mode = message.mode === 'detailed' ? 'detailed' : 'card_only';
      const startFresh = !!message.startFresh;

      state.sessionExtracted = 0;
      state.sessionUpserted = 0;
      state.sessionDetailProcessed = 0;
      state.lastMessage = '';

      if (startFresh || !hasCheckpoint()) {
        resetRunState({ makes, mode });
      } else {
        if (makes.length) state.makes = makes;
        state.mode = mode;
      }

      if (!state.makes.length) state.makes = [...DEFAULT_MAKES];
      if (state.currentMakeIndex >= state.makes.length) {
        state.currentMakeIndex = 0;
        state.currentPage = 1;
      }

      await saveState();
      runHarvest().catch(async (err) => {
        await pauseRun('runtime_error', { message: String(err && err.message ? err.message : err) });
      });
      sendResponse({ ok: true });
    } else if (message.action === 'SET_MODE') {
      await loadState();
      if (state.running) return sendResponse({ ok: false, error: 'Cannot change mode while running' });
      state.mode = message.mode === 'detailed' ? 'detailed' : 'card_only';
      await saveState();
      notifyPopup('STATUS_UPDATE', { state });
      sendResponse({ ok: true, mode: state.mode });
    } else if (message.action === 'STOP_HARVEST') {
      state.running = false;
      state.runStatus = 'paused';
      state.pausedReason = 'operator_stop';
      state.pausedAt = new Date().toISOString();
      await saveState();
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false, error: 'Unknown action' });
    }
  })();
  return true;
});
