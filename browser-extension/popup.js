let hydratedMakeEditors = false;
let hydratedSourceControls = false;

function readCheckedValues(selector) {
  return Array.from(document.querySelectorAll(selector))
    .filter((el) => el.checked)
    .map((el) => String(el.value || '').trim())
    .filter(Boolean);
}

function setCheckedValues(selector, values, fallback) {
  const selected = new Set((Array.isArray(values) ? values : []).map((v) => String(v || '').trim()).filter(Boolean));
  const boxes = Array.from(document.querySelectorAll(selector));
  for (const box of boxes) {
    box.checked = selected.has(String(box.value || '').trim());
  }
  if (!boxes.some((box) => box.checked) && fallback) {
    const target = boxes.find((box) => box.value === fallback);
    if (target) target.checked = true;
  }
}

function normalizeTapCategoryForSelect(value) {
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
    amphibian: 'amphibious-float',
    amphibious: 'amphibious-float',
    float: 'amphibious-float',
    'light-sport-aircraft': 'light-sport',
  };
  const normalized = aliases[raw] || raw;
  const allowed = new Set([
    'single-engine-piston',
    'multi-engine-piston',
    'turboprop',
    'jets',
    'helicopters',
    'light-sport',
    'warbird',
    'amphibious-float',
    'experimental-homebuilt',
    'gyroplane',
  ]);
  return allowed.has(normalized) ? normalized : 'single-engine-piston';
}

function normalizeTapCategoriesForSelect(values) {
  const list = Array.isArray(values) ? values : [values];
  const normalized = list.map((v) => normalizeTapCategoryForSelect(v)).filter(Boolean);
  return Array.from(new Set(normalized));
}

function parseMakeLines(id) {
  return document
    .getElementById(id)
    .value.split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function renderSourceDiag(labelId, sourceDiag, sourceState) {
  const status = String(sourceDiag?.status || 'idle');
  const extracted = Number(sourceDiag?.extracted || 0);
  const saved = Number(sourceDiag?.saved || 0);
  const reason = sourceDiag?.blockedReason || sourceDiag?.lastReason || 'none';
  const noProgress = Number(sourceState?.noProgressCycles || 0);
  const cooldownLevel = Number(sourceState?.cooldownLevel || 0);
  let eta = '';
  const blockedUntilMs = Number(sourceState?.blockedUntilMs || 0);
  if (status === 'blocked' && blockedUntilMs > 0) {
    const remainingMs = blockedUntilMs - Date.now();
    if (remainingMs > 0) {
      const remainingMin = Math.max(1, Math.ceil(remainingMs / 60000));
      eta = ` | retry in ${remainingMin}m`;
    } else {
      eta = ' | retrying now';
    }
  }
  const text = `${status} | ${extracted}/${saved} | ${String(reason).replaceAll('_', ' ')} | np:${noProgress} cd:${cooldownLevel}${eta}`;
  document.getElementById(labelId).textContent = text;
}

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
  renderSourceDiag('srcdiag-controller', s.sourceDiagnostics?.controller, s.sourceStates?.controller);
  renderSourceDiag('srcdiag-globalair', s.sourceDiagnostics?.globalair, s.sourceStates?.globalair);
  renderSourceDiag('srcdiag-tap', s.sourceDiagnostics?.tap, s.sourceStates?.tap);
  renderSourceDiag('srcdiag-aerotrader', s.sourceDiagnostics?.aerotrader, s.sourceStates?.aerotrader);
  document.getElementById('mode').value = s.mode || 'card_only';
  const selectedSources = Array.isArray(s.sources) && s.sources.length ? s.sources : ['controller', 'globalair', 'tap', 'aerotrader'];
  if (!hydratedMakeEditors) {
    const ss = s.sourceStates || {};
    const ctlMakes = Array.isArray(ss.controller && ss.controller.makes) ? ss.controller.makes : [];
    const gaMakes = Array.isArray(ss.globalair && ss.globalair.makes) ? ss.globalair.makes : [];
    const atMakes = Array.isArray(ss.aerotrader && ss.aerotrader.makes) ? ss.aerotrader.makes : [];
    document.getElementById('makes-controller').value = ctlMakes.join('\n');
    document.getElementById('makes-globalair').value = gaMakes.join('\n');
    // Keep TAP input blank by default so auto-discovered run state
    // does not repopulate manual filter input on popup open.
    document.getElementById('makes-tap').value = '';
    document.getElementById('makes-aerotrader').value = atMakes.join('\n');
    hydratedMakeEditors = true;
  }

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

  // Keep source toggles user-editable while idle. If we re-apply on every refresh,
  // checkboxes appear "stuck" because state gets written over local UI edits.
  if (!hydratedSourceControls || isRunning) {
    document.getElementById('src-controller').checked = selectedSources.includes('controller');
    document.getElementById('src-globalair').checked = selectedSources.includes('globalair');
    document.getElementById('src-tap').checked = selectedSources.includes('tap');
    document.getElementById('src-aerotrader').checked = selectedSources.includes('aerotrader');
    document.getElementById('aerotrader-zip').value = String(s.aerotraderSearchZip || '83854');
    document.getElementById('aerotrader-radius').value = String(s.aerotraderSearchRadius || '10000');
    document.getElementById('aerotrader-use-current-tab').checked = !!s.aerotraderStartFromCurrentTab;
    document.getElementById('detail-new-only').checked = !!s.detailNewOnly;
    document.getElementById('rotate-sources').checked = s.rotateSources !== false;
    const controllerCategories = Array.isArray(s.controllerCategories)
      ? s.controllerCategories
      : (s.controllerCategory ? [s.controllerCategory] : []);
    const globalAirCategories = Array.isArray(s.globalAirCategories)
      ? s.globalAirCategories
      : (s.globalAirCategory ? [s.globalAirCategory] : []);
    const tapCategories = Array.isArray(s.tapCategories)
      ? s.tapCategories
      : normalizeTapCategoriesForSelect(s.tapCategory);
    setCheckedValues('.controller-category', controllerCategories, 'piston-single-aircraft');
    setCheckedValues('.globalair-category', globalAirCategories, 'single-engine-piston');
    setCheckedValues('.tap-category', tapCategories, 'single-engine-piston');
    hydratedSourceControls = true;
  }

  const dot = document.getElementById('bridge-dot');
  const label = document.getElementById('bridge-label');
  const alive = !!(bridgeResp && bridgeResp.alive);
  dot.className = `dot ${alive ? 'alive' : 'dead'}`;
  label.textContent = alive ? 'Unified bridge :8765 online' : 'Unified bridge offline';
}

