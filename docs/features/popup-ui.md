# Feature: Popup UI

**Status:** Implemented
**Files:** `src/popup.html`, `src/popup.css`, `src/popup.js`

---

## Elements (CLAUDE.md §9)

| Element | ID | Description |
|---|---|---|
| Session bar | `bar-session` | Fill width = session % |
| Weekly bar | `bar-weekly` | Fill width = weekly % |
| Spend bar | `bar-spend` | Fill width = spend / threshold * 100 |
| Session threshold | `thr-session` | Number input, saved on change |
| Weekly threshold | `thr-weekly` | Number input, saved on change |
| Spend threshold | `thr-spend` | Number input (€), saved on change |
| Sound toggle | `pref-sound` | Checkbox, saved immediately |
| Notifications toggle | `pref-notifications` | Checkbox, saved immediately |
| Test sound button | `btn-test-sound` | Sends TEST_BING to background |
| Last updated | `last-updated` | Relative time since last scrape |
| Reset text | `reset-text` | e.g. "Resets in 3 days" |

## Bar colour logic

| Fill % (relative to threshold) | Class |
|---|---|
| < 75 % | (default blue) |
| 75 – 99 % | `warn` (amber) |
| 100 % | `alert` (red) |

## Data source

All data comes from `chrome.storage.local` (`state` key), written by
`background.js`. The popup never communicates with the content script
directly — it reads the most recent snapshot that background already stored.

## Settings persistence

Threshold changes are debounced 400 ms then sent to background via
`UPDATE_SETTINGS` message. Background merges them into `state` and persists.
