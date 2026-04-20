# Feature: Extra Usage Limit

**Status:** Planned
**Files:** `src/content.js`, `src/utils/parser.js`, `src/background.js`, `src/popup.js`, `src/offscreen.js`
**Tests:** `tests/parser.test.js`, `tests/threshold.test.js`

---

## What it does

Tracks the "Extra" usage tier that Claude.ai surfaces when a user has
additional capacity beyond their normal session/weekly limits.  When that
extra capacity crosses a configurable threshold, Bingy fires a distinct
sound alert (the "jiggle" MP3) plus a browser notification.

---

## Parsing

Follow the same regex-on-visible-text rule as all other dimensions
(CLAUDE.md §6 — never use DOM selectors).

On the usage page the extra usage block sits inside a "Current Usage"
section and reads something like:

```
Current Usage
...
Extra usage
43% used
```

Anchor the regex to the "Current Usage" section header, then locate the
"Extra usage" label within it:

```js
// Matches "Extra usage … X% used" inside the Current Usage section.
const EXTRA_RE = /Current\s+Usage[\s\S]{0,300}?Extra\s+usage[\s\S]{0,80}?(\d{1,3})%\s*used/i;
```

The wider outer window (`{0,300}`) accommodates other items in the section
before the Extra row; the tighter inner window (`{0,80}`) keeps the
percentage match close to the "Extra usage" label.

Adjust either window if the page inserts significantly more or less
whitespace.

### `parseSnapshot` change

Add `extraPct: null` to the result object and populate it:

```js
const extraMatch = text.match(EXTRA_RE);
if (extraMatch) result.extraPct = parseInt(extraMatch[1], 10);
```

If the field is absent from the page (e.g. the user has no extra capacity),
`extraPct` stays `null` and no alert is evaluated.

---

## Threshold engine integration

Mirrors `checkPercent('session', …)` exactly — extra usage is a percentage
dimension, so the same `shouldAlert` / `shouldReset` helpers apply.

### New state fields

```js
// DEFAULT_STATE additions
thresholds: {
  session: 80,
  weekly:  80,
  spend:   10,
  extra:   80,   // ← new, percent
},
triggered: {
  session: false,
  weekly:  false,
  spend:   false,
  extra:   false, // ← new
},
```

### New check call in `handleSnapshot`

```js
await checkPercent('extra', snap.extraPct, state.thresholds.extra);
```

### Alert label

Add to the `LABELS` map in `background.js`:

```js
const LABELS = {
  session: 'Session',
  weekly:  'Weekly',
  spend:   'Spend',
  extra:   'Extra',   // ← new
  reset:   'Session reset',
};
```

---

## Popup UI changes

| Element | Location | Change |
|---|---|---|
| Extra % display | Usage readout section | Show `extraPct` alongside session / weekly / spend; display `—` when `null` |
| Extra threshold input | Settings section | Number input (0–100), same pattern as session and weekly inputs |

When `extraPct` is `null` the row should be visible but greyed out with a
note like "Not available on your plan."

---

## Sound

The extra usage alert plays a different sound from the standard bing.

**File:** `src/sounds/my-money-dont-jiggle-jiggle.mp3`

### How to play it

The offscreen document (`src/offscreen.js`) already handles `PLAY_BING` via
the Web Audio oscillator.  Add a parallel handler `PLAY_EXTRA` that plays
the MP3 via an `<audio>` element instead:

```js
// offscreen.js
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'PLAY_BING')  { playBing().catch(notifyDone); }
  if (msg.type === 'PLAY_EXTRA') { playMp3('sounds/my-money-dont-jiggle-jiggle.mp3').catch(notifyDone); }
});

async function playMp3(src) {
  const audio = new Audio(chrome.runtime.getURL(src));
  await audio.play();
  audio.onended = notifyDone;
}
```

The MP3 must be declared in `manifest.json` under `web_accessible_resources`
so `chrome.runtime.getURL` can resolve it:

```json
{
  "web_accessible_resources": [{
    "resources": ["offscreen.html", "sounds/my-money-dont-jiggle-jiggle.mp3"],
    "matches":   ["<all_urls>"]
  }]
}
```

In `background.js`, `fireAlert` should send `PLAY_EXTRA` instead of
`PLAY_BING` when `type === 'extra'`:

```js
async function playAlert(type) {
  const msgType = type === 'extra' ? 'PLAY_EXTRA' : 'PLAY_BING';
  // ... same offscreen setup as playBing(), but send msgType
}
```

---

## Alert conditions (same as CLAUDE.md §7)

An alert fires **only when both** are true:

1. `extraPct >= thresholds.extra`
2. `triggered.extra === false`

The `triggered.extra` flag resets to `false` when `extraPct` drops back
below the threshold, allowing a fresh alert on the next upward crossing.

---

## Definition of done

- [ ] `EXTRA_RE` regex added to `src/content.js` and `src/utils/parser.js`
- [ ] `parseSnapshot` returns `extraPct`
- [ ] Parser tests cover: present, absent, and zero-value cases
- [ ] `DEFAULT_STATE` updated with `thresholds.extra` and `triggered.extra`
- [ ] `handleSnapshot` calls `checkPercent('extra', …)`
- [ ] `LABELS` map updated
- [ ] Popup displays extra % and exposes threshold input
- [ ] Manual smoke-test: load usage page, confirm extra value parses and
      alert fires when threshold crossed
- [ ] `src/sounds/my-money-dont-jiggle-jiggle.mp3` present and listed in `web_accessible_resources`
- [ ] `offscreen.js` handles `PLAY_EXTRA` message via `<audio>` element
- [ ] `fireAlert('extra', …)` sends `PLAY_EXTRA` instead of `PLAY_BING`
- [ ] Committed with message `feat: add extra usage limit tracking`
- [ ] Logged in `WORKLOG.md`
