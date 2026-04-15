/**
 * parser.js — Bingy usage parser (CLAUDE.md §6)
 *
 * Extracts Claude usage data from the visible text of claude.ai/settings/usage.
 * Uses regex on visible text only — DOM selectors are forbidden (see CLAUDE.md §6).
 *
 * Exported for both browser (content.js ES module) and Node (Jest tests).
 */

// Matches "87% used", "100% used" etc.
const PERCENT_RE = /(\d{1,3})%\s*used/gi;

// Matches "Resets in 3 days", "Resets on Sunday", etc.
const RESET_RE = /Resets\s+[^\n]+/i;

// Matches "€12.50", "€ 5", "€ 3.99"
const SPEND_RE = /€\s?(\d+(?:\.\d{1,2})?)/;

/**
 * Parse usage snapshot from the page's full visible text.
 *
 * Assumes the page lists session usage before weekly usage (the order
 * Claude's UI uses). The first "X% used" match → session; second → weekly.
 *
 * @param {string} text - document.body.innerText of the usage page
 * @returns {{ sessionPct: number|null, weeklyPct: number|null, spend: number|null, resetText: string|null }}
 */
export function parseSnapshot(text) {
  const result = {
    sessionPct: null,
    weeklyPct: null,
    spend: null,
    resetText: null,
  };

  // Extract all "X% used" matches in document order
  const percentMatches = [...text.matchAll(PERCENT_RE)];
  if (percentMatches[0]) result.sessionPct = parseInt(percentMatches[0][1], 10);
  if (percentMatches[1]) result.weeklyPct  = parseInt(percentMatches[1][1], 10);

  // Extract spend amount
  const spendMatch = text.match(SPEND_RE);
  if (spendMatch) result.spend = parseFloat(spendMatch[1]);

  // Extract first reset string
  const resetMatch = text.match(RESET_RE);
  if (resetMatch) result.resetText = resetMatch[0].trim();

  return result;
}

/**
 * Decides whether an alert should fire for a given usage dimension.
 *
 * Only fires when the value is at or above the threshold AND the alert
 * has not already been triggered for this crossing (CLAUDE.md §7).
 *
 * @param {number|null} value          - current usage value (percent or euros)
 * @param {number}      threshold      - alert threshold
 * @param {boolean}     alreadyTriggered - true if alert already fired for this crossing
 * @returns {boolean}
 */
export function shouldAlert(value, threshold, alreadyTriggered) {
  if (value === null) return false;
  return value >= threshold && !alreadyTriggered;
}

/**
 * Decides whether the triggered flag for a dimension should be reset.
 *
 * Resets when usage drops back below the threshold, allowing the next
 * upward crossing to fire a fresh alert (CLAUDE.md §7).
 *
 * @param {number|null} value     - current usage value
 * @param {number}      threshold - alert threshold
 * @returns {boolean}
 */
export function shouldReset(value, threshold) {
  if (value === null) return false;
  return value < threshold;
}
