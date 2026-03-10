// background.js
// Full Hangar Harvester - Background Service Worker
// Manages the harvest queue, tab navigation, and pipeline coordination

'use strict';

const BRIDGE_URL = 'http://localhost:8765';
const CONTROLLER_BASE = 'https://www.controller.com';

// Harvest state (in-memory; persisted to chrome.storage.local)
let harvestState = {
  running: false,
  paused: false,
  currentMake: null,
  currentPage: 1,
  listingQueue: [], // URLs of detail pages to visit
  completedUrls: [],
  failedUrls: [],
  totalExtracted: 0,
  totalUpserted: 0,
  startedAt: null,
  lastActivity: null,
  currentTabId: null,
  mode: 'cards_only', // 'cards_only' or 'cards_and_details'
  makes: [],
  makeIndex: 0,
};

// --- STATE PERSISTENCE -------------------------------------------------------

async function saveState() {
  await chrome.storage.local.set({ harvestState });
}

async function loadState() {
  const result = await chrome.storage.local.get(['harvestState']);
  if (result.harvestState) {
    harvestState = { ...harvestState, ...result.harvestState };
  }
}

// --- TAB HELPERS -------------------------------------------------------------

async function getOrCreateControllerTab() {
  const tabs = await chrome.tabs.query({ url: 'https://www.controller.com/*' });
  if (tabs.length) return tabs[0].id;
  const tab = await chrome.tabs.create({ url: CONTROLLER_BASE, active: false });
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
  // Extra wait for JS rendering
  await sleep(2000 + Math.random() * 2000);
}

async function sendToContent(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (err) {
    console.warn('[FullHangar] sendToContent error:', err.message);
    return null;
  }
}

// --- BRIDGE COMMUNICATION ----------------------------------------------------

async function pingBridge() {
  try {
    const resp = await fetch(`${BRIDGE_URL}/ping`, {
      signal: AbortSignal.timeout(3000),
    });
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
    const resp = await fetch(`${BRIDGE_URL}/status`, {
      signal: AbortSignal.timeout(3000),
    });
    return await resp.json();
  } catch {
    return null;
  }
}

// --- MAKE URL BUILDER --------------------------------------------------------

function buildSearchUrl(make, page = 1) {
  if (page <= 1) return `${CONTROLLER_BASE}/listings/search?keywords=${encodeURIComponent(make)}`;
  return `${CONTROLLER_BASE}/listings/search?page=${page}&keywords=${encodeURIComponent(make)}`;
}

// --- CORE HARVEST LOOP -------------------------------------------------------

