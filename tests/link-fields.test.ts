import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Lexicons, type LexiconDoc } from '@atproto/lexicon';

const ROOT = join(import.meta.dirname, '..');
const FIXTURES_DIR = join(import.meta.dirname, 'fixtures', 'records');

interface LexiconProperty {
  type: string;
  format?: string;
  ref?: string;
  maxLength?: number;
  description?: string;
  items?: LexiconProperty;
}

interface RawDoc {
  id: string;
  defs: Record<
    string,
    {
      type: string;
      required?: string[];
      properties?: Record<string, LexiconProperty>;
      record?: { required?: string[]; properties?: Record<string, LexiconProperty> };
    }
  >;
}

function readDoc(...segments: string[]): RawDoc {
  return JSON.parse(readFileSync(join(ROOT, ...segments), 'utf-8')) as RawDoc;
}

const defs = readDoc('lexicons', 'id', 'sifa', 'defs.json');

const RECORD_FILES: Record<string, string> = {
  'id.sifa.profile.project': 'project.json',
  'id.sifa.profile.education': 'education.json',
  'id.sifa.profile.involvement': 'involvement.json',
  'id.sifa.profile.position': 'position.json',
};

const records = Object.fromEntries(
  Object.entries(RECORD_FILES).map(([nsid, file]) => [
    nsid,
    readDoc('lexicons', 'id', 'sifa', 'profile', file),
  ]),
);

function findJsonFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? findJsonFiles(join(dir, entry.name))
      : entry.name.endsWith('.json')
        ? [join(dir, entry.name)]
        : [],
  );
}

// Every own and external lexicon, so new refs resolve without a second
// dependency list. Permission sets are not record or object schemas, so they
// stay out. Lexicons rewrites refs in place, so it gets copies and the shape
// tests keep reading the source JSON.
const lex = new Lexicons(
  [join(ROOT, 'lexicons'), join(ROOT, 'external-lexicons')]
    .flatMap(findJsonFiles)
    .map((f) => JSON.parse(readFileSync(f, 'utf-8')) as RawDoc)
    .filter((doc) => doc.defs.main?.type !== 'permission-set')
    .map((doc) => structuredClone(doc)) as unknown as LexiconDoc[],
);

describe('defs#toolRef', () => {
  const toolRef = defs.defs.toolRef;

  it('is an object def requiring only uri', () => {
    expect(toolRef?.type).toBe('object');
    expect(toolRef?.required).toEqual(['uri']);
  });

  it('uri is an at-uri string with no CID alongside it', () => {
    expect(toolRef?.properties?.uri?.type).toBe('string');
    expect(toolRef?.properties?.uri?.format).toBe('at-uri');
    expect(Object.keys(toolRef?.properties ?? {})).toEqual(['uri']);
  });

  it('tells consumers to ignore references that do not resolve', () => {
    expect(toolRef?.description).toMatch(/ignore/i);
  });
});

describe.each([
  'id.sifa.profile.project',
  'id.sifa.profile.education',
  'id.sifa.profile.involvement',
])('%s link fields', (nsid) => {
  const record = records[nsid]!.defs.main!.record!;
  const props = record.properties ?? {};
  const required = record.required ?? [];
  const positionSkills =
    records['id.sifa.profile.position']!.defs.main!.record!.properties!.skills!;

  it('tools is an optional array of defs#toolRef with the skills array limit', () => {
    expect(props.tools?.type).toBe('array');
    expect(props.tools?.items?.type).toBe('ref');
    expect(props.tools?.items?.ref).toBe('id.sifa.defs#toolRef');
    expect(props.tools?.maxLength).toBe(positionSkills.maxLength);
    expect(required).not.toContain('tools');
  });

  it('skills is an optional array of defs#skillRef shaped like position.skills', () => {
    expect(props.skills?.type).toBe(positionSkills.type);
    expect(props.skills?.items).toEqual(positionSkills.items);
    expect(props.skills?.maxLength).toBe(positionSkills.maxLength);
    expect(required).not.toContain('skills');
  });
});

// Tools reach positions only through skills, so employer-specific tooling is
// never attached to a job directly.
describe('id.sifa.profile.position has no tools field', () => {
  it('tools is not defined', () => {
    const props = records['id.sifa.profile.position']!.defs.main!.record!.properties ?? {};
    expect(props.tools).toBeUndefined();
  });
});

describe.each(Object.keys(RECORD_FILES).filter((n) => n !== 'id.sifa.profile.position'))(
  '%s fixtures',
  (nsid) => {
    const dir = join(FIXTURES_DIR, nsid.split('.').pop()!);
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    const load = (f: string): Record<string, unknown> =>
      JSON.parse(readFileSync(join(dir, f), 'utf-8')) as Record<string, unknown>;

    it('has valid and invalid fixtures', () => {
      expect(files.some((f) => f.startsWith('valid-'))).toBe(true);
      expect(files.some((f) => f.startsWith('invalid-'))).toBe(true);
    });

    it.each(files.filter((f) => f.startsWith('valid-')))('%s validates', (f) => {
      expect(() => lex.assertValidRecord(nsid, load(f))).not.toThrow();
    });

    it.each(files.filter((f) => f.startsWith('invalid-')))('%s is rejected', (f) => {
      expect(() => lex.assertValidRecord(nsid, load(f))).toThrow();
    });

    const base = load(files.find((f) => f.startsWith('valid-'))!);
    const refs = (n: number, collection: string) =>
      Array.from({ length: n }, (_, i) => ({
        uri: `at://did:plc:abc123/${collection}/3kabc${String(i).padStart(6, '0')}`,
      }));

    it('accepts 50 tools and rejects 51', () => {
      const tools = (n: number) => ({ ...base, tools: refs(n, 'com.example.tool') });
      expect(() => lex.assertValidRecord(nsid, tools(50))).not.toThrow();
      expect(() => lex.assertValidRecord(nsid, tools(51))).toThrow();
    });

    it('accepts 50 skills and rejects 51', () => {
      const skills = (n: number) => ({ ...base, skills: refs(n, 'id.sifa.profile.skill') });
      expect(() => lex.assertValidRecord(nsid, skills(50))).not.toThrow();
      expect(() => lex.assertValidRecord(nsid, skills(51))).toThrow();
    });

    it('still validates without tools or skills (backward compatible)', () => {
      const legacy: Record<string, unknown> = { ...base };
      delete legacy.tools;
      delete legacy.skills;
      expect(() => lex.assertValidRecord(nsid, legacy)).not.toThrow();
    });
  },
);
