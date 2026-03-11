'use strict';

const BRIDGE_URL = 'http://localhost:8766';
const GLOBALAIR_BASE = 'https://www.globalair.com';
const DEFAULT_CATEGORY_PATH = 'single-engine-piston';

let harvestState = {
  running: false,
  paused: false,
  currentMake: null,
  currentPage: 1,
  listingQueue: [],
  completedUrls: [],
  failedUrls: [],
  totalExtracted: 0,
  totalUpserted: 0,
  startedAt: null,
  lastActivity: null,
  currentTabId: null,
  mode: 'cards_only',
  makes: [],
  makeIndex: 0,
};

async function saveState() {
  await chrome.storage.local.set({ globalAirHarvestState: harvestState });
}

async function loadState() {
  const result = await chrome.storage.local.get(['globalAirHarvestState']);
  if (result.globalAirHarvestState) {
    harvestState = { ...harvestState, ...result.globalAirHarvestState };
  }
}

async function getOrCreateGlobalAirTab() {
  const tabs = await chrome.tabs.query({ url: 'https://www.globalair.com/*' });
  if (tabs.length) return tabs[0].id;
  const tab = await chrome.tabs.create({ url: `${GLOBALAIR_BASE}/aircraft-for-sale`, active: false });
  await new Promise((resolve) => {
    chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
      if (tabId === tab.id && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    });
  });
  return tab.id;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function humanDelay(minMs = 2000, maxMs = 5000) {
  return sleep(minMs + Math.random() * (maxMs - minMs));
}

function slugifyMake(make) {
  return String(make || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim();
}

function buildSearchUrl(make) {
  const slug = slugifyMake(make);
  if (!slug) return `${GLOBALAIR_BASE}/aircraft-for-sale`;
  return `${GLOBALAIR_BASE}/aircraft-for-sale/${DEFAULT_CATEGORY_PATH}/${slug}`;
}

async function navigateTab(tabId, url) {
  await chrome.tabs.update(tabId, { url });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Navigation timeout')), 30000);
    chrome.tabs.onUpdated.addListener(function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    });
  });
  await sleep(1500 + Math.random() * 1500);
}

async function sendToContent(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (err) {
    console.warn('[FullHangar][GlobalAir] sendToContent error:', err.message);
    return null;
  }
}

async function pingBridge() {
  try {
    const resp = await fetch(`${BRIDGE_URL}/ping`, { signal: AbortSignal.timeout(3000) });
    return resp.ok;
  } catch {
    return false;
  }
}

