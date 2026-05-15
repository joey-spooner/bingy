/**
 * popup.js — Bingy popup UI (CLAUDE.md §9)
 *
 * Reads state from chrome.storage.local (written by background.js).
 * Writes threshold and pref changes back through background via messaging.
 * No direct communication with content.js needed.
 */

/* ── Helpers ──────────────────────────────────────────────────────── */

function el(id) { return document.getElementById(id); }

/**
 * Update a usage meter bar and label.
 *
 * @param {string}      type      - 'session' | 'weekly' | 'spend'
 * @param {number|null} value     - current value (percent or euros)
 * @param {number}      threshold - alert threshold
 * @param {string}      label     - display string (e.g. "87%" or "€12.50")
 */
function updateMeter(type, value, threshold, label) {
  const valEl  = el(`val-${type}`);
  const barEl  = el(`bar-${type}`);
  const mrkEl  = el(`thr-marker-${type}`);

  valEl.textContent = value !== null ? label : '—';

  if (value === null) {
    barEl.style.width = '0%';
    barEl.className   = 'bar-fill';
    mrkEl.style.display = 'none';
    return;
  }

  // For spend: express as % of threshold for the bar width.
  const pct = Math.min((value / threshold) * 100, 100);
  barEl.style.width = `${pct}%`;

  // Colour: green → amber at 60 %, red at 80 % (relative to threshold).
  barEl.className = 'bar-fill' +
    (pct >= 100 ? ' alert' : pct >= 75 ? ' warn' : '');

  // Show threshold marker at exactly the threshold position.
  mrkEl.style.display = 'block';
  mrkEl.style.left    = '100%'; // threshold is always at 100 % of the bar scale
}

/* ── Reset countdown ──────────────────────────────────────────────── */

/**
 * Format milliseconds remaining into a human-readable string.
 * e.g. 7380000 → "2h 3m", 90000 → "1m 30s", 45000 → "45s"
 */
function formatCountdown(ms) {
  if (ms <= 0) return 'Resetting…';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `Resets in ${h}h ${m}m`;
  if (m > 0) return `Resets in ${m}m ${s}s`;
  return `Resets in ${s}s`;
}

let countdownTimer = null;

function startCountdown(resetAt) {
  clearInterval(countdownTimer);
  const countdownEl = el('reset-countdown');

  if (!resetAt) {
    countdownEl.textContent = '';
    return;
  }

  function tick() {
    const remaining = resetAt - Date.now();
    countdownEl.textContent = remaining > 0 ? formatCountdown(remaining) : 'Resetting…';
    if (remaining <= 0) clearInterval(countdownTimer);
  }

  tick();
  countdownTimer = setInterval(tick, 1000);
}

/* ── Refresh countdown ────────────────────────────────────────────── */

let refreshCountdownTimer = null;

async function startRefreshCountdown() {
  clearInterval(refreshCountdownTimer);
  const countdownEl = el('refresh-countdown');

  // chrome.alarms is accessible directly from any extension page.
  const alarm = await chrome.alarms.get('bingy-refresh');

  if (!alarm) {
    countdownEl.textContent = 'Auto-refresh disabled';
    return;
  }

  function tick() {
    const remaining = Math.max(0, Math.round((alarm.scheduledTime - Date.now()) / 1000));
    countdownEl.textContent = remaining > 0 ? `Refreshes in ${remaining}s` : 'Refreshing…';
  }

  tick();
  refreshCountdownTimer = setInterval(tick, 1000);
  window.addEventListener('unload', () => clearInterval(refreshCountdownTimer), { once: true });
}

/* ── Load and render state ────────────────────────────────────────── */

function updateEnabledUI(enabled) {
  el('enabled-bar').classList.toggle('paused', !enabled);
  el('enabled-label').textContent = enabled ? 'Monitoring active' : 'Monitoring paused';
  el('pref-enabled').checked = enabled;
}

