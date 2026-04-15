import { parseSnapshot, shouldAlert, shouldReset, parseResetTime } from '../src/utils/parser.js';

// ---------------------------------------------------------------------------
// parseSnapshot
// ---------------------------------------------------------------------------

describe('parseSnapshot', () => {
  test('extracts session and weekly percentages in order', () => {
    const text = `
      Claude Usage
      Session usage
      87% used
      Resets in 2 hours
      Weekly messages
      45% used
      Resets on Sunday
      API spend
      €12.50 this month
    `;
    const result = parseSnapshot(text);
    expect(result.sessionPct).toBe(87);
    expect(result.weeklyPct).toBe(45);
    expect(result.spend).toBeCloseTo(12.5);
  });

  test('returns null for missing values', () => {
    const result = parseSnapshot('Nothing useful here.');
    expect(result.sessionPct).toBeNull();
    expect(result.weeklyPct).toBeNull();
    expect(result.spend).toBeNull();
  });

  test('handles spend with space after euro sign', () => {
    const result = parseSnapshot('Spend: € 5 this month');
    expect(result.spend).toBeCloseTo(5);
  });

  test('handles spend with decimal cents', () => {
    const result = parseSnapshot('€ 3.99 billed');
    expect(result.spend).toBeCloseTo(3.99);
  });

  test('handles 100% used', () => {
    const result = parseSnapshot('100% used\n5% used');
    expect(result.sessionPct).toBe(100);
    expect(result.weeklyPct).toBe(5);
  });

  test('captures reset text', () => {
    const result = parseSnapshot('87% used\nResets in 3 days');
    expect(result.resetText).toMatch(/Resets in 3 days/i);
  });

  test('returns null weeklyPct when only one percentage present', () => {
    const result = parseSnapshot('Session\n60% used\nResets tomorrow');
    expect(result.sessionPct).toBe(60);
    expect(result.weeklyPct).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseResetTime
// ---------------------------------------------------------------------------

describe('parseResetTime', () => {
  // Fixed anchor: Wednesday 2026-04-15 12:00:00 UTC
  const NOW = new Date('2026-04-15T12:00:00.000Z').getTime();

  test('parses "Resets in 3 hours"', () => {
    expect(parseResetTime('Resets in 3 hours', NOW)).toBe(NOW + 3 * 3_600_000);
  });

  test('parses "Resets in 45 minutes"', () => {
    expect(parseResetTime('Resets in 45 minutes', NOW)).toBe(NOW + 45 * 60_000);
  });

  test('parses "Resets in 2 days"', () => {
    expect(parseResetTime('Resets in 2 days', NOW)).toBe(NOW + 2 * 86_400_000);
  });

  test('parses singular "Resets in 1 hour"', () => {
    expect(parseResetTime('Resets in 1 hour', NOW)).toBe(NOW + 3_600_000);
  });

  test('parses "Resets in 1 minute"', () => {
    expect(parseResetTime('Resets in 1 minute', NOW)).toBe(NOW + 60_000);
  });

  test('parses "Resets tomorrow"', () => {
    const tomorrow = new Date(NOW);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    expect(parseResetTime('Resets tomorrow', NOW)).toBe(tomorrow.getTime());
  });

  test('parses "Resets on Sunday"', () => {
    const d = new Date(NOW);
    let diff = 0 - d.getDay(); // Sunday = 0
    if (diff <= 0) diff += 7;
    const expected = new Date(NOW);
    expected.setDate(expected.getDate() + diff);
    expected.setHours(0, 0, 0, 0);
    expect(parseResetTime('Resets on Sunday', NOW)).toBe(expected.getTime());
  });

  test('returns null for unrecognised format', () => {
    expect(parseResetTime('Resets April 20th', NOW)).toBeNull();
  });

  test('returns null for null input', () => {
    expect(parseResetTime(null, NOW)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// shouldAlert
// ---------------------------------------------------------------------------

describe('shouldAlert', () => {
  test('returns false when below threshold', () => {
    expect(shouldAlert(70, 80, false)).toBe(false);
  });

  test('returns true when at threshold and not yet triggered', () => {
    expect(shouldAlert(80, 80, false)).toBe(true);
  });

  test('returns true when above threshold and not yet triggered', () => {
    expect(shouldAlert(95, 80, false)).toBe(true);
  });

  test('returns false when at threshold but already triggered', () => {
    expect(shouldAlert(80, 80, true)).toBe(false);
  });

  test('returns false when above threshold and already triggered', () => {
    expect(shouldAlert(95, 80, true)).toBe(false);
  });

  test('returns false when value is null', () => {
    expect(shouldAlert(null, 80, false)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shouldReset
// ---------------------------------------------------------------------------

describe('shouldReset', () => {
  test('returns true when below threshold', () => {
    expect(shouldReset(70, 80)).toBe(true);
  });

  test('returns false when at threshold', () => {
    expect(shouldReset(80, 80)).toBe(false);
  });

  test('returns false when above threshold', () => {
    expect(shouldReset(90, 80)).toBe(false);
  });

  test('returns false when value is null', () => {
    expect(shouldReset(null, 80)).toBe(false);
  });
});
