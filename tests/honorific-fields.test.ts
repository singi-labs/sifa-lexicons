import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Lexicons, type LexiconDoc } from '@atproto/lexicon';

// Optional name honorifics on the profile: a title before the name (Dr.,
// Prof., Sir) and post-nominal letters after it (PhD, OBE). They map to
// Schema.org Person.honorificPrefix / honorificSuffix.
const LEXICONS_DIR = join(import.meta.dirname, '..', 'lexicons', 'id', 'sifa');
const read = (...segments: string[]) =>
  JSON.parse(readFileSync(join(LEXICONS_DIR, ...segments), 'utf-8')) as LexiconDoc;
const selfDoc = read('profile', 'self.json');
const lex = new Lexicons([structuredClone(selfDoc)]);
const NSID = 'id.sifa.profile.self';

interface Property {
  type: string;
  maxGraphemes?: number;
  maxLength?: number;
  description?: string;
  'x-skos:exactMatch'?: string[];
}
// LexiconDoc types defs loosely; narrow to the record shape this test reads.
const record = (
  selfDoc as unknown as {
    defs: { main: { record: { required?: string[]; properties: Record<string, Property> } } };
  }
).defs.main.record;

const base = { $type: NSID, createdAt: '2026-11-10T10:00:00.000Z' };

describe('id.sifa.profile.self honorific fields', () => {
  it.each([
    ['honorificPrefix', 'schema:honorificPrefix'],
    ['honorificSuffix', 'schema:honorificSuffix'],
  ])('%s is an optional bounded string mapped to %s', (name, term) => {
    const prop = record.properties[name];
    expect(prop?.type).toBe('string');
    expect(prop?.maxGraphemes).toBe(64);
    expect(prop?.maxLength).toBe(640);
    expect(prop?.['x-skos:exactMatch']).toContain(term);
    expect(prop?.description?.length).toBeGreaterThan(0);
    expect(record.required ?? []).not.toContain(name);
  });

  it('accepts a record with both, one, or neither', () => {
    for (const extra of [
      { honorificPrefix: 'Dr.', honorificSuffix: 'PhD, OBE' },
      { honorificPrefix: 'Prof. Dr. ir.' },
      { honorificSuffix: 'FRSA' },
      {},
    ]) {
      expect(() => lex.assertValidRecord(NSID, { ...base, ...extra })).not.toThrow();
    }
  });

  it('rejects a non-string or over-long honorific', () => {
    expect(() => lex.assertValidRecord(NSID, { ...base, honorificPrefix: 1 })).toThrow();
    expect(() =>
      lex.assertValidRecord(NSID, { ...base, honorificSuffix: 'a'.repeat(65) }),
    ).toThrow();
  });
});

describe('id.sifa.profile.self showHonorifics', () => {
  it('is an optional boolean that defaults to showing', () => {
    const prop = record.properties.showHonorifics;
    expect(prop?.type).toBe('boolean');
    expect(prop?.description).toMatch(/absent/i);
    expect(record.required ?? []).not.toContain('showHonorifics');
  });

  it('accepts true, false and absent, and rejects a non-boolean', () => {
    for (const extra of [{ showHonorifics: true }, { showHonorifics: false }, {}]) {
      expect(() => lex.assertValidRecord(NSID, { ...base, ...extra })).not.toThrow();
    }
    expect(() => lex.assertValidRecord(NSID, { ...base, showHonorifics: 'no' })).toThrow();
  });
});
