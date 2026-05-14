// ═══════════════════════════════════════════════════════════
// UNIT TESTS — parseExpiry helper
// ═══════════════════════════════════════════════════════════

// Mirror the function from auth.service.ts
function parseExpiry(expiry: string): number {
  const unit = expiry.slice(-1);
  const value = parseInt(expiry.slice(0, -1));
  if (unit === 'm') return value * 60;
  if (unit === 'h') return value * 3600;
  if (unit === 'd') return value * 86400;
  return 900; // default 15 min
}

describe('parseExpiry', () => {
  it('parses minutes correctly', () => {
    expect(parseExpiry('15m')).toBe(900);
    expect(parseExpiry('30m')).toBe(1800);
    expect(parseExpiry('1m')).toBe(60);
  });

  it('parses hours correctly', () => {
    expect(parseExpiry('1h')).toBe(3600);
    expect(parseExpiry('2h')).toBe(7200);
    expect(parseExpiry('24h')).toBe(86400);
  });

  it('parses days correctly', () => {
    expect(parseExpiry('1d')).toBe(86400);
    expect(parseExpiry('7d')).toBe(604800);
    expect(parseExpiry('30d')).toBe(2592000);
  });

  it('returns default 900 for unknown unit', () => {
    expect(parseExpiry('30s')).toBe(900);
    expect(parseExpiry('1w')).toBe(900);
    expect(parseExpiry('invalid')).toBe(900);
  });

  it('handles large numbers', () => {
    expect(parseExpiry('365d')).toBe(31536000);
  });
});
