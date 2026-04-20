/**
 * content.js — Bingy content script (CLAUDE.md §3, §6)
 *
 * Runs on https://claude.ai/settings/usage.
 * Scrapes visible text with regex (never DOM selectors) and forwards
 * usage snapshots to the background service worker.
 *
 * Intentionally self-contained — no ES module imports. Content script
 * module support varies across Chrome versions; inlining the parser
 * removes that dependency entirely.
 */

// ---------------------------------------------------------------------------
// Parsing (mirrors src/utils/parser.js — keep in sync if logic changes)
// ---------------------------------------------------------------------------

// Matches "87% used", "100% used", etc.
const PERCENT_RE = /(\d{1,3})%\s*used/gi;

// Matches "Resets in 3 days", "Resets on Sunday", etc.
const RESET_RE = /Resets\s+[^\n]+/i;

// Matches "€12.50", "€ 5", "€ 3.99"
const SPEND_RE = /€\s?(\d+(?:\.\d{1,2})?)/;

/**
 * Extract usage data from the page's visible text.
 * First "X% used" → session; second → weekly.
 *
 * @param {string} text
 * @returns {{ sessionPct: number|null, weeklyPct: number|null, spend: number|null, resetText: string|null }}
 */
function parseSnapshot(text) {
  const result = { sessionPct: null, weeklyPct: null, spend: null, resetText: null, extraPct: null };

  const pcts = [...text.matchAll(PERCENT_RE)];
  if (pcts[0]) result.sessionPct = parseInt(pcts[0][1], 10);
  if (pcts[1]) result.weeklyPct  = parseInt(pcts[1][1], 10);

  const spendMatch = text.match(SPEND_RE);
  if (spendMatch) result.spend = parseFloat(spendMatch[1]);

  const resetMatch = text.match(RESET_RE);
  if (resetMatch) result.resetText = resetMatch[0].trim();

  return result;
}

// ---------------------------------------------------------------------------
// Scrape and send
// ---------------------------------------------------------------------------

function scrapeAndSend() {
  const text = document.body?.innerText ?? '';
  const snapshot = parseSnapshot(text);

  // Extra usage lives in a dedicated section — scope the text to that element
  // so we don't accidentally grab a third "X% used" from elsewhere on the page.
  const extraEl = document.getElementById('extra-usage-section');
  if (extraEl) {
    const m = extraEl.innerText.match(/(\d{1,3})%\s*used/i);
    snapshot.extraPct = m ? parseInt(m[1], 10) : null;
  }

  // Two distinct failure modes require two distinct guards:
  //
  // 1. Synchronous throw — "Extension context invalidated" fires when the
  //    extension is reloaded while the content script is still alive.
  //    .catch() on a Promise cannot catch synchronous errors, so we wrap
  //    the whole call in try/catch.
  //
  // 2. Async callback error — "Could not establish connection / Receiving
  //    end does not exist" fires when the MV3 service worker is sleeping.
  //    Reading chrome.runtime.lastError inside the callback silences the
  //    "Unchecked runtime.lastError" console warning Chrome emits when the
  //    error goes unread. The next poll interval will retry automatically.
  try {
    chrome.runtime.sendMessage({ type: 'SNAPSHOT', payload: snapshot }, () => {
      void chrome.runtime.lastError;
    });
  } catch (_) {
    // Context invalidated — nothing to do; intervals/observer will stop
    // naturally once the page is torn down.
  }
}

// ---------------------------------------------------------------------------
// Debounce helper
// ---------------------------------------------------------------------------

function debounce(fn, ms) {
  let timer;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 60_000; // fallback re-scrape every 60 s
const DEBOUNCE_MS      = 500;    // wait for React renders to settle
const INITIAL_DELAY_MS = 1_000;  // give the SPA time to paint on first load

// Initial scrape after a brief pause to let the SPA finish rendering.
setTimeout(scrapeAndSend, INITIAL_DELAY_MS);

// Watch for DOM mutations (React re-renders after data loads).
const debouncedScrape = debounce(scrapeAndSend, DEBOUNCE_MS);
const observer = new MutationObserver(debouncedScrape);
observer.observe(document.body, { childList: true, subtree: true });

// Periodic fallback for silent data refreshes.
setInterval(scrapeAndSend, POLL_INTERVAL_MS);
