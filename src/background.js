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
  },
  triggered: {
    session: false,
    weekly:  false,
    spend:   false,
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

const stateReady = chrome.storage.local.get('state').then((data) => {
  if (data.state) state = data.state;
  setupRefreshAlarm(); // start refresh cycle based on saved settings
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
          setupRefreshAlarm(); // reconfigure if interval changed
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
  const prev    = state.snapshot;
  const resetAt = parseResetTime(snap.resetText);
  state.snapshot = { ...snap, resetAt, lastUpdated: Date.now() };

  // Await each check so fireAlert errors propagate rather than becoming
  // silent unhandled rejections.
  await checkPercent('session', snap.sessionPct, state.thresholds.session);
  await checkPercent('weekly',  snap.weeklyPct,  state.thresholds.weekly);
  await checkSpend(snap.spend, state.thresholds.spend);

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
    await refreshUsageTab();
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

const LABELS = { session: 'Session', weekly: 'Weekly', spend: 'Spend', reset: 'Session reset' };

async function fireAlert(type, valueStr, thresholdStr) {
  if (state.prefs.soundEnabled) {
    await playBing();
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

/**
 * Create (or recreate) the repeating refresh alarm.
 * Called on startup and whenever the refresh interval setting changes.
 */
function setupRefreshAlarm() {
  chrome.alarms.clear(REFRESH_ALARM, () => {
    const secs = state.prefs.refreshInterval ?? 30;
    if (secs <= 0) return; // 0 = disabled
    // Chrome clamps periodInMinutes to 1 min for store extensions;
    // for developer-mode (unpacked) installs any interval works.
    chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: secs / 60 });
  });
}

/**
 * Reload the claude.ai/settings/usage tab so the page re-fetches fresh
 * data from Anthropic's servers. Skips the tab if the user is actively
 * viewing it (active tab in the focused window) to avoid disruption.
 */
async function refreshUsageTab() {
  // Find the tab the user is currently looking at.
  const [focusedTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

  const usageTabs = await chrome.tabs.query({ url: USAGE_URL });

  if (usageTabs.length === 0) {
    // No usage tab open — nothing to reload. Content script will scrape
    // whenever the user next visits the page naturally.
    return;
  }

  for (const tab of usageTabs) {
    if (tab.id === focusedTab?.id) continue; // don't interrupt active reading
    chrome.tabs.reload(tab.id);
  }
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
