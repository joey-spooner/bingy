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

/* ── Load and render state ────────────────────────────────────────── */

async function loadState() {
  const { state } = await chrome.storage.local.get('state');
  if (!state) return;

  const { snapshot, thresholds, prefs } = state;

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

  // Reset text
  el('reset-text').textContent = snapshot.resetText ?? '';

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

  // Pref checkboxes
  el('pref-sound').checked         = prefs.soundEnabled;
  el('pref-notifications').checked = prefs.notificationsEnabled;
}

/* ── Save helpers ─────────────────────────────────────────────────── */

function saveSettings() {
  chrome.runtime.sendMessage({
    type: 'UPDATE_SETTINGS',
    thresholds: {
      session: Number(el('thr-session').value),
      weekly:  Number(el('thr-weekly').value),
      spend:   Number(el('thr-spend').value),
    },
    prefs: {
      soundEnabled:         el('pref-sound').checked,
      notificationsEnabled: el('pref-notifications').checked,
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

  ['thr-session', 'thr-weekly', 'thr-spend'].forEach((id) => {
    el(id).addEventListener('input', debouncedSave);
  });

  ['pref-sound', 'pref-notifications'].forEach((id) => {
    el(id).addEventListener('change', saveSettings);
  });

  el('btn-test-sound').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'TEST_BING' });
  });
});
