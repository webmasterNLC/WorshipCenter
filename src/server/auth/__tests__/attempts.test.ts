import { describe, it, expect } from 'vitest';
import { clientIpFrom } from '../attempts';

describe('clientIpFrom', () => {
  it('takes the client address from a proxy chain', () => {
    expect(clientIpFrom('203.0.113.7, 70.41.3.18, 150.172.238.178')).toBe('203.0.113.7');
  });

  it('handles a single address and IPv6', () => {
    expect(clientIpFrom('203.0.113.7')).toBe('203.0.113.7');
    expect(clientIpFrom('2001:db8::8a2e:370:7334')).toBe('2001:db8::8a2e:370:7334');
  });

  it('returns null for anything inet would reject', () => {
    // A bad value here would abort the insert and lose the whole attempt record.
    for (const bad of [null, '', '   ', 'localhost', '<script>', 'a'.repeat(60)]) {
      expect(clientIpFrom(bad)).toBeNull();
    }
  });
});
