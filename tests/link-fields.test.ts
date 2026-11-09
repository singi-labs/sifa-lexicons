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
  knownValues?: string[];
  enum?: string[];
  items?: LexiconProperty;
}

interface RawDoc {
  id: string;
  defs: Record<
    string,
    {
      type: string;
      description?: string;
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
  'id.sifa.profile.skill': 'skill.json',
  'id.sifa.profile.honor': 'honor.json',
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

const positionSkills = records['id.sifa.profile.position']!.defs.main!.record!.properties!.skills!;
const recordOf = (nsid: string) => records[nsid]!.defs.main!.record!;

describe.each([
  'id.sifa.profile.project',
  'id.sifa.profile.education',
  'id.sifa.profile.involvement',
  'id.sifa.profile.skill',
])('%s tools field', (nsid) => {
  const { properties: props = {}, required = [] } = recordOf(nsid);

  it('tools is an optional array of defs#toolRef with the skills array limit', () => {
    expect(props.tools?.type).toBe('array');
    expect(props.tools?.items?.type).toBe('ref');
    expect(props.tools?.items?.ref).toBe('id.sifa.defs#toolRef');
    expect(props.tools?.maxLength).toBe(positionSkills.maxLength);
    expect(required).not.toContain('tools');
  });
});

describe.each([
  'id.sifa.profile.project',
  'id.sifa.profile.education',
  'id.sifa.profile.involvement',
])('%s skills field', (nsid) => {
  const { properties: props = {}, required = [] } = recordOf(nsid);

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

describe.each(
  Object.keys(RECORD_FILES).filter(
    (n) => n !== 'id.sifa.profile.position' && n !== 'id.sifa.profile.honor',
  ),
)('%s fixtures', (nsid) => {
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

  if (recordOf(nsid).properties?.skills) {
    it('accepts 50 skills and rejects 51', () => {
      const skills = (n: number) => ({ ...base, skills: refs(n, 'id.sifa.profile.skill') });
      expect(() => lex.assertValidRecord(nsid, skills(50))).not.toThrow();
      expect(() => lex.assertValidRecord(nsid, skills(51))).toThrow();
    });
  }

  it('still validates without the link fields (backward compatible)', () => {
    const legacy: Record<string, unknown> = { ...base };
    delete legacy.tools;
    delete legacy.skills;
    delete legacy.contexts;
    expect(() => lex.assertValidRecord(nsid, legacy)).not.toThrow();
  });
});

describe('defs context tokens', () => {
  it.each(['contextProfessional', 'contextPersonal'])('%s is a described token', (name) => {
    expect(defs.defs[name]?.type).toBe('token');
    expect(defs.defs[name]?.description?.length).toBeGreaterThan(0);
  });
});

describe('id.sifa.profile.skill contexts field', () => {
  const { properties: props = {}, required = [] } = recordOf('id.sifa.profile.skill');

  it('contexts is an optional array of at most 2 open-set strings', () => {
    expect(props.contexts?.type).toBe('array');
    expect(props.contexts?.maxLength).toBe(2);
    expect(props.contexts?.items?.type).toBe('string');
    expect(props.contexts?.items?.knownValues).toEqual([
      'id.sifa.defs#contextProfessional',
      'id.sifa.defs#contextPersonal',
    ]);
    expect(props.contexts?.items?.enum).toBeUndefined();
    expect(required).not.toContain('contexts');
  });

  it('contexts description documents who sets it, absence, and that it is a display hint', () => {
    const description = props.contexts?.description ?? '';
    expect(description).toMatch(/set by the owner/i);
    expect(description).toMatch(/never inferred/i);
    expect(description).toMatch(/unspecified/i);
    expect(description).toMatch(/display hint/i);
    expect(description).toMatch(/public/i);
  });

  it('required fields are unchanged', () => {
    expect(required).toEqual(['name', 'createdAt']);
  });
});

const HONOR_KINDS = [
  'id.sifa.defs#honorAward',
  'id.sifa.defs#honorNomination',
  'id.sifa.defs#honorChampionship',
  'id.sifa.defs#honorRecord',
  'id.sifa.defs#honorRecognition',
];

describe('defs honor tokens', () => {
  it.each(HONOR_KINDS.map((k) => k.split('#')[1]!))('%s is a described token', (name) => {
    expect(defs.defs[name]?.type).toBe('token');
    expect(defs.defs[name]?.description?.length).toBeGreaterThan(0);
  });
});

describe('id.sifa.profile.honor kind and links fields', () => {
  const nsid = 'id.sifa.profile.honor';
  const { properties: props = {}, required = [] } = recordOf(nsid);
  const involvementLinks =
    records['id.sifa.profile.involvement']!.defs.main!.record!.properties!.links!;

  it('kind is an optional open-set string of honor tokens', () => {
    expect(props.kind?.type).toBe('string');
    expect(props.kind?.knownValues).toEqual(HONOR_KINDS);
    expect(props.kind?.enum).toBeUndefined();
    expect(props.kind?.description).toMatch(/unspecified/i);
    expect(required).not.toContain('kind');
  });

  it('links is an optional array of defs#artifactLink shaped like involvement.links', () => {
    expect(props.links?.type).toBe(involvementLinks.type);
    expect(props.links?.items).toEqual(involvementLinks.items);
    expect(props.links?.maxLength).toBe(involvementLinks.maxLength);
    expect(required).not.toContain('links');
  });

  it('required fields are unchanged', () => {
    expect(required).toEqual(['title', 'createdAt']);
  });

  const dir = join(FIXTURES_DIR, 'honor');
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

  const base = load('valid-links-and-kind.json');

  it.each(HONOR_KINDS)('accepts kind %s', (kind) => {
    expect(() => lex.assertValidRecord(nsid, { ...base, kind })).not.toThrow();
  });

  it('accepts 50 links and rejects 51', () => {
    const links = (n: number) => ({
      ...base,
      links: Array.from({ length: n }, (_, i) => ({ url: `https://example.com/source/${i}` })),
    });
    expect(() => lex.assertValidRecord(nsid, links(50))).not.toThrow();
    expect(() => lex.assertValidRecord(nsid, links(51))).toThrow();
  });
});