async function loadState() {
  const { state } = await chrome.storage.local.get('state');
  if (!state) return;

  const { snapshot, thresholds, prefs } = state;

  // Enabled toggle
  updateEnabledUI(state.enabled ?? true);

  // Meters
  updateMeter(
    'session',
    snapshot.sessionPct,
    thresholds.session,
    snapshot.sessionPct !== null ? `${snapshot.sessionPct}%` : null,
  );
  updateMeter(
    'weekly',
    snapshot.weeklyPct,
    thresholds.weekly,
    snapshot.weeklyPct !== null ? `${snapshot.weeklyPct}%` : null,
  );
  updateMeter(
    'spend',
    snapshot.spend,
    thresholds.spend,
    snapshot.spend !== null ? `€${snapshot.spend.toFixed(2)}` : null,
  );
  updateMeter(
    'extra',
    snapshot.extraPct,
    thresholds.extra ?? 80,
    snapshot.extraPct !== null ? `${snapshot.extraPct}%` : null,
  );

  // Reset text and live countdown
  el('reset-text').textContent = snapshot.resetText ?? '';
  startCountdown(snapshot.resetAt ?? null);

  // Last updated
  if (snapshot.lastUpdated) {
    const ago = Math.round((Date.now() - snapshot.lastUpdated) / 1000);
    el('last-updated').textContent =
      ago < 60 ? `${ago}s ago` : `${Math.round(ago / 60)}m ago`;
  }

  // Threshold inputs
  el('thr-session').value = thresholds.session;
  el('thr-weekly').value  = thresholds.weekly;
  el('thr-spend').value   = thresholds.spend;
  el('thr-extra').value   = thresholds.extra ?? 80;

  // Pref checkboxes
  el('pref-sound').checked         = prefs.soundEnabled;
  el('pref-notifications').checked = prefs.notificationsEnabled;

  // Refresh interval
  el('pref-refresh').value = prefs.refreshInterval ?? 30;
  startRefreshCountdown();
}

/* ── Save helpers ─────────────────────────────────────────────────── */

function saveSettings() {
  chrome.runtime.sendMessage({
    type: 'UPDATE_SETTINGS',
    thresholds: {
      session: Number(el('thr-session').value),
      weekly:  Number(el('thr-weekly').value),
      spend:   Number(el('thr-spend').value),
      extra:   Number(el('thr-extra').value),
    },
    prefs: {
      soundEnabled:         el('pref-sound').checked,
      notificationsEnabled: el('pref-notifications').checked,
      refreshInterval:      Math.max(0, Number(el('pref-refresh').value)),
    },
  });
}

/* ── Debounce for threshold inputs ───────────────────────────────── */

let saveTimer;
function debouncedSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveSettings, 400);
}

/* ── Wire up events ───────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  loadState();

  ['thr-session', 'thr-weekly', 'thr-spend', 'thr-extra'].forEach((id) => {
    el(id).addEventListener('input', debouncedSave);
  });

  ['pref-sound', 'pref-notifications'].forEach((id) => {
    el(id).addEventListener('change', saveSettings);
  });

  el('pref-enabled').addEventListener('change', () => {
    chrome.runtime.sendMessage({ type: 'TOGGLE_ENABLED' }, (resp) => {
      updateEnabledUI(resp?.enabled ?? el('pref-enabled').checked);
    });
  });

  el('pref-refresh').addEventListener('input', debouncedSave);

  el('btn-test-sound').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'TEST_BING' });
  });

  el('open-usage').addEventListener('click', (e) => {
    e.preventDefault();
    const USAGE_URL = 'https://claude.ai/settings/usage';
    chrome.tabs.query({ url: USAGE_URL }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.update(tabs[0].id, { active: true });
        chrome.windows.update(tabs[0].windowId, { focused: true });
      } else {
        chrome.tabs.create({ url: USAGE_URL });
      }
      window.close();
    });
  });
});
