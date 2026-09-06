import { describe, expect, it } from 'vitest';
import { decodeFields, decodeValue, encodeFields, encodeValue, ValueError } from './values';

describe('encodeValue', () => {
  it('tags the scalars', () => {
    expect(encodeValue(null)).toEqual({ nullValue: null });
    expect(encodeValue(true)).toEqual({ booleanValue: true });
    expect(encodeValue('hi')).toEqual({ stringValue: 'hi' });
  });

  it('sends whole numbers as int64 strings', () => {
    // Firestore stores int64, which JSON cannot hold — hence the string.
    expect(encodeValue(3)).toEqual({ integerValue: '3' });
    expect(encodeValue(-1)).toEqual({ integerValue: '-1' });
    expect(encodeValue(0)).toEqual({ integerValue: '0' });
  });

  it('sends fractions as doubles', () => {
    expect(encodeValue(1.5)).toEqual({ doubleValue: 1.5 });
  });

  it('refuses values Firestore cannot hold', () => {
    expect(() => encodeValue(NaN)).toThrow(ValueError);
    expect(() => encodeValue(Infinity)).toThrow(ValueError);
  });

  it('nests arrays and maps', () => {
    expect(encodeValue([1, 'a'])).toEqual({
      arrayValue: { values: [{ integerValue: '1' }, { stringValue: 'a' }] },
    });
    expect(encodeValue({ a: { b: true } })).toEqual({
      mapValue: { fields: { a: { mapValue: { fields: { b: { booleanValue: true } } } } } },
    });
  });

  it('encodes an empty array and an empty map', () => {
    expect(encodeValue([])).toEqual({ arrayValue: { values: [] } });
    expect(encodeValue({})).toEqual({ mapValue: { fields: {} } });
  });
});

describe('encodeFields', () => {
  it('drops undefined rather than writing null', () => {
    // The distinction that matters: "leave this alone" vs "set this to null".
    expect(encodeFields({ a: 1, b: undefined })).toEqual({ a: { integerValue: '1' } });
  });

  it('keeps an explicit null', () => {
    expect(encodeFields({ a: null })).toEqual({ a: { nullValue: null } });
  });
});

describe('decodeValue', () => {
  it('reverses every tag encode produces', () => {
    const cases = [null, true, false, '', 'hi', 0, -7, 42, 1.5, [], [1, 'a'], {}, { a: { b: [true] } }];
    for (const c of cases) expect(decodeValue(encodeValue(c as never))).toEqual(c);
  });

  it('turns integer strings back into numbers', () => {
    expect(decodeValue({ integerValue: '42' })).toBe(42);
  });

  it('keeps an unsafe integer as a string rather than rounding it', () => {
    // Silently wrong is worse than visibly odd.
    expect(decodeValue({ integerValue: '9007199254740993' })).toBe('9007199254740993');
  });

  it('reads a timestamp as its RFC3339 string', () => {
    expect(decodeValue({ timestampValue: '2026-09-06T10:00:00Z' })).toBe('2026-09-06T10:00:00Z');
  });

  it('decodes an unknown tag to null instead of throwing', () => {
    // A document from a newer client must not crash an older one.
    expect(decodeValue({ geoPointValue: { latitude: 1, longitude: 2 } } as never)).toBeNull();
    expect(decodeValue(undefined)).toBeNull();
    expect(decodeValue(null)).toBeNull();
  });
});

describe('decodeFields', () => {
  it('reads a whole document', () => {
    expect(decodeFields({ name: { stringValue: 'Anush' }, lvl: { integerValue: '24' } })).toEqual({
      name: 'Anush',
      lvl: 24,
    });
  });

  it('treats a missing field map as an empty document', () => {
    expect(decodeFields(undefined)).toEqual({});
    expect(decodeFields(null)).toEqual({});
  });

  it('round-trips a realistic profile', () => {
    const profile = {
      handle: 'anush',
      name: 'Anush Kulal',
      mark: '◆',
      gi: 0,
      level: 24,
      xp: 12450,
      lastSeen: 1788600000000,
    };
    expect(decodeFields(encodeFields(profile))).toEqual(profile);
  });
});
