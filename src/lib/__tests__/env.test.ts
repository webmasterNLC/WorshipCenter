import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { appOrigin, requiredEnv } from '../env';

const SAVED = { ...process.env };

beforeEach(() => {
  delete process.env.APP_ORIGIN;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
});
afterEach(() => {
  process.env = { ...SAVED };
});

describe('requiredEnv', () => {
  it('returns the trimmed value', () => {
    process.env.SOME_VAR = '  hello\n';
    expect(requiredEnv('SOME_VAR')).toBe('hello');
    delete process.env.SOME_VAR;
  });

  it('throws naming the variable when unset or blank', () => {
    expect(() => requiredEnv('NOPE_MISSING')).toThrow(/NOPE_MISSING/);
    process.env.BLANK_VAR = '   ';
    expect(() => requiredEnv('BLANK_VAR')).toThrow(/BLANK_VAR/);
    delete process.env.BLANK_VAR;
  });
});

describe('appOrigin', () => {
  it('prefers APP_ORIGIN', () => {
    process.env.APP_ORIGIN = 'https://songdrop.example';
    process.env.NEXT_PUBLIC_APP_URL = 'https://ignored.example';
    expect(appOrigin()).toBe('https://songdrop.example');
  });

  it('falls back to NEXT_PUBLIC_APP_URL', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://fallback.example';
    expect(appOrigin()).toBe('https://fallback.example');
  });

  it('strips trailing slashes so `${origin}/path` stays clean', () => {
    process.env.APP_ORIGIN = 'https://songdrop.example///';
    expect(`${appOrigin()}/onboard`).toBe('https://songdrop.example/onboard');
  });

  it('falls back to the origin Vercel reports, with a protocol', () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'songdrop-nine.vercel.app';
    expect(appOrigin()).toBe('https://songdrop-nine.vercel.app');
  });

  it('does not double up the protocol if Vercel already supplies one', () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'https://songdrop-nine.vercel.app/';
    expect(appOrigin()).toBe('https://songdrop-nine.vercel.app');
  });

  it('prefers an explicit APP_ORIGIN over the platform value', () => {
    // The custom domain has to win once it exists.
    process.env.APP_ORIGIN = 'https://songdrop.nlc-burgdorf.ch';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'songdrop-nine.vercel.app';
    expect(appOrigin()).toBe('https://songdrop.nlc-burgdorf.ch');
  });

  it('throws rather than emitting a localhost link when nothing is available', () => {
    expect(() => appOrigin()).toThrow(/APP_ORIGIN/);
  });
});