async function runHarvestLoop() {
  const tabId = await getOrCreateControllerTab();
  harvestState.currentTabId = tabId;
  harvestState.running = true;
  harvestState.startedAt = harvestState.startedAt || new Date().toISOString();
  await saveState();

  notifyPopup({ type: 'STATUS_UPDATE', state: harvestState });

  const bridgeAlive = await pingBridge();
  if (!bridgeAlive) {
    harvestState.running = false;
    await saveState();
    notifyPopup({ type: 'ERROR', message: 'Bridge server not running. Start bridge_server.py first.' });
    return;
  }

  const makes = harvestState.makes.length
    ? harvestState.makes
    : ['Cessna', 'Piper', 'Beechcraft', 'Mooney', 'Cirrus', 'Diamond', 'Grumman', 'American Champion'];

  for (let makeIdx = harvestState.makeIndex; makeIdx < makes.length; makeIdx++) {
    if (!harvestState.running) break;
    const make = makes[makeIdx];
    harvestState.currentMake = make;
    harvestState.makeIndex = makeIdx;
    await saveState();

    notifyPopup({ type: 'STATUS_UPDATE', state: harvestState });

    // Paginate through search results for this make
    let page = harvestState.currentMake === make ? harvestState.currentPage : 1;
    let consecutiveEmpty = 0;

    while (harvestState.running) {
      const pageUrl = buildSearchUrl(make, page);
      harvestState.currentPage = page;
      await saveState();

      try {
        await navigateTab(tabId, pageUrl);
        await humanDelay(1500, 3500);

        const response = await sendToContent(tabId, { action: 'EXTRACT_CARDS' });

        if (!response || !response.listings || response.listings.length === 0) {
          consecutiveEmpty++;
          if (consecutiveEmpty >= 2) {
            console.log(`[FullHangar] No cards on ${make} page ${page}. Moving to next make.`);
            break;
          }
          await humanDelay(3000, 6000);
          continue;
        }

        consecutiveEmpty = 0;
        const listings = response.listings;
        console.log(`[FullHangar] ${make} page ${page}: extracted ${listings.length} cards`);

        // Push card-level data to bridge immediately (don't wait for details)
        const pushResult = await postListingsToBridge(listings);
        if (pushResult.ok) {
          harvestState.totalUpserted += pushResult.upserted || 0;
        }
        harvestState.totalExtracted += listings.length;
        await saveState();

        // If detail mode, enqueue detail URLs
        if (harvestState.mode === 'cards_and_details') {
          const detailUrls = listings.map((l) => l.url).filter(Boolean);
          harvestState.listingQueue.push(...detailUrls);
          await saveState();
        }

        notifyPopup({ type: 'STATUS_UPDATE', state: harvestState });

        // Check for block page (no cards but no error = possible block)
        if (listings.length < 3 && page > 1) {
          consecutiveEmpty++;
        }

        page++;
        await humanDelay(3000, 7000);

        // Occasional longer pause every ~5 pages
        if (page % 5 === 0) await humanDelay(8000, 15000);
      } catch (err) {
        console.error(`[FullHangar] Error on ${make} page ${page}:`, err);
        harvestState.failedUrls.push(pageUrl);
        await saveState();
        await humanDelay(10000, 20000);
        break;
      }
    }

    // Process detail queue if in detail mode
    if (harvestState.mode === 'cards_and_details' && harvestState.listingQueue.length) {
      await processDetailQueue(tabId);
    }

    // Between makes - longer human dwell
    if (makeIdx < makes.length - 1 && harvestState.running) {
      const betweenDelay = 20000 + Math.random() * 25000;
      console.log(`[FullHangar] Between makes: waiting ${(betweenDelay / 1000).toFixed(0)}s`);
      await sleep(betweenDelay);
    }
  }

  harvestState.running = false;
  harvestState.currentPage = 1;
  harvestState.makeIndex = 0;
  await saveState();
  notifyPopup({ type: 'HARVEST_COMPLETE', state: harvestState });
  console.log(`[FullHangar] Harvest complete. Extracted: ${harvestState.totalExtracted}, Upserted: ${harvestState.totalUpserted}`);
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
      await humanDelay(2000, 4000);

      const response = await sendToContent(tabId, { action: 'EXTRACT_DETAIL' });
      if (response && response.detail) {
        detailResults.push(response.detail);
        harvestState.completedUrls.push(url);
        if (detailResults.length >= 10) {
          await postListingsToBridge(detailResults.splice(0, detailResults.length));
        }
      }
    } catch (err) {
      harvestState.failedUrls.push(url);
    }

    await humanDelay(1500, 4000);
    if (Math.random() < 0.1) await humanDelay(8000, 15000);
  }

  if (detailResults.length) await postListingsToBridge(detailResults);
  await saveState();
}

// --- POPUP COMMUNICATION -----------------------------------------------------

function notifyPopup(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    // Popup may not be open
  });
}

// --- MESSAGE HANDLER ---------------------------------------------------------

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
          console.error('[FullHangar] Harvest loop error:', err);
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
        harvestState.running = false; // will be set true by loop
        await saveState();
        runHarvestLoop().catch((err) => console.error('[FullHangar] Resume error:', err));
        sendResponse({ ok: true });
        break;

      case 'GET_BRIDGE_STATUS': {
        const alive = await pingBridge();
        const bridgeStatus = alive ? await getHarvestStatus() : null;
        sendResponse({ alive, bridgeStatus });
        break;
      }

      case 'PAGE_LOADED':
        // Content script announces page loads - useful for monitoring
        harvestState.lastActivity = new Date().toISOString();
        await saveState();
        break;

      default:
        sendResponse({ ok: false, error: 'Unknown action' });
    }
  })();
  return true;
});

// Load state on startup
loadState();
