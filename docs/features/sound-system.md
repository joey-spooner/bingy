# Feature: Sound System

**Status:** Implemented
**Files:** `src/offscreen.html`, `src/offscreen.js`, `src/background.js` → `playBing`

---

## Why an offscreen document?

MV3 service workers cannot use the Web Audio API.
Chrome's Offscreen API solves this: a hidden HTML page is created on
demand, plays the sound, then signals the background to close it.

Required manifest permission: `"offscreen"`.

## The bing tone

Generated with Web Audio API (no audio file needed):

- Oscillator type: `sine`
- Frequency: 880 Hz (A5) → 440 Hz (A4) over 0.3 s
- Gain: 0.5 → 0.001 over 0.6 s
- Total duration: ~0.6 s

## Flow

```
background.js: playBing()
  → chrome.offscreen.createDocument(offscreen.html)
  → chrome.runtime.sendMessage({ type: 'PLAY_BING' })

offscreen.js: receives PLAY_BING
  → plays tone via Web Audio API
  → on oscillator.ended:
      chrome.runtime.sendMessage({ type: 'OFFSCREEN_DONE' })

background.js: receives OFFSCREEN_DONE
  → chrome.offscreen.closeDocument()
  → resets bingInProgress guard
```

## Concurrency guard

`bingInProgress` in background.js prevents overlapping offscreen documents
(Chrome only allows one at a time).

## User controls

- **Sound toggle:** stored in `state.prefs.soundEnabled`
- **Test button:** sends `TEST_BING` message from popup → background → offscreen
