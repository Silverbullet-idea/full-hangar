let logLines = [];

function addLog(msg) {
  const now = new Date().toLocaleTimeString();
  logLines.unshift(`[${now}] ${msg}`);
  if (logLines.length > 50) logLines = logLines.slice(0, 50);
  const logEl = document.getElementById('log');
  logEl.innerHTML = logLines
    .map((l) => `<div class="log-line ${l.includes('ERROR') ? 'error' : l.includes('Complete') ? 'success' : ''}">${l}</div>`)
    .join('');
}

function updateUI(state, bridgeAlive) {
  const dot = document.getElementById('bridge-dot');
  const label = document.getElementById('bridge-label');
  dot.className = 'dot ' + (bridgeAlive ? 'alive' : 'dead');
  label.textContent = bridgeAlive ? 'GlobalAir bridge running on :8766' : 'Bridge offline - start bridge_server_globalair.py';

  document.getElementById('stat-extracted').textContent = state.totalExtracted || 0;
  document.getElementById('stat-upserted').textContent = state.totalUpserted || 0;
  document.getElementById('stat-failed').textContent = (state.failedUrls || []).length;

  let statusText = 'Idle';
  if (state.running) {
    statusText = `Running: ${state.currentMake || ''} | Queue: ${(state.listingQueue || []).length}`;
  } else if (state.startedAt) {
    statusText = `Last run: ${state.totalExtracted || 0} extracted`;
  }
  document.getElementById('current-status').textContent = statusText;

  document.getElementById('btn-start').disabled = !!state.running;
  document.getElementById('btn-stop').disabled = !state.running;
  document.getElementById('btn-resume').disabled = !!state.running || !(state.makeIndex > 0 || state.currentPage > 1);
  document.getElementById('makes-input').disabled = !!state.running;
  document.getElementById('mode-select').disabled = !!state.running;
}

async function refreshStatus() {
  const stateResp = await chrome.runtime.sendMessage({ action: 'GET_STATE' });
  const bridgeResp = await chrome.runtime.sendMessage({ action: 'GET_BRIDGE_STATUS' });
  updateUI((stateResp && stateResp.state) || {}, !!(bridgeResp && bridgeResp.alive));
}

document.getElementById('btn-start').addEventListener('click', async () => {
  const modelsRaw = document.getElementById('makes-input').value.trim();
  const makes = modelsRaw ? modelsRaw.split('\n').map((s) => s.trim()).filter(Boolean) : [];
  const mode = document.getElementById('mode-select').value;
  const resp = await chrome.runtime.sendMessage({ action: 'START_HARVEST', makes, mode });
  if (resp.ok) {
    addLog('Harvest started');
  } else {
    addLog('ERROR: ' + resp.error);
  }
  refreshStatus();
});

document.getElementById('btn-stop').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ action: 'STOP_HARVEST' });
  addLog('Harvest stopped');
  refreshStatus();
});

document.getElementById('btn-resume').addEventListener('click', async () => {
  const resp = await chrome.runtime.sendMessage({ action: 'RESUME_HARVEST' });
  if (resp.ok) addLog('Harvest resumed');
  refreshStatus();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'STATUS_UPDATE') updateUI(message.state, true);
  if (message.type === 'ERROR') addLog('ERROR: ' + message.message);
  if (message.type === 'HARVEST_COMPLETE') {
    addLog(`Complete - ${message.state.totalExtracted} extracted`);
    updateUI(message.state, true);
  }
});

refreshStatus();
setInterval(refreshStatus, 5000);
