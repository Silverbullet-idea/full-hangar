'use strict';

const BRIDGE_URL = 'http://localhost:8765';
const CONTROLLER_BASE = 'https://www.controller.com';

let state = {
  running: false,
  currentMake: null,
  currentPage: 1,
  totalExtracted: 0,
  totalUpserted: 0,
  failedUrls: [],
  makes: [],
};

async function saveState() {
  await chrome.storage.local.set({ controllerHarvestState: state });
}

async function loadState() {
  const result = await chrome.storage.local.get(['controllerHarvestState']);
  if (result.controllerHarvestState) state = { ...state, ...result.controllerHarvestState };
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

async function getControllerTab() {
  const tabs = await chrome.tabs.query({ url: 'https://www.controller.com/*' });
  if (tabs.length) return tabs[0].id;
  const tab = await chrome.tabs.create({ url: CONTROLLER_BASE, active: false });
  return tab.id;
}

async function goTo(tabId, url) {
  await chrome.tabs.update(tabId, { url });
  await new Promise((resolve) => {
    chrome.tabs.onUpdated.addListener(function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    });
  });
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
  if (page <= 1) return `${CONTROLLER_BASE}/listings/search?keywords=${encodeURIComponent(make)}`;
  return `${CONTROLLER_BASE}/listings/search?page=${page}&keywords=${encodeURIComponent(make)}`;
}

async function runHarvest() {
  const alive = await pingBridge();
  if (!alive) {
    state.running = false;
    await saveState();
    notifyPopup('ERROR', { message: 'Controller bridge not running on 8765' });
    return;
  }
  const tabId = await getControllerTab();
  state.running = true;
  await saveState();
  notifyPopup('STATUS_UPDATE', { state });

  const makes = state.makes.length ? state.makes : ['Cessna', 'Piper', 'Beechcraft'];
  for (const make of makes) {
    if (!state.running) break;
    state.currentMake = make;
    let page = 1;
    let emptyPages = 0;
    while (state.running) {
      state.currentPage = page;
      await saveState();
      notifyPopup('STATUS_UPDATE', { state });
      await goTo(tabId, makeUrl(make, page));
      const res = await sendToContent(tabId, { action: 'EXTRACT_CARDS' });
      const rows = res && Array.isArray(res.listings) ? res.listings : [];
      if (!rows.length) {
        emptyPages += 1;
        if (emptyPages >= 2) break;
        page += 1;
        continue;
      }
      emptyPages = 0;
      state.totalExtracted += rows.length;
      try {
        state.totalUpserted += await postListings(rows);
      } catch {
        state.failedUrls.push(makeUrl(make, page));
      }
      await saveState();
      page += 1;
      if (page > 20) break;
    }
  }
  state.running = false;
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
      state.makes = message.makes || [];
      state.totalExtracted = 0;
      state.totalUpserted = 0;
      state.failedUrls = [];
      await saveState();
      runHarvest();
      sendResponse({ ok: true });
    } else if (message.action === 'STOP_HARVEST') {
      state.running = false;
      await saveState();
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false, error: 'Unknown action' });
    }
  })();
  return true;
});
