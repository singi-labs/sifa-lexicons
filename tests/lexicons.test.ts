import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const LEXICONS_DIR = join(import.meta.dirname, '..', 'lexicons', 'id', 'sifa');
const EXTERNAL_DIR = join(import.meta.dirname, '..', 'external-lexicons');

interface LexiconProperty {
  type: string;
  format?: string;
  maxGraphemes?: number;
  maxLength?: number;
  ref?: string;
  refs?: string[];
  items?: LexiconProperty;
  properties?: Record<string, LexiconProperty>;
  required?: string[];
}

interface LexiconDef {
  type: string;
  key?: string;
  description?: string;
  record?: {
    type: string;
    properties?: Record<string, LexiconProperty>;
    required?: string[];
  };
}

interface LexiconDoc {
  lexicon: number;
  id: string;
  description?: string;
  defs: Record<string, LexiconDef>;
}

/**
 * Recursively find all .json files in a directory.
 */
function findJsonFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findJsonFiles(fullPath));
    } else if (entry.name.endsWith('.json')) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Derive expected NSID from file path relative to lexicons/ root.
 * e.g., lexicons/id/sifa/profile/self.json -> id.sifa.profile.self
 */
function pathToNsid(filePath: string): string {
  const lexiconsRoot = join(import.meta.dirname, '..', 'lexicons');
  const rel = relative(lexiconsRoot, filePath);
  return rel
    .replace(/\.json$/, '')
    .split(sep)
    .join('.');
}

/**
 * Collect all refs from a lexicon's properties (recursively through nested objects/arrays).
 */
function collectRefs(properties: Record<string, LexiconProperty>): string[] {
  const refs: string[] = [];
  for (const prop of Object.values(properties)) {
    if (prop.type === 'ref' && prop.ref) {
      refs.push(prop.ref);
    }
    if (prop.type === 'union' && prop.refs) {
      refs.push(...prop.refs);
    }
    if (prop.items) {
      if (prop.items.type === 'ref' && prop.items.ref) {
        refs.push(prop.items.ref);
      }
      if (prop.items.properties) {
        refs.push(...collectRefs(prop.items.properties));
      }
    }
    if (prop.properties) {
      refs.push(...collectRefs(prop.properties));
    }
  }
  return refs;
}

// Known user-facing text field names that should have maxGraphemes constraints.
// These are fields where users type free-form professional content.
const USER_TEXT_FIELDS = new Set([
  'headline',
  'about',
  'description',
  'company',
  'companyName',
  'title',
  'institution',
  'skillName',
  'name',
  'comment',
  'role',
  'cause',
  'organization',
  'degree',
  'fieldOfStudy',
  'grade',
  'activities',
  'authority',
  'credentialId',
  'publisher',
  'issuer',
  'number',
]);

// Load all lexicon files
const lexiconFiles = findJsonFiles(LEXICONS_DIR);
const lexicons: Array<{ path: string; doc: LexiconDoc }> = lexiconFiles.map((filePath) => ({
  path: filePath,
  doc: JSON.parse(readFileSync(filePath, 'utf-8')) as LexiconDoc,
}));

// Separate record lexicons from non-record lexicons (defs, permission-set, etc.)
const recordLexicons = lexicons.filter((l) => l.doc.defs.main?.type === 'record');

describe('Lexicon JSON validity', () => {
  it.each(lexiconFiles.map((f) => [relative(LEXICONS_DIR, f), f]))(
    '%s is valid JSON',
    (_label, filePath) => {
      const content = readFileSync(filePath as string, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    },
  );
});

describe('NSID matches file path', () => {
  it.each(lexicons.map((l) => [l.doc.id, l.path]))(
    '%s matches its file location',
    (nsid, filePath) => {
      const expected = pathToNsid(filePath as string);
      expect(nsid).toBe(expected);
    },
  );
});

describe('Record key conventions', () => {
  it('id.sifa.profile.self uses "literal:self" key (singleton)', () => {
    const selfLexicon = recordLexicons.find((l) => l.doc.id === 'id.sifa.profile.self');
    expect(selfLexicon).toBeDefined();
    expect(selfLexicon!.doc.defs.main.key).toBe('literal:self');
  });

  it.each(recordLexicons.filter((l) => l.doc.id !== 'id.sifa.profile.self').map((l) => [l.doc.id]))(
    '%s uses "tid" key (collection)',
    (nsid) => {
      const lexicon = recordLexicons.find((l) => l.doc.id === nsid);
      expect(lexicon).toBeDefined();
      expect(lexicon!.doc.defs.main.key).toBe('tid');
    },
  );
});

describe('User-facing text fields have maxGraphemes', () => {
  for (const { doc } of recordLexicons) {
    const properties = doc.defs.main.record?.properties;
    if (!properties) continue;

    for (const [fieldName, prop] of Object.entries(properties)) {
      if (prop.type !== 'string' || !USER_TEXT_FIELDS.has(fieldName)) continue;
      // Skip fields that use format (uri, did, datetime, language) -- those are not free-text
      if (prop.format) continue;

      it(`${doc.id}.${fieldName} has maxGraphemes`, () => {
        expect(
          prop.maxGraphemes,
          `${doc.id} field "${fieldName}" is a user-facing text field but lacks maxGraphemes`,
        ).toBeDefined();
      });
    }
  }
});

describe('Timestamps use datetime format', () => {
  for (const { doc } of recordLexicons) {
    const properties = doc.defs.main.record?.properties;
    if (!properties) continue;

    for (const [fieldName, prop] of Object.entries(properties)) {
      if (
        prop.type === 'string' &&
        (fieldName === 'createdAt' || fieldName.endsWith('At') || fieldName.endsWith('Date'))
      ) {
        it(`${doc.id}.${fieldName} has format "datetime"`, () => {
          expect(prop.format).toBe('datetime');
        });
      }
    }
  }
});

describe('All lexicons have a top-level description', () => {
  it.each(lexicons.map((l) => [l.doc.id]))('%s has a description', (nsid) => {
    const lexicon = lexicons.find((l) => l.doc.id === nsid);
    expect(lexicon).toBeDefined();
    expect(lexicon!.doc.description).toBeDefined();
    expect(lexicon!.doc.description!.length).toBeGreaterThan(0);
  });
});

describe('External lexicon references exist', () => {
  // Collect all external refs (not starting with # or id.sifa.)
  const externalRefs = new Set<string>();

  for (const { doc } of lexicons) {
    for (const def of Object.values(doc.defs)) {
      if (def.type !== 'record' || !def.record?.properties) continue;

      for (const ref of collectRefs(def.record.properties)) {
        // Strip fragment (e.g., "com.atproto.label.defs#selfLabels" -> "com.atproto.label.defs")
        const baseRef = ref.split('#')[0];
        // Skip internal refs (empty base means #fragment within same doc, or id.sifa.* refs)
        if (baseRef === '' || baseRef.startsWith('id.sifa.')) continue;
        externalRefs.add(baseRef);
      }
    }
  }

  it.each([...externalRefs].map((ref) => [ref]))(
    'external ref %s has a corresponding file in external-lexicons/',
    (ref) => {
      const refPath = join(EXTERNAL_DIR, ...(ref as string).split('.'));
      const expectedFile = refPath + '.json';
      expect(
        () => readFileSync(expectedFile, 'utf-8'),
        `Expected external lexicon file at ${expectedFile}`,
      ).not.toThrow();
    },
  );
});