async function postListingsToBridge(listings) {
  try {
    const resp = await fetch(`${BRIDGE_URL}/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(listings),
      signal: AbortSignal.timeout(15000),
    });
    const data = await resp.json();
    return { ok: true, upserted: data.upserted || 0, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function getHarvestStatus() {
  try {
    const resp = await fetch(`${BRIDGE_URL}/status`, { signal: AbortSignal.timeout(3000) });
    return await resp.json();
  } catch {
    return null;
  }
}

function notifyPopup(message) {
  chrome.runtime.sendMessage(message).catch(() => {});
}

async function processDetailQueue(tabId) {
  const batch = harvestState.listingQueue.splice(0, harvestState.listingQueue.length);
  await saveState();

  const detailResults = [];
  for (const url of batch) {
    if (!harvestState.running) break;
    if (harvestState.completedUrls.includes(url)) continue;

    try {
      await navigateTab(tabId, url);
      await humanDelay(1800, 3600);
      const response = await sendToContent(tabId, { action: 'EXTRACT_DETAIL' });
      if (response && response.detail) {
        detailResults.push(response.detail);
        harvestState.completedUrls.push(url);
        if (detailResults.length >= 10) {
          await postListingsToBridge(detailResults.splice(0, detailResults.length));
        }
      }
    } catch {
      harvestState.failedUrls.push(url);
    }

    await humanDelay(1200, 3200);
  }

  if (detailResults.length) await postListingsToBridge(detailResults);
  await saveState();
}

async function runHarvestLoop() {
  const tabId = await getOrCreateGlobalAirTab();
  harvestState.currentTabId = tabId;
  harvestState.running = true;
  harvestState.startedAt = harvestState.startedAt || new Date().toISOString();
  await saveState();
  notifyPopup({ type: 'STATUS_UPDATE', state: harvestState });

  const bridgeAlive = await pingBridge();
  if (!bridgeAlive) {
    harvestState.running = false;
    await saveState();
    notifyPopup({ type: 'ERROR', message: 'GlobalAir bridge not running. Start bridge_server_globalair.py first.' });
    return;
  }

  const makes = harvestState.makes.length
    ? harvestState.makes
    : ['Cessna 172', 'Piper', 'Beechcraft', 'Cirrus Aircraft', 'Diamond'];

  for (let makeIdx = harvestState.makeIndex; makeIdx < makes.length; makeIdx++) {
    if (!harvestState.running) break;
    const make = makes[makeIdx];
    harvestState.currentMake = make;
    harvestState.makeIndex = makeIdx;
    harvestState.currentPage = 1;
    await saveState();
    notifyPopup({ type: 'STATUS_UPDATE', state: harvestState });

    const pageUrl = buildSearchUrl(make);
    try {
      await navigateTab(tabId, pageUrl);
      await humanDelay(1200, 2800);

      const response = await sendToContent(tabId, { action: 'EXTRACT_CARDS' });
      const listings = response && Array.isArray(response.listings) ? response.listings : [];

      if (!listings.length) {
        console.log(`[FullHangar][GlobalAir] No cards found for ${make} (${pageUrl})`);
      } else {
        console.log(`[FullHangar][GlobalAir] ${make}: extracted ${listings.length} cards`);
        const pushResult = await postListingsToBridge(listings);
        if (pushResult.ok) {
          harvestState.totalUpserted += pushResult.upserted || 0;
        }
        harvestState.totalExtracted += listings.length;
        if (harvestState.mode === 'cards_and_details') {
          const detailUrls = listings.map((l) => l.url).filter(Boolean);
          harvestState.listingQueue.push(...detailUrls);
        }
        await saveState();
        notifyPopup({ type: 'STATUS_UPDATE', state: harvestState });
      }
    } catch (err) {
      console.error(`[FullHangar][GlobalAir] Error on ${make}:`, err);
      harvestState.failedUrls.push(pageUrl);
      await saveState();
    }

    if (harvestState.mode === 'cards_and_details' && harvestState.listingQueue.length) {
      await processDetailQueue(tabId);
    }

    if (makeIdx < makes.length - 1 && harvestState.running) {
      await humanDelay(6000, 12000);
    }
  }

  harvestState.running = false;
  harvestState.currentPage = 1;
  harvestState.makeIndex = 0;
  await saveState();
  notifyPopup({ type: 'HARVEST_COMPLETE', state: harvestState });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message.action) {
      case 'GET_STATE':
        await loadState();
        sendResponse({ state: harvestState });
        break;
      case 'START_HARVEST':
        await loadState();
        if (harvestState.running) {
          sendResponse({ ok: false, error: 'Already running' });
          break;
        }
        harvestState.makes = message.makes || [];
        harvestState.mode = message.mode || 'cards_only';
        harvestState.makeIndex = 0;
        harvestState.currentPage = 1;
        harvestState.totalExtracted = 0;
        harvestState.totalUpserted = 0;
        harvestState.listingQueue = [];
        harvestState.completedUrls = [];
        harvestState.failedUrls = [];
        harvestState.startedAt = new Date().toISOString();
        await saveState();
        runHarvestLoop().catch((err) => {
          console.error('[FullHangar][GlobalAir] Harvest loop error:', err);
          harvestState.running = false;
          saveState();
        });
        sendResponse({ ok: true });
        break;
      case 'STOP_HARVEST':
        harvestState.running = false;
        await saveState();
        sendResponse({ ok: true });
        notifyPopup({ type: 'STATUS_UPDATE', state: harvestState });
        break;
      case 'RESUME_HARVEST':
        await loadState();
        if (harvestState.running) {
          sendResponse({ ok: false, error: 'Already running' });
          break;
        }
        harvestState.running = false;
        await saveState();
        runHarvestLoop().catch((err) => console.error('[FullHangar][GlobalAir] Resume error:', err));
        sendResponse({ ok: true });
        break;
      case 'GET_BRIDGE_STATUS': {
        const alive = await pingBridge();
        const bridgeStatus = alive ? await getHarvestStatus() : null;
        sendResponse({ alive, bridgeStatus });
        break;
      }
      case 'PAGE_LOADED':
        harvestState.lastActivity = new Date().toISOString();
        await saveState();
        break;
      default:
        sendResponse({ ok: false, error: 'Unknown action' });
    }
  })();
  return true;
});

loadState();
