# WORKLOG.md

Track all work sessions here. Add a new entry at the top for each session.

---

## 2026-05-15 — Enable/disable toggle + greyscale icon

**Session:** Add master on/off toggle to pause monitoring
**By:** Claude (via Claude Code)
**Changes:**
- `src/background.js` — `enabled: true` added to DEFAULT_STATE; `TOGGLE_ENABLED` message handler; `handleSnapshot` early-returns when paused; `setupRefreshAlarm` and refresh alarm tick skip when paused; `updateActionIcon()` using OffscreenCanvas for greyscale icon when disabled; called on SW startup and on toggle
- `src/popup.html` — `.enabled-bar` div with checkbox toggle between header and usage meters
- `src/popup.js` — `updateEnabledUI()` helper; `loadState()` reads `state.enabled`; `change` listener sends `TOGGLE_ENABLED`
- `src/popup.css` — green active / amber paused styles for `.enabled-bar`
- `docs/features/enable-disable-toggle.md` — feature documentation

---

## 2026-04-15 — Reset timer + bug fix

**Session:** Add reset timer feature; fix content.js console error
**By:** Claude (via Claude Code)
**Changes:**
- `tests/parser.test.js` — 9 new tests for `parseResetTime` (TDD, written first)
- `src/utils/parser.js` — `parseResetTime`: converts reset text to timestamp (26 tests green)
- `src/content.js` — fix: `.catch(() => {})` on `sendMessage` to suppress SW-asleep error
- `src/manifest.json` — add `"alarms"` permission
- `src/background.js` — schedule `chrome.alarm` on each snapshot; on fire: clear triggered flag, bing + notify
- `src/popup.html/css/js` — live countdown display ("Resets in 2h 3m"), updates every second
- `docs/features/reset-timer.md` — feature documentation

---

## 2026-04-15 — Full extension build

**Session:** Implement the complete Chrome extension
**By:** Claude (via Claude Code)
**Changes:**
- `package.json` — Jest with ESM support (`--experimental-vm-modules`)
- `tests/parser.test.js` — 17 unit tests (written before implementation, TDD §4.3)
- `src/utils/parser.js` — `parseSnapshot`, `shouldAlert`, `shouldReset`; all 17 tests green
- `src/manifest.json` — MV3 manifest; permissions: storage, notifications, offscreen
- `src/content.js` — MutationObserver + 60 s poll; sends snapshots to background
- `src/background.js` — threshold engine, state persistence, offscreen orchestration
- `src/offscreen.html` + `src/offscreen.js` — Web Audio API bing (MV3 audio workaround)
- `src/popup.html` + `src/popup.css` + `src/popup.js` — usage bars, threshold inputs, toggles
- `docs/features/` — four feature docs (parsing, threshold, sound, popup)

---

## 2026-04-15

**Session:** Initial scaffolding
**By:** Claude (via Claude Code)
**Changes:**
- Created `.gitignore`
- Created `README.md`
- Created `WORKLOG.md`
- Created `LICENSE`
- Created `docs/features/` directory with placeholder
- Improved readability of `CLAUDE.md`
