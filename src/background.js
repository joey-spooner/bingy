/**
 * background.js — Bingy service worker (CLAUDE.md §3, §7)
 *
 * Owns all state (persisted to chrome.storage.local because service workers
 * are ephemeral). Evaluates thresholds on every usage snapshot and fires
 * alerts when a crossing is detected.
 */

import { shouldAlert, shouldReset, parseResetTime } from './utils/parser.js';

// ---------------------------------------------------------------------------
// Default state
// ---------------------------------------------------------------------------

const DEFAULT_STATE = {
  enabled: true,  // master on/off switch
  snapshot: {
    sessionPct:  null,
    weeklyPct:   null,
    spend:       null,
    resetText:   null,
    resetAt:     null,  // absolute timestamp (ms) when session resets
    lastUpdated: null,
  },
  thresholds: {
    session: 80,  // percent
    weekly:  80,  // percent
    spend:   10,  // euros
    extra:   80,  // percent
  },
  triggered: {
    session: false,
    weekly:  false,
    spend:   false,
    extra:   false,
  },
  prefs: {
    soundEnabled:         true,
    notificationsEnabled: true,
    refreshInterval:      30,   // seconds; 0 = disabled
  },
};

// ---------------------------------------------------------------------------
// State initialisation
// ---------------------------------------------------------------------------

// Load state once when the service worker starts; all message handlers
// await this promise so they never operate on stale defaults.
let state = structuredClone(DEFAULT_STATE);

const stateReady = chrome.storage.local.get('state').then(async (data) => {
  if (data.state) {
    // Deep-merge so new default keys (e.g. thresholds.extra) survive upgrades.
    state = {
      ...DEFAULT_STATE,
      ...data.state,
      thresholds: { ...DEFAULT_STATE.thresholds, ...data.state.thresholds },
      triggered:  { ...DEFAULT_STATE.triggered,  ...data.state.triggered  },
      prefs:      { ...DEFAULT_STATE.prefs,       ...data.state.prefs      },
      snapshot:   { ...DEFAULT_STATE.snapshot,    ...data.state.snapshot   },
    };
  }
  await setupRefreshAlarm(); // start refresh cycle based on saved settings
  await updateActionIcon();  // restore correct icon after service worker restart
});

async function saveState() {
  await chrome.storage.local.set({ state });
}

// ---------------------------------------------------------------------------
// First-install defaults
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get('state');
  if (!existing.state) {
    await chrome.storage.local.set({ state: DEFAULT_STATE });
  }
});

// ---------------------------------------------------------------------------
// Message router
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  stateReady
    .then(async () => {
      switch (msg.type) {

        case 'SNAPSHOT':
          await handleSnapshot(msg.payload);
          break;

        case 'GET_STATE':
          sendResponse(state);
          break;

        case 'UPDATE_SETTINGS':
          state.thresholds = { ...state.thresholds, ...msg.thresholds };
          state.prefs      = { ...state.prefs,      ...msg.prefs      };
          await saveState();
          await setupRefreshAlarm(); // reconfigure if interval changed
          break;

        case 'TOGGLE_ENABLED':
          state.enabled = !(state.enabled ?? true);
          await saveState();
          await updateActionIcon();
          await setupRefreshAlarm();
          sendResponse({ enabled: state.enabled });
          break;

        case 'TEST_BING':
          await playBing();
          break;

        case 'OFFSCREEN_DONE':
          await closeOffscreen();
          break;
      }
    })
    .catch(console.error); // surface any unhandled errors to the SW console

  return true; // keep message channel open for async sendResponse
});

// ---------------------------------------------------------------------------
// Threshold engine (CLAUDE.md §7)
// ---------------------------------------------------------------------------

async function handleSnapshot(snap) {
  if (!(state.enabled ?? true)) return; // ignore snapshots when paused

  const prev    = state.snapshot;
  const resetAt = parseResetTime(snap.resetText);
  state.snapshot = { ...snap, resetAt, lastUpdated: Date.now() };

  // Await each check so fireAlert errors propagate rather than becoming
  // silent unhandled rejections.
  await checkPercent('session', snap.sessionPct, state.thresholds.session);
  await checkPercent('weekly',  snap.weeklyPct,  state.thresholds.weekly);
  await checkSpend(snap.spend, state.thresholds.spend);
  await checkPercent('extra',   snap.extraPct,   state.thresholds.extra);

  await scheduleResetAlarm(resetAt);
  await saveState();
}

