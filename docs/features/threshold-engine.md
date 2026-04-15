# Feature: Threshold Engine

**Status:** Implemented
**File:** `src/background.js` → `checkPercent`, `checkSpend`

---

## Alert conditions (CLAUDE.md §7)

An alert fires **only when both** are true:

1. The current value is **at or above** the threshold.
2. The alert has **not already fired** for this crossing (`triggered[type] === false`).

## Reset conditions

The `triggered` flag resets to `false` when the value **drops below** the
threshold. This allows the next upward crossing to fire a fresh alert.

Example:
```
60% → 80% → 90%   : alert fires once at 80 %
90% → 70%          : triggered resets (below threshold)
70% → 85%          : alert fires again (new crossing)
```

## Dimensions

| Dimension | Unit    | Default threshold | Storage key       |
|-----------|---------|-------------------|-------------------|
| Session   | percent | 80                | triggered.session |
| Weekly    | percent | 80                | triggered.weekly  |
| Spend     | euros   | 10                | triggered.spend   |

## State persistence

All threshold and triggered state lives in `chrome.storage.local` under
the key `state`. Because MV3 service workers are ephemeral, state is
re-loaded from storage on every worker restart.
