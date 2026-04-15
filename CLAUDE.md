# CLAUDE.md

**Project:** Bingy 🔔
**Owner:** Spooner Labs
**Type:** Chrome Extension (Manifest V3)

---

## 1. Purpose

Bingy is a lightweight Chrome extension that monitors Claude usage and alerts the user before limits are reached.

This file defines:
- How to build the system
- How to maintain it
- How to evolve it safely

This is the authoritative development guide.

---

## 2. Core Product Definition

Bingy:
- Monitors the Claude usage page
- Tracks multiple usage types (session, weekly, spend)
- Alerts the user before limits are reached
- Uses sound and optional browser notifications

**Target URL:**
`https://claude.ai/settings/usage`

---

## 3. System Architecture

### Components

| File | Role |
|---|---|
| `content.js` | Parses the DOM on the usage page |
| `background.js` | Manages alerts, thresholds, and state |
| `popup.js` | Provides user controls |
| `manifest.json` | Extension configuration |

### Data Flow

1. `content.js` scrapes usage data from the page
2. Sends a snapshot to `background.js`
3. Background compares values against thresholds
4. Triggers sound or browser notification if threshold crossed
5. Popup reads and displays current state

---

## 4. Development Rules (MANDATORY)

### 4.1 Commit Discipline

Commit after **every** change. Use structured commit messages.

**Format:**
```
feat: add weekly limits parser
fix: correct threshold trigger bug
refactor: split parsing into modules
```

---

### 4.2 Feature Isolation

Each feature MUST have its own documentation file under:

```
docs/features/<feature-name>.md
```

Example: `docs/features/threshold-engine.md`

---

### 4.3 Test-Driven Development (TDD)

All logic must follow this cycle:

1. Write the test
2. Run it — confirm it fails
3. Implement the logic
4. Run it — confirm it passes
5. Refactor if needed

---

### 4.4 Git Hygiene

A `.gitignore` file is REQUIRED in the repo root.

---

## 5. File Structure

```
bingy/
  CLAUDE.md        ← this file
  README.md        ← project overview
  WORKLOG.md       ← session log
  LICENSE
  .gitignore
  docs/
    features/      ← one .md per feature
  src/
    manifest.json
    content.js
    background.js
    popup.js
```

---

## 6. Parsing System (CRITICAL)

The usage page DOM structure is fragile and subject to change. **Do not use DOM selectors.**

### ❌ Never do this

```js
document.querySelector('[role="progressbar"]')
```

### ✅ Use regex on visible text instead

```js
// Matches "87% used"
const percentRegex = /(\d{1,3})%\s*used/i;

// Matches "Resets in 3 days" or similar
const resetRegex = /Resets\s+.+/i;

// Matches spend like "€12.50"
const spendRegex = /€\s?(\d+(?:\.\d{1,2})?)/;
```

---

## 7. Threshold Engine

Only trigger an alert when **both** conditions are true:
- The usage value is crossing the threshold **upward** (not downward)
- The alert has **not already fired** for this threshold crossing

This prevents repeated alerts on the same crossing.

---

## 8. Sound System

- Default sound: "bing"
- User can toggle sound on/off
- Popup includes a test button to preview the sound

---

## 9. UI Requirements

The popup must display:

| Element | Description |
|---|---|
| Session % | Current session usage as a percentage |
| Weekly % | Weekly usage as a percentage |
| Spend % | Spend usage as a percentage |
| Thresholds | Configurable alert thresholds per type |
| Toggles | Sound on/off, notifications on/off |

---

## 10. WORKLOG.md

Log every work session in `WORKLOG.md`. Add a new entry at the top with:
- Date
- What was done
- Who did it

---

## 11. Definition of Done

A feature is complete when it is:

- [ ] Implemented
- [ ] Tested (following TDD in §4.3)
- [ ] Documented in `docs/features/`
- [ ] Committed with a structured message (§4.1)
- [ ] Logged in `WORKLOG.md`
