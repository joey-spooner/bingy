# Feature: Parsing System

**Status:** Implemented and tested
**File:** `src/utils/parser.js`
**Tests:** `tests/parser.test.js`

---

## What it does

Extracts usage data (session %, weekly %, spend €, reset text) from the
visible text of `claude.ai/settings/usage`.

## Why regex, not DOM selectors

The Claude usage page is a React SPA. Its DOM structure changes without
notice. Regex on `document.body.innerText` is resilient to markup changes
as long as the human-readable text stays the same (see CLAUDE.md §6).

## Key assumptions

1. The first `X% used` match in document order is **session** usage.
2. The second `X% used` match is **weekly** usage.
3. Spend is identified by a leading `€` sign.
4. Reset text starts with the word "Resets".

If Claude's UI changes the order, update `parseSnapshot` in `parser.js`
and add a regression test before shipping.

## API

```js
parseSnapshot(text)  → { sessionPct, weeklyPct, spend, resetText }
shouldAlert(value, threshold, alreadyTriggered) → boolean
shouldReset(value, threshold)                   → boolean
```
