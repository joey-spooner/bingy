# Feature: Reset Timer

**Status:** Implemented
**Files:** `src/utils/parser.js` → `parseResetTime`, `src/background.js`, `src/popup.js`

---

## What it does

Detects when the Claude session limit will reset and:
1. Schedules a `chrome.alarm` to fire at that exact moment
2. Sends a sound + notification when the reset happens
3. Shows a live countdown in the popup ("Resets in 2h 3m")
4. Clears the session `triggered` flag so the next crossing fires a fresh alert

## How the reset time is parsed

`parseResetTime(resetText)` in `parser.js` converts the visible reset string
to an absolute timestamp. Supported formats:

| Page text              | Interpretation         |
|------------------------|------------------------|
| `Resets in 3 hours`    | now + 3 h              |
| `Resets in 45 minutes` | now + 45 min           |
| `Resets in 2 days`     | now + 48 h             |
| `Resets tomorrow`      | start of next calendar day |
| `Resets on Sunday`     | start of next Sunday   |

Any other format returns `null` (no alarm scheduled).

## Alarm lifecycle

```
content.js scrapes resetText
  → background.js: parseResetTime(resetText) → resetAt
  → chrome.alarms.create('bingy-reset', { when: resetAt })

On alarm fire:
  → state.triggered.session = false  (allow fresh alert on next crossing)
  → play bing sound (if enabled)
  → show browser notification (if enabled)
```

The alarm is re-created on every snapshot, replacing the previous one with the
freshly-parsed time. This keeps it accurate if Claude updates the reset time.

## Popup countdown

`popup.js` reads `state.snapshot.resetAt` and runs a `setInterval` updating
the countdown display every second. The interval is cleared when the popup
closes (automatically, since popup.js lifecycle matches the popup window).
