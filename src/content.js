/**
 * content.js — Bingy content script (CLAUDE.md §3, §6)
 *
 * Runs on https://claude.ai/settings/usage.
 * Scrapes visible text with regex (never DOM selectors) and forwards
 * usage snapshots to the background service worker.
 */

import { parseSnapshot } from './utils/parser.js';

const POLL_INTERVAL_MS  = 60_000; // fallback re-scrape every 60 s
const DEBOUNCE_MS       = 500;    // wait for React renders to settle
const INITIAL_DELAY_MS  = 1_000;  // give the SPA time to paint on first load

// ---------------------------------------------------------------------------
// Scrape and send
// ---------------------------------------------------------------------------

function scrapeAndSend() {
  const text = document.body?.innerText ?? '';
  const snapshot = parseSnapshot(text);
  chrome.runtime.sendMessage({ type: 'SNAPSHOT', payload: snapshot });
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

// Initial scrape after a brief pause to let the SPA finish rendering.
setTimeout(scrapeAndSend, INITIAL_DELAY_MS);

// Watch for DOM mutations (React re-renders after data loads).
const debouncedScrape = debounce(scrapeAndSend, DEBOUNCE_MS);
const observer = new MutationObserver(debouncedScrape);
observer.observe(document.body, { childList: true, subtree: true });

// Periodic fallback for silent data refreshes.
setInterval(scrapeAndSend, POLL_INTERVAL_MS);