async function checkPercent(type, current, threshold) {
  if (shouldReset(current, threshold) && state.triggered[type]) {
    state.triggered[type] = false;
    return;
  }
  if (shouldAlert(current, threshold, state.triggered[type])) {
    state.triggered[type] = true;
    await fireAlert(type, `${current}%`, `${threshold}%`);
  }
}

async function checkSpend(current, threshold) {
  if (shouldReset(current, threshold) && state.triggered.spend) {
    state.triggered.spend = false;
    return;
  }
  if (shouldAlert(current, threshold, state.triggered.spend)) {
    state.triggered.spend = true;
    await fireAlert('spend', `€${current}`, `€${threshold}`);
  }
}

// ---------------------------------------------------------------------------
// Reset alarm (CLAUDE.md §8 — timer feature)
// ---------------------------------------------------------------------------

const ALARM_NAME = 'bingy-reset';

async function scheduleResetAlarm(resetAt) {
  if (!resetAt || resetAt <= Date.now()) return;
  await chrome.alarms.clear(ALARM_NAME);
  chrome.alarms.create(ALARM_NAME, { when: resetAt });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === REFRESH_ALARM) {
    await stateReady;
    if (state.enabled ?? true) await refreshUsageTab(); // skip when paused
    return;
  }

  if (alarm.name !== ALARM_NAME) return;
  await stateReady;

  state.triggered.session = false;
  state.snapshot.resetAt  = null;
  await saveState();

  await fireAlert('reset', '', '');
});

// ---------------------------------------------------------------------------
// Alert delivery
// ---------------------------------------------------------------------------

const LABELS = { session: 'Session', weekly: 'Weekly', spend: 'Spend', extra: 'Extra', reset: 'Session reset' };

async function fireAlert(type, valueStr, thresholdStr) {
  if (state.prefs.soundEnabled) {
    if (type === 'extra') await playExtra();
    else await playBing();
  }
  if (state.prefs.notificationsEnabled) {
    const isReset = type === 'reset';
    chrome.notifications.create(`bingy-${type}-${Date.now()}`, {
      type:    'basic',
      iconUrl: 'icons/icon48.png',
      title:   isReset ? 'Bingy — Session Reset' : 'Bingy Alert',
      message: isReset
        ? 'Your Claude session limit has reset.'
        : `${LABELS[type]} is at ${valueStr} (threshold: ${thresholdStr})`,
    });
  }
}

// ---------------------------------------------------------------------------
// Tab refresh system
// ---------------------------------------------------------------------------

const REFRESH_ALARM = 'bingy-refresh';
const USAGE_URL     = 'https://claude.ai/settings/usage*';
const USAGE_URL_FULL = 'https://claude.ai/settings/usage';

// In-memory reference to the background tab Bingy opened.
// Lost on service-worker restart, but the URL query below recovers gracefully.
let bgTabId = null;

/**
 * Create (or recreate) the repeating refresh alarm.
 * Called on startup and whenever the refresh interval setting changes.
 */
async function setupRefreshAlarm() {
  await chrome.alarms.clear(REFRESH_ALARM);
  if (!(state.enabled ?? true)) return; // don't poll when paused
  const secs = state.prefs.refreshInterval ?? 30;
  if (secs <= 0) return; // 0 = disabled
  // Chrome clamps periodInMinutes to 1 min for store extensions;
  // for developer-mode (unpacked) installs any interval works.
  chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: secs / 60 });
}

/**
 * Reload the claude.ai/settings/usage tab so the page re-fetches fresh
 * data from Anthropic's servers. If no usage tab is open, opens one in
 * the background so the content script can scrape fresh data.
 *
 * Tracks the opened tab ID so subsequent calls reload the same tab rather
 * than opening new ones (avoids spawning a new browser window each cycle).
 */
