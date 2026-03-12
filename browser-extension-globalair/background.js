'use strict';

const BRIDGE_URL = 'http://localhost:8766';
const BASE = 'https://www.globalair.com';
const CATEGORY = 'single-engine-piston';

let state = {
  running: false,
  currentMake: null,
  totalExtracted: 0,
  totalUpserted: 0,
  failedUrls: [],
  makes: [],
};

async function saveState() { await chrome.storage.local.set({ globalAirHarvestState: state }); }
async function loadState() {
  const r = await chrome.storage.local.get(['globalAirHarvestState']);
  if (r.globalAirHarvestState) state = { ...state, ...r.globalAirHarvestState };
}
function slugify(v) {
  return String(v || '').toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function modelUrl(make) { return `${BASE}/aircraft-for-sale/${CATEGORY}/${slugify(make)}`; }
async function pingBridge() {
  try { return (await fetch(`${BRIDGE_URL}/ping`, { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; }
}
async function getTab() {
  const tabs = await chrome.tabs.query({ url: 'https://www.globalair.com/*' });
  if (tabs.length) return tabs[0].id;
  return (await chrome.tabs.create({ url: `${BASE}/aircraft-for-sale`, active: false })).id;
}
async function go(tabId, url) {
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
async function sendToContent(tabId, msg) { try { return await chrome.tabs.sendMessage(tabId, msg); } catch { return null; } }
async function postRows(rows) {
  const r = await fetch(`${BRIDGE_URL}/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rows),
  });
  const j = await r.json();
  return j.upserted || 0;
}
function notify(type, payload = {}) { chrome.runtime.sendMessage({ type, ...payload }).catch(() => {}); }

async function runHarvest() {
  if (!(await pingBridge())) {
    state.running = false;
    await saveState();
    notify('ERROR', { message: 'GlobalAir bridge not running on 8766' });
    return;
  }
  const tabId = await getTab();
  state.running = true;
  await saveState();
  notify('STATUS_UPDATE', { state });

  const makes = state.makes.length ? state.makes : ['Cessna 172', 'Cirrus Aircraft', 'Beechcraft'];
  for (const make of makes) {
    if (!state.running) break;
    state.currentMake = make;
    await saveState();
    await go(tabId, modelUrl(make));
    const res = await sendToContent(tabId, { action: 'EXTRACT_CARDS' });
    const rows = res && Array.isArray(res.listings) ? res.listings : [];
    state.totalExtracted += rows.length;
    try {
      state.totalUpserted += await postRows(rows);
    } catch {
      state.failedUrls.push(modelUrl(make));
    }
    await saveState();
    notify('STATUS_UPDATE', { state });
  }
  state.running = false;
  await saveState();
  notify('HARVEST_COMPLETE', { state });
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
