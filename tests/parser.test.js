import { parseSnapshot, shouldAlert, shouldReset } from '../src/utils/parser.js';

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
