let hydratedSourceControls = false;

/** Always auto-discover makes per site from the selected category (no manual make list in UI). */
const EMPTY_SOURCE_MAKES = { controller: [], globalair: [], tap: [], aerotrader: [] };

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

function updateSourceResumeButtons(s) {
  const keys = ['controller', 'globalair', 'tap', 'aerotrader'];
  for (const key of keys) {
    const btn = document.querySelector(`#sources-diag .btn-resume-src[data-source="${key}"]`);
    if (!btn) continue;
    const ss = s.sourceStates?.[key];
    const sd = s.sourceDiagnostics?.[key];
    const blocked =
      !!(ss && ss.blocked) ||
      String(sd?.status || '') === 'blocked' ||
      !!(sd && sd.blockedReason);
    btn.hidden = !blocked;
  }
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
  const unifiedCategoryKeysFromBg = Array.isArray(stateResp?.unifiedCategoryKeys)
    ? stateResp.unifiedCategoryKeys
    : [];
  const startBtn = document.getElementById('start');
  const stopBtn = document.getElementById('stop');
  document.getElementById('extracted').textContent = s.sessionExtracted ?? s.totalExtracted ?? 0;
  document.getElementById('upserted').textContent = s.sessionUpserted ?? s.totalUpserted ?? 0;
  document.getElementById('failed').textContent = (s.failedUrls || []).length;
  const rawSession = Number(s.sessionExtracted ?? s.totalExtracted ?? 0);
  const uniqSession = Number(s.sessionExtractedUnique ?? 0);
  const uniqEl = document.getElementById('stats-unique');
  if (uniqEl) {
    const dup = Math.max(0, rawSession - uniqSession);
    uniqEl.textContent =
      dup > 0
        ? `Unique listings (session): ${uniqSession} (${dup} duplicate passes — e.g. another manufacturer crawl)`
        : `Unique listings (session): ${uniqSession}`;
  }
  const spEl = document.getElementById('stats-progress');
  if (spEl) {
    const src = String(s.currentSource || '');
    const ss = (src && s.sourceStates && s.sourceStates[src]) ? s.sourceStates[src] : null;
    const makeLabel = ss && ss.currentMake != null ? String(ss.currentMake) : '';
    const total = Number(s.currentMakeTotalListings || 0);
    const end = Number(s.currentMakeRangeEnd || 0);
    const start = Number(s.currentMakeRangeStart || 0);
    if (makeLabel && total > 0) {
      spEl.textContent = `Active site slice: ${makeLabel} · rows ${start}–${end} of ${total} (this make & filter)`;
    } else if (total > 0) {
      spEl.textContent = `Active site slice: rows ${start}–${end} of ${total} (current page vs site total)`;
    } else {
      spEl.textContent = 'Active site slice: — (shown when the SERP reports totals)';
    }
  }
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
  updateSourceResumeButtons(s);
  document.getElementById('mode').value = s.mode || 'card_only';
  const selectedSources = Array.isArray(s.sources) && s.sources.length ? s.sources : ['controller', 'globalair', 'tap', 'aerotrader'];

  const statusEl = document.getElementById('run-status');
  const runStatus = s.runStatus || (s.running ? 'running' : 'idle');
  if (runStatus === 'paused') {
    const reason = s.pausedReason ? ` (${String(s.pausedReason).replaceAll('_', ' ')})` : '';
    statusEl.textContent = `Status: paused${reason}`;
  } else {
    statusEl.textContent = `Status: ${runStatus}`;
  }

  const banner = document.getElementById('challenge-banner');
  const resumeBtn = document.getElementById('resume-btn');
  const showBanner = !!s.challengeDetected && s.runStatus === 'paused';

  if (banner) {
    banner.style.display = showBanner ? 'flex' : 'none';
  }
  if (resumeBtn) {
    // Re-enable button if we're back in paused+challenge state
    // (handles case where resume failed and challenge recurred)
    if (showBanner) {
      resumeBtn.disabled = false;
      resumeBtn.textContent = 'Resume Scraping';
    }
  }

  // Also update the run-status text to be more helpful when challenged
  if (showBanner) {
    statusEl.textContent = 'Status: waiting for CAPTCHA solve';
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
    if (unifiedCategoryKeysFromBg.length) {
      setCheckedValues('.unified-category', unifiedCategoryKeysFromBg, 'single-piston');
    } else {
      setCheckedValues('.unified-category', ['single-piston'], 'single-piston');
    }
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
  const mode = document.getElementById('mode').value || 'card_only';
  let unifiedCategoryKeys = readCheckedValues('.unified-category');
  if (!unifiedCategoryKeys.length) unifiedCategoryKeys = ['single-piston'];
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
    makes: [],
    sourceMakes: { ...EMPTY_SOURCE_MAKES },
    unifiedCategoryKeys,
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

document.querySelectorAll('.unified-category').forEach((el) => {
  el.addEventListener('change', async () => {
    let keys = readCheckedValues('.unified-category');
    if (!keys.length) keys = ['single-piston'];
    const resp = await chrome.runtime.sendMessage({ action: 'SET_UNIFIED_CATEGORIES', keys });
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

document.getElementById('sources-diag')?.addEventListener('click', async (ev) => {
  const t = ev.target;
  if (!t || !t.classList || !t.classList.contains('btn-resume-src')) return;
  const sourceKey = t.getAttribute('data-source');
  if (!sourceKey) return;
  t.disabled = true;
  try {
    await chrome.runtime.sendMessage({ action: 'RESUME_BLOCKED_SOURCE', sourceKey });
  } catch (e) {
    console.warn('[FullHangar] Resume source failed:', e);
  }
  setTimeout(refresh, 200);
});

document.getElementById('resume-btn').addEventListener('click', async () => {
  const btn = document.getElementById('resume-btn');
  btn.disabled = true;
  btn.textContent = 'Resuming...';
  try {
    await chrome.runtime.sendMessage({ action: 'RESUME_HARVEST' });
  } catch (e) {
    console.warn('[FullHangar] Resume failed:', e);
  }
  // Refresh will update the banner visibility on next tick
  setTimeout(refresh, 500);
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'STATUS_UPDATE' || msg.type === 'HARVEST_COMPLETE') refresh();
});

refresh();
setInterval(refresh, 1000);
