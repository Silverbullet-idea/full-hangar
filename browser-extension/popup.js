async function refresh() {
  const stateResp = await chrome.runtime.sendMessage({ action: 'GET_STATE' });
  const bridgeResp = await chrome.runtime.sendMessage({ action: 'GET_BRIDGE_STATUS' });
  const s = (stateResp && stateResp.state) || {};
  document.getElementById('extracted').textContent = s.totalExtracted || 0;
  document.getElementById('upserted').textContent = s.totalUpserted || 0;
  document.getElementById('failed').textContent = (s.failedUrls || []).length;
  const dot = document.getElementById('bridge-dot');
  const label = document.getElementById('bridge-label');
  const alive = !!(bridgeResp && bridgeResp.alive);
  dot.className = `dot ${alive ? 'alive' : 'dead'}`;
  label.textContent = alive ? 'Bridge :8765 online' : 'Bridge offline';
}

document.getElementById('start').addEventListener('click', async () => {
  const makes = document.getElementById('makes').value.split('\n').map((s) => s.trim()).filter(Boolean);
  await chrome.runtime.sendMessage({ action: 'START_HARVEST', makes });
  refresh();
});

document.getElementById('stop').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ action: 'STOP_HARVEST' });
  refresh();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'STATUS_UPDATE' || msg.type === 'HARVEST_COMPLETE') refresh();
});

refresh();
setInterval(refresh, 4000);