document.getElementById('start').addEventListener('click', async () => {
  const startBtn = document.getElementById('start');
  startBtn.disabled = true;
  const sourceMakes = {
    controller: parseMakeLines('makes-controller'),
    globalair: parseMakeLines('makes-globalair'),
    tap: parseMakeLines('makes-tap'),
    aerotrader: parseMakeLines('makes-aerotrader'),
  };
  const sharedMakes = [
    ...new Set([
      ...sourceMakes.controller,
      ...sourceMakes.globalair,
      ...sourceMakes.tap,
      ...sourceMakes.aerotrader,
    ]),
  ];
  const mode = document.getElementById('mode').value || 'card_only';
  const controllerCategories = readCheckedValues('.controller-category');
  const globalAirCategories = readCheckedValues('.globalair-category');
  const tapCategories = readCheckedValues('.tap-category');
  const startFresh = document.getElementById('start-fresh').checked;
  const detailNewOnly = !!document.getElementById('detail-new-only').checked;
  const sources = [
    document.getElementById('src-controller').checked ? 'controller' : null,
    document.getElementById('src-globalair').checked ? 'globalair' : null,
    document.getElementById('src-tap').checked ? 'tap' : null,
    document.getElementById('src-aerotrader').checked ? 'aerotrader' : null,
  ].filter(Boolean);
  const rotateSources = document.getElementById('rotate-sources').checked;
  const aerotraderSearchZip = String(document.getElementById('aerotrader-zip').value || '').trim();
  const aerotraderSearchRadius = String(document.getElementById('aerotrader-radius').value || '').trim();
  const aerotraderStartFromCurrentTab = !!document.getElementById('aerotrader-use-current-tab').checked;
  const resp = await chrome.runtime.sendMessage({
    action: 'START_HARVEST',
    makes: sharedMakes,
    sourceMakes,
    controllerCategories,
    globalAirCategories,
    tapCategories,
    aerotraderSearchZip,
    aerotraderSearchRadius,
    aerotraderStartFromCurrentTab,
    mode,
    detailNewOnly,
    startFresh,
    sources,
    rotateSources,
  });
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

document.querySelectorAll('.globalair-category').forEach((el) => {
  el.addEventListener('change', async () => {
    const categories = readCheckedValues('.globalair-category');
    const resp = await chrome.runtime.sendMessage({ action: 'SET_GLOBALAIR_CATEGORIES', categories });
    if (!resp || !resp.ok) refresh();
  });
});

document.querySelectorAll('.controller-category').forEach((el) => {
  el.addEventListener('change', async () => {
    const categories = readCheckedValues('.controller-category');
    const resp = await chrome.runtime.sendMessage({ action: 'SET_CONTROLLER_CATEGORIES', categories });
    if (!resp || !resp.ok) refresh();
  });
});

document.querySelectorAll('.tap-category').forEach((el) => {
  el.addEventListener('change', async () => {
    const categories = readCheckedValues('.tap-category');
    const resp = await chrome.runtime.sendMessage({ action: 'SET_TAP_CATEGORIES', categories });
    if (!resp || !resp.ok) refresh();
  });
});

['aerotrader-zip', 'aerotrader-radius'].forEach((id) => {
  const el = document.getElementById(id);
  el.addEventListener('change', async () => {
    const zip = String(document.getElementById('aerotrader-zip').value || '').trim();
    const radius = String(document.getElementById('aerotrader-radius').value || '').trim();
    const resp = await chrome.runtime.sendMessage({ action: 'SET_AEROTRADER_SEARCH', zip, radius });
    if (!resp || !resp.ok) refresh();
  });
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
