import { describe, it, expect } from 'vitest';

import { parseOtpType, safeNext } from '../callback-params';

describe('parseOtpType', () => {
  it('accepts the Supabase OTP types', () => {
    expect(parseOtpType('magiclink')).toBe('magiclink');
    expect(parseOtpType('recovery')).toBe('recovery');
    expect(parseOtpType('invite')).toBe('invite');
  });

  it('rejects anything else', () => {
    expect(parseOtpType(null)).toBeNull();
    expect(parseOtpType('')).toBeNull();
    expect(parseOtpType('MAGICLINK')).toBeNull();
    expect(parseOtpType('email_change_current')).toBeNull();
    expect(parseOtpType('__proto__')).toBeNull();
  });
});

describe('safeNext', () => {
  it('keeps same-origin relative paths', () => {
    expect(safeNext('/onboard')).toBe('/onboard');
    expect(safeNext('/playlists/1?x=2')).toBe('/playlists/1?x=2');
  });

  it('falls back when absent', () => {
    expect(safeNext(null)).toBe('/home');
    expect(safeNext('')).toBe('/home');
    expect(safeNext(null, '/onboard')).toBe('/onboard');
  });

  it('rejects off-origin destinations', () => {
    expect(safeNext('https://evil.com')).toBe('/home');
    expect(safeNext('//evil.com')).toBe('/home');
    expect(safeNext('/\\evil.com')).toBe('/home');
    expect(safeNext('evil.com')).toBe('/home');
  });
});
