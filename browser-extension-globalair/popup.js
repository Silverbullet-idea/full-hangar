async function refresh() {
  const stateResp = await chrome.runtime.sendMessage({ action: 'GET_STATE' });
  const bridgeResp = await chrome.runtime.sendMessage({ action: 'GET_BRIDGE_STATUS' });
  const s = (stateResp && stateResp.state) || {};
  const startBtn = document.getElementById('start');
  const stopBtn = document.getElementById('stop');
  document.getElementById('extracted').textContent = s.sessionExtracted ?? s.totalExtracted ?? 0;
  document.getElementById('upserted').textContent = s.sessionUpserted ?? s.totalUpserted ?? 0;
  document.getElementById('failed').textContent = (s.failedUrls || []).length;
  document.getElementById('diag-challenge').textContent = s.challengeDetected ? 'yes' : 'no';
  document.getElementById('diag-details').textContent = `${Number(s.sessionDetailProcessed || 0)} / ${Number(s.lastParsedRows || 0)}`;
  document.getElementById('diag-reason').textContent = s.lastFailureReason
    ? String(s.lastFailureReason).replaceAll('_', ' ')
    : 'none';
  document.getElementById('diag-activity').textContent = s.lastMessage || 'idle';
  document.getElementById('diag-title').textContent = s.lastPageTitle || 'n/a';
  document.getElementById('diag-selector').textContent = s.lastSelectorUsed || 'n/a';
  document.getElementById('diag-counts').textContent = `${Number(s.lastCandidateAnchors || 0)} / ${Number(s.lastParsedRows || 0)}`;
  document.getElementById('diag-range').textContent = `${Number(s.currentMakeRangeStart || 0)} - ${Number(s.currentMakeRangeEnd || 0)} / ${Number(s.currentMakeTotalListings || 0)}`;
  document.getElementById('diag-url').textContent = s.lastUrl || 'n/a';
  document.getElementById('mode').value = s.mode || 'card_only';

  const statusEl = document.getElementById('run-status');
  const runStatus = s.runStatus || (s.running ? 'running' : 'idle');
  if (runStatus === 'paused') {
    const reason = s.pausedReason ? ` (${String(s.pausedReason).replaceAll('_', ' ')})` : '';
    statusEl.textContent = `Status: paused${reason}`;
  } else {
    statusEl.textContent = `Status: ${runStatus}`;
  }
  const isRunning = !!s.running && runStatus === 'running';
  startBtn.disabled = isRunning;
  stopBtn.disabled = !isRunning;

  const dot = document.getElementById('bridge-dot');
  const label = document.getElementById('bridge-label');
  const alive = !!(bridgeResp && bridgeResp.alive);
  dot.className = `dot ${alive ? 'alive' : 'dead'}`;
  label.textContent = alive ? 'Bridge :8766 online' : 'Bridge offline';
}

document.getElementById('start').addEventListener('click', async () => {
  const startBtn = document.getElementById('start');
  startBtn.disabled = true;
  const makes = document.getElementById('makes').value.split('\n').map((s) => s.trim()).filter(Boolean);
  const mode = document.getElementById('mode').value || 'card_only';
  const startFresh = document.getElementById('start-fresh').checked;
  const resp = await chrome.runtime.sendMessage({ action: 'START_HARVEST', makes, mode, startFresh });
  if (!resp || !resp.ok) startBtn.disabled = false;
  refresh();
});

document.getElementById('mode').addEventListener('change', async (event) => {
  const mode = event.target.value === 'detailed' ? 'detailed' : 'card_only';
  const resp = await chrome.runtime.sendMessage({ action: 'SET_MODE', mode });
  if (!resp || !resp.ok) {
    refresh();
  }
});

document.getElementById('stop').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ action: 'STOP_HARVEST' });
  refresh();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'STATUS_UPDATE' || msg.type === 'HARVEST_COMPLETE') refresh();
});

refresh();
setInterval(refresh, 1000);
