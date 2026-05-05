import { describe, it, expect } from 'vitest';
import {
  pitchClassFromRoot, rootFromPitchClass, detectKeyAccidental, normalizeSemitones,
} from '../pitch';

describe('pitchClassFromRoot', () => {
  it.each([
    ['C', 0], ['C#', 1], ['Db', 1], ['D', 2], ['D#', 3], ['Eb', 3],
    ['E', 4], ['F', 5], ['F#', 6], ['Gb', 6], ['G', 7], ['G#', 8],
    ['Ab', 8], ['A', 9], ['A#', 10], ['Bb', 10], ['B', 11],
  ])('%s -> %i', (root, expected) => {
    expect(pitchClassFromRoot(root)).toBe(expected);
  });

  it('returns null for unknown letters', () => {
    expect(pitchClassFromRoot('H')).toBeNull();
    expect(pitchClassFromRoot('')).toBeNull();
  });
});

describe('rootFromPitchClass', () => {
  it('uses sharps when prefer=sharp', () => {
    expect(rootFromPitchClass(1, 'sharp')).toBe('C#');
    expect(rootFromPitchClass(3, 'sharp')).toBe('D#');
    expect(rootFromPitchClass(6, 'sharp')).toBe('F#');
    expect(rootFromPitchClass(10, 'sharp')).toBe('A#');
  });

  it('uses flats when prefer=flat', () => {
    expect(rootFromPitchClass(1, 'flat')).toBe('Db');
    expect(rootFromPitchClass(3, 'flat')).toBe('Eb');
    expect(rootFromPitchClass(6, 'flat')).toBe('Gb');
    expect(rootFromPitchClass(10, 'flat')).toBe('Bb');
  });

  it('naturals are independent of preference', () => {
    expect(rootFromPitchClass(0, 'sharp')).toBe('C');
    expect(rootFromPitchClass(0, 'flat')).toBe('C');
    expect(rootFromPitchClass(7, 'sharp')).toBe('G');
    expect(rootFromPitchClass(7, 'flat')).toBe('G');
  });
});

describe('detectKeyAccidental', () => {
  it.each([
    ['F','flat'], ['Bb','flat'], ['Eb','flat'], ['Ab','flat'],
    ['Db','flat'], ['Gb','flat'], ['Cb','flat'],
    ['Dm','flat'], ['Gm','flat'], ['Cm','flat'], ['Fm','flat'], ['Bbm','flat'],
    ['G','sharp'], ['D','sharp'], ['A','sharp'], ['E','sharp'], ['B','sharp'],
    ['F#','sharp'], ['C#','sharp'],
    ['Em','sharp'], ['Bm','sharp'], ['F#m','sharp'], ['C#m','sharp'],
    ['C','sharp'], ['Am','sharp'],
  ])('%s -> %s', (key, pref) => {
    expect(detectKeyAccidental(key)).toBe(pref);
  });
});

describe('normalizeSemitones', () => {
  it.each([
    [0, 0], [12, 0], [-12, 0], [13, 1], [-1, 11], [-13, 11], [25, 1],
  ])('%i -> %i', (n, expected) => {
    expect(normalizeSemitones(n)).toBe(expected);
  });
});
