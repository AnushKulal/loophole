/**
 * The Firestore REST value codec.
 *
 * Firestore's REST API does not take or return JSON documents. Every field is
 * wrapped in a tag naming its type — `{"stringValue":"hi"}`, `{"integerValue":"3"}`
 * — and the wrapping is not optional or inferable. This module is the only place
 * that knows about it, so everything above talks in plain objects.
 *
 * Two details are easy to get wrong and are the reason this is a module with
 * tests rather than two inline helpers:
 *
 *   • **Integers cross the wire as strings.** Firestore stores int64, which JSON
 *     cannot hold, so `3` comes back as `"3"`. Decoding has to convert, and has
 *     to notice when a value is too large to be a safe JavaScript number rather
 *     than silently rounding it.
 *   • **`undefined` is not a value.** Firestore has null but no undefined, and a
 *     field set to undefined is a write of null, not a no-op. Encoding drops
 *     such keys so that "leave this alone" and "set this to null" stay distinct.
 *
 * https://firebase.google.com/docs/firestore/reference/rest/v1/Value
 */

/** What a document looks like to the rest of the app. */
export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/** A Firestore-tagged value. Only the tags this app actually writes. */
export interface Value {
  nullValue?: null;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  stringValue?: string;
  timestampValue?: string;
  arrayValue?: { values?: Value[] };
  mapValue?: { fields?: Record<string, Value> };
}

export class ValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValueError';
  }
}

/**
 * One plain value, tagged.
 *
 * Numbers split on `Number.isInteger`, which is what Firestore's own clients do:
 * a whole number is an int64 and anything else is a double. The consequence is
 * that `1.0` reads back as an integer, which is harmless here because nothing
 * in this app depends on 1 and 1.0 being distinguishable.
 */
export function encodeValue(v: Json): Value {
  if (v === null) return { nullValue: null };

  switch (typeof v) {
    case 'boolean':
      return { booleanValue: v };
    case 'string':
      return { stringValue: v };
    case 'number': {
      if (!Number.isFinite(v)) throw new ValueError(`cannot store ${v}`);
      return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    }
  }

  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
  return { mapValue: { fields: encodeFields(v as Record<string, Json>) } };
}

/**
 * A document body. Keys whose value is `undefined` are dropped — see the note
 * at the top; this is what keeps a partial update from nulling out fields the
 * caller never mentioned.
 */
export function encodeFields(obj: Record<string, Json | undefined>): Record<string, Value> {
  const out: Record<string, Value> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[k] = encodeValue(v);
  }
  return out;
}

/**
 * Untag one value.
 *
 * An unknown tag decodes to null rather than throwing. A document written by a
 * newer version of this app — or by the console — should not be able to crash
 * an older client on read; a missing field reads as absent, which every caller
 * already has to handle.
 */
export function decodeValue(v: Value | undefined | null): Json {
  if (!v || typeof v !== 'object') return null;

  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return !!v.booleanValue;
  if ('stringValue' in v) return v.stringValue ?? '';
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('timestampValue' in v) return v.timestampValue ?? '';

  if ('integerValue' in v) {
    const n = Number(v.integerValue);
    // Beyond 2^53 the conversion is lossy, and a silently wrong number is worse
    // than a visibly missing one. Nothing this app writes gets near it.
    return Number.isSafeInteger(n) ? n : String(v.integerValue);
  }

  if ('arrayValue' in v) return (v.arrayValue?.values ?? []).map(decodeValue);
  if ('mapValue' in v) return decodeFields(v.mapValue?.fields);

  return null;
}

export function decodeFields(fields: Record<string, Value> | undefined | null): Record<string, Json> {
  const out: Record<string, Json> = {};
  for (const [k, v] of Object.entries(fields ?? {})) out[k] = decodeValue(v);
  return out;
}