async function refreshUsageTab() {
  const usageTabs = await chrome.tabs.query({ url: USAGE_URL });

  if (usageTabs.length > 0) {
    // Reload all matching tabs — user opted in to auto-refresh, so this is expected.
    for (const tab of usageTabs) {
      chrome.tabs.reload(tab.id);
    }
    // Keep bgTabId in sync with whatever tab we found.
    bgTabId = usageTabs[0].id;
    return;
  }

  // No usage tab found by URL. If we still have our background tab, navigate
  // it back to the usage page instead of opening a new one.
  if (bgTabId !== null) {
    try {
      await chrome.tabs.get(bgTabId); // throws if the tab no longer exists
      chrome.tabs.update(bgTabId, { url: USAGE_URL_FULL });
      return;
    } catch {
      bgTabId = null; // tab was closed; fall through to create a new one
    }
  }

  // No existing tab to reuse — create one. Anchor it to an existing normal
  // window so Chrome doesn't open a brand-new browser window.
  const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
  const windowId = windows.length > 0 ? windows[0].id : undefined;
  const tab = await chrome.tabs.create({
    url: USAGE_URL_FULL,
    active: false,
    ...(windowId !== undefined && { windowId }),
  });
  bgTabId = tab.id;
}

// ---------------------------------------------------------------------------
// Icon state (reflects enabled/disabled)
// ---------------------------------------------------------------------------

/**
 * Update the toolbar icon to reflect the current enabled state.
 * When paused, the icon is rendered in greyscale using OffscreenCanvas.
 */
async function updateActionIcon() {
  const enabled = state.enabled ?? true;
  const sizes   = [16, 48, 128];
  const imageData = {};

  for (const size of sizes) {
    const canvas = new OffscreenCanvas(size, size);
    const ctx    = canvas.getContext('2d');

    const response = await fetch(chrome.runtime.getURL(`icons/icon${size}.png`));
    const blob     = await response.blob();
    const bitmap   = await createImageBitmap(blob);
    ctx.drawImage(bitmap, 0, 0, size, size);

    if (!enabled) {
      const imgData = ctx.getImageData(0, 0, size, size);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const gray = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
        d[i] = d[i + 1] = d[i + 2] = gray;
      }
      ctx.putImageData(imgData, 0, 0);
    }

    imageData[size] = ctx.getImageData(0, 0, size, size);
  }

  await chrome.action.setIcon({ imageData });
}

// ---------------------------------------------------------------------------
// Sound system — Offscreen API (CLAUDE.md §8)
// ---------------------------------------------------------------------------

// Guard: only one offscreen document allowed at a time.
let bingInProgress  = false;
let bingGuardTimer  = null;

async function playBing() {
  if (bingInProgress) return;
  bingInProgress = true;

  // Failsafe: release the guard after 3 s regardless, in case OFFSCREEN_DONE
  // is never received (e.g. offscreen document crashed or was closed).
  bingGuardTimer = setTimeout(() => { bingInProgress = false; }, 3_000);

  try {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
    });

    if (!contexts.length) {
      await chrome.offscreen.createDocument({
        url:           'offscreen.html',
        reasons:       ['AUDIO_PLAYBACK'],
        justification: 'Play bing alert sound using Web Audio API',
      });
    }

    // Suppress lastError: if the offscreen doc isn't ready yet the 3 s
    // failsafe above will recover.
    chrome.runtime.sendMessage({ type: 'PLAY_BING' }, () => {
      void chrome.runtime.lastError;
    });
  } catch (err) {
    // If anything throws (e.g. offscreen creation failed), release the guard
    // immediately so the next alert can try again.
    clearTimeout(bingGuardTimer);
    bingInProgress = false;
    console.error('[Bingy] playBing failed:', err);
  }
}

async function playExtra() {
  if (bingInProgress) return;
  bingInProgress = true;

  // MP3 is longer than the bing tone — give it up to 15 s before releasing.
  bingGuardTimer = setTimeout(() => { bingInProgress = false; }, 15_000);

  try {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
    });

    if (!contexts.length) {
      await chrome.offscreen.createDocument({
        url:           'offscreen.html',
        reasons:       ['AUDIO_PLAYBACK'],
        justification: 'Play extra usage alert sound',
      });
    }

    chrome.runtime.sendMessage({ type: 'PLAY_EXTRA' }, () => {
      void chrome.runtime.lastError;
    });
  } catch (err) {
    clearTimeout(bingGuardTimer);
    bingInProgress = false;
    console.error('[Bingy] playExtra failed:', err);
  }
}

async function closeOffscreen() {
  clearTimeout(bingGuardTimer);
  bingInProgress = false;
  try {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
    });
    if (contexts.length) {
      await chrome.offscreen.closeDocument();
    }
  } catch (err) {
    console.error('[Bingy] closeOffscreen failed:', err);
  }
}
