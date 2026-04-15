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
  stateReady.then(async () => {
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
        break;

      case 'TEST_BING':
        await playBing();
        break;

      case 'OFFSCREEN_DONE':
        await closeOffscreen();
        break;
    }
  });

  return true; // keep message channel open for async sendResponse
});

// ---------------------------------------------------------------------------
// Threshold engine (CLAUDE.md §7)
// ---------------------------------------------------------------------------

async function handleSnapshot(snap) {
  const prev = state.snapshot;
  const resetAt = parseResetTime(snap.resetText);
  state.snapshot = { ...snap, resetAt, lastUpdated: Date.now() };

  checkPercent('session', prev.sessionPct, snap.sessionPct, state.thresholds.session);
  checkPercent('weekly',  prev.weeklyPct,  snap.weeklyPct,  state.thresholds.weekly);
  checkSpend(prev.spend, snap.spend, state.thresholds.spend);

  await scheduleResetAlarm(resetAt);
  await saveState();
}

// ---------------------------------------------------------------------------
// Reset alarm (CLAUDE.md §8 — timer feature)
// ---------------------------------------------------------------------------

const ALARM_NAME = 'bingy-reset';

async function scheduleResetAlarm(resetAt) {
  if (!resetAt || resetAt <= Date.now()) return;

  // Replace any existing alarm with the freshly-parsed time.
  await chrome.alarms.clear(ALARM_NAME);
  chrome.alarms.create(ALARM_NAME, { when: resetAt });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  await stateReady;

  // Session has reset — clear the triggered flag so the next crossing alerts.
  state.triggered.session = false;
  state.snapshot.resetAt  = null;
  await saveState();

  if (state.prefs.soundEnabled) await playBing();
  if (state.prefs.notificationsEnabled) {
    chrome.notifications.create(`bingy-reset-${Date.now()}`, {
      type:    'basic',
      iconUrl: 'icons/icon48.png',
      title:   'Bingy — Session Reset',
      message: 'Your Claude session limit has reset.',
    });
  }
});

function checkPercent(type, prev, current, threshold) {
  if (shouldReset(current, threshold) && state.triggered[type]) {
    state.triggered[type] = false;
    return;
  }
  if (shouldAlert(current, threshold, state.triggered[type])) {
    state.triggered[type] = true;
    fireAlert(type, `${current}%`, `${threshold}%`);
  }
}

function checkSpend(prev, current, threshold) {
  if (shouldReset(current, threshold) && state.triggered.spend) {
    state.triggered.spend = false;
    return;
  }
  if (shouldAlert(current, threshold, state.triggered.spend)) {
    state.triggered.spend = true;
    fireAlert('spend', `€${current}`, `€${threshold}`);
  }
}

// ---------------------------------------------------------------------------
// Alert delivery
// ---------------------------------------------------------------------------

const LABELS = { session: 'Session', weekly: 'Weekly', spend: 'Spend' };

async function fireAlert(type, valueStr, thresholdStr) {
  if (state.prefs.soundEnabled) {
    await playBing();
  }
  if (state.prefs.notificationsEnabled) {
    chrome.notifications.create(`bingy-${type}-${Date.now()}`, {
      type:    'basic',
      iconUrl: 'icons/icon48.png',
      title:   'Bingy Alert',
      message: `${LABELS[type]} is at ${valueStr} (threshold: ${thresholdStr})`,
    });
  }
}

// ---------------------------------------------------------------------------
// Sound system — Offscreen API (CLAUDE.md §8)
// ---------------------------------------------------------------------------

// Guard: only one offscreen document allowed at a time.
let bingInProgress = false;

async function playBing() {
  if (bingInProgress) return;
  bingInProgress = true;

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

  chrome.runtime.sendMessage({ type: 'PLAY_BING' });
}

async function closeOffscreen() {
  bingInProgress = false;
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
  });
  if (contexts.length) {
    await chrome.offscreen.closeDocument();
  }
}
