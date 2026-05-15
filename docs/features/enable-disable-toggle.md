# Feature: Enable / Disable Toggle

## Purpose

Lets the user pause Bingy without uninstalling it. When paused, all polling stops, snapshots are ignored, and alerts are suppressed. Re-enabling resumes monitoring immediately.

## User-visible behaviour

- A green bar labelled **"Monitoring active"** sits just below the header in the popup.
- Unchecking the toggle turns the bar amber and shows **"Monitoring paused"**.
- The toolbar icon switches to greyscale when paused, giving an at-a-glance status without opening the popup.
- Toggling back to enabled restores the colour icon and resumes polling.

## State

`state.enabled` (boolean, default `true`) is persisted to `chrome.storage.local` alongside the rest of Bingy's state.

## Components changed

| File | Change |
|---|---|
| `background.js` | `enabled` added to `DEFAULT_STATE`; `TOGGLE_ENABLED` message handler; `handleSnapshot` early-returns when paused; `setupRefreshAlarm` skips alarm creation when paused; `refreshUsageTab` skipped on alarm tick when paused; `updateActionIcon()` renders greyscale via `OffscreenCanvas` when disabled |
| `popup.html` | `.enabled-bar` div with checkbox toggle added between header and usage meters |
| `popup.js` | `updateEnabledUI()` helper; `loadState()` reads `state.enabled`; `change` listener sends `TOGGLE_ENABLED` message |
| `popup.css` | `.enabled-bar` (green) and `.enabled-bar.paused` (amber) styles |

## Icon update mechanism

`updateActionIcon()` in `background.js`:
1. Fetches each icon PNG (`16`, `48`, `128`) via `fetch()`.
2. Draws it onto an `OffscreenCanvas`.
3. If disabled: reads pixel data with `getImageData`, converts each pixel to greyscale (`0.299R + 0.587G + 0.114B`), writes back with `putImageData`.
4. Passes the resulting `ImageData` objects to `chrome.action.setIcon({ imageData })`.

This runs on service-worker startup (to restore state after SW restart) and on every `TOGGLE_ENABLED` message.
