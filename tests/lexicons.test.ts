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
  minLength?: number;
  maxSize?: number;
  accept?: string[];
  description?: string;
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
  'subtitle',
  'institution',
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

  it('id.sifa.org.profile uses "literal:self" key (singleton)', () => {
    const orgLexicon = recordLexicons.find((l) => l.doc.id === 'id.sifa.org.profile');
    expect(orgLexicon).toBeDefined();
    expect(orgLexicon!.doc.defs.main.key).toBe('literal:self');
  });

  // Singleton records (literal:self) are excluded from the tid-key check.
  const SINGLETON_LEXICONS = new Set(['id.sifa.profile.self', 'id.sifa.org.profile']);

  it.each(recordLexicons.filter((l) => !SINGLETON_LEXICONS.has(l.doc.id)).map((l) => [l.doc.id]))(
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

// Fields whose name ends in `At`/`Date` but which are intentionally calendar
// dates (YYYY-MM or YYYY-MM-DD), not ISO 8601 timestamps. Users typically
// remember only month/year for job and education history. AT Protocol's
// `datetime` format requires a time component, so these stay as plain strings
// and the description documents the accepted shape.
const DATE_ONLY_FIELDS = new Set([
  'id.sifa.profile.position.startedAt',
  'id.sifa.profile.position.endedAt',
  'id.sifa.profile.education.startedAt',
  'id.sifa.profile.education.endedAt',
  'id.sifa.profile.project.startedAt',
  'id.sifa.profile.project.endedAt',
  'id.sifa.profile.involvement.startedAt',
  'id.sifa.profile.involvement.endedAt',
  'id.sifa.profile.volunteering.startedAt',
  'id.sifa.profile.volunteering.endedAt',
  'id.sifa.profile.certification.issuedAt',
  'id.sifa.profile.certification.expiresAt',
  'id.sifa.profile.course.completedAt',
  'id.sifa.profile.honor.awardedAt',
  'id.sifa.profile.publication.publishedAt',
  'id.sifa.org.employmentAttestation.startedAt',
  'id.sifa.org.employmentAttestation.endedAt',
]);

describe('Timestamps use datetime format', () => {
  for (const { doc } of recordLexicons) {
    const properties = doc.defs.main.record?.properties;
    if (!properties) continue;

    for (const [fieldName, prop] of Object.entries(properties)) {
      if (
        prop.type === 'string' &&
        (fieldName === 'createdAt' || fieldName.endsWith('At') || fieldName.endsWith('Date'))
      ) {
        if (DATE_ONLY_FIELDS.has(`${doc.id}.${fieldName}`)) {
          it(`${doc.id}.${fieldName} is a date-only string with YYYY-MM documentation`, () => {
            expect(prop.format).toBeUndefined();
            expect(prop.description).toMatch(/YYYY-MM/);
          });
          continue;
        }
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

describe('Position skills field', () => {
  const positionLexicon = recordLexicons.find((l) => l.doc.id === 'id.sifa.profile.position');
  const properties = positionLexicon?.doc.defs.main.record?.properties;
  const required = positionLexicon?.doc.defs.main.record?.required ?? [];

  it('position lexicon exists', () => {
    expect(positionLexicon).toBeDefined();
  });

  it('skills field exists and is an optional array', () => {
    expect(properties?.skills).toBeDefined();
    expect(properties?.skills?.type).toBe('array');
    expect(required).not.toContain('skills');
  });

  // Skills use id.sifa.defs#skillRef (URI-only) rather than com.atproto.repo.strongRef.
  // CIDs aren't available at write time and skill records are mutable in the same repo;
  // see sifa-lexicons#31 for the migration rationale.
  it('skills items are id.sifa.defs#skillRef references', () => {
    expect(properties?.skills?.items?.type).toBe('ref');
    expect(properties?.skills?.items?.ref).toBe('id.sifa.defs#skillRef');
  });

  it('skills array has maxLength 50', () => {
    expect(properties?.skills?.maxLength).toBe(50);
  });

  it('position without skills field is still valid (backward compatible)', () => {
    expect(required).toEqual(['title', 'startedAt', 'createdAt']);
  });

  it('company is no longer required (self-employed/freelance may omit it)', () => {
    expect(required).not.toContain('company');
  });

  it('company remains a defined, non-empty string property when present', () => {
    expect(properties?.company).toBeDefined();
    expect(properties?.company?.type).toBe('string');
    expect(properties?.company?.minLength).toBe(1);
  });
});

describe('Position entityRef field', () => {
  const positionLexicon = recordLexicons.find((l) => l.doc.id === 'id.sifa.profile.position');
  const properties = positionLexicon?.doc.defs.main.record?.properties;
  const required = positionLexicon?.doc.defs.main.record?.required ?? [];

  it('entityRef exists as an optional string with uri format', () => {
    expect(properties?.entityRef).toBeDefined();
    expect(properties?.entityRef?.type).toBe('string');
    expect(properties?.entityRef?.format).toBe('uri');
  });

  it('entityRef is not required (absent for freetext/Independent positions)', () => {
    expect(required).not.toContain('entityRef');
  });

  it('entityRef has a description mentioning the portable entity identifier', () => {
    expect(properties?.entityRef?.description).toBeDefined();
    expect(properties?.entityRef?.description!.length).toBeGreaterThan(0);
  });
});

describe.each([
  'id.sifa.profile.education',
  'id.sifa.profile.volunteering',
  'id.sifa.profile.certification',
  'id.sifa.profile.course',
  'id.sifa.profile.honor',
])('%s entityRef field', (lexiconId) => {
  const lexicon = recordLexicons.find((l) => l.doc.id === lexiconId);
  const properties = lexicon?.doc.defs.main.record?.properties;
  const required = lexicon?.doc.defs.main.record?.required ?? [];

  it('entityRef exists as an optional string with uri format', () => {
    expect(properties?.entityRef).toBeDefined();
    expect(properties?.entityRef?.type).toBe('string');
    expect(properties?.entityRef?.format).toBe('uri');
  });

  it('entityRef is not required (absent for free-text entries)', () => {
    expect(required).not.toContain('entityRef');
  });

  it('entityRef has a description mentioning the portable entity identifier', () => {
    expect(properties?.entityRef?.description).toBeDefined();
    expect(properties?.entityRef?.description!.length).toBeGreaterThan(0);
  });
});

describe('Course completedAt field', () => {
  const courseLexicon = recordLexicons.find((l) => l.doc.id === 'id.sifa.profile.course');
  const properties = courseLexicon?.doc.defs.main.record?.properties;
  const required = courseLexicon?.doc.defs.main.record?.required ?? [];

  it('completedAt is a freeform date string (no datetime format, YYYY-MM documented)', () => {
    expect(properties?.completedAt).toBeDefined();
    expect(properties?.completedAt?.type).toBe('string');
    expect(properties?.completedAt?.format).toBeUndefined();
    expect(properties?.completedAt?.description).toMatch(/YYYY-MM/);
  });

  it('completedAt is not required (many courses have no recorded date)', () => {
    expect(required).not.toContain('completedAt');
  });

  it('completedAt has a description', () => {
    expect(properties?.completedAt?.description).toBeDefined();
    expect(properties?.completedAt?.description!.length).toBeGreaterThan(0);
  });
});

describe.each([
  ['id.sifa.profile.volunteering', ['startedAt', 'endedAt']],
  ['id.sifa.profile.certification', ['issuedAt', 'expiresAt']],
  ['id.sifa.profile.honor', ['awardedAt']],
  ['id.sifa.profile.publication', ['publishedAt']],
] as const)('%s freeform date fields', (lexiconId, fields) => {
  const lexicon = recordLexicons.find((l) => l.doc.id === lexiconId);
  const properties = lexicon?.doc.defs.main.record?.properties;

  it.each(fields)('%s is a freeform date string (no datetime format, YYYY-MM documented)', (f) => {
    expect(properties?.[f]).toBeDefined();
    expect(properties?.[f]?.type).toBe('string');
    expect(properties?.[f]?.format).toBeUndefined();
    expect(properties?.[f]?.description).toMatch(/YYYY-MM/);
  });

  it('createdAt still uses datetime format', () => {
    expect(properties?.createdAt?.format).toBe('datetime');
  });
});

describe('Publication subtitle field', () => {
  const publicationLexicon = recordLexicons.find((l) => l.doc.id === 'id.sifa.profile.publication');
  const properties = publicationLexicon?.doc.defs.main.record?.properties;
  const required = publicationLexicon?.doc.defs.main.record?.required ?? [];

  it('subtitle exists as an optional string', () => {
    expect(properties?.subtitle).toBeDefined();
    expect(properties?.subtitle?.type).toBe('string');
  });

  it('subtitle matches title length constraints (200/2000)', () => {
    expect(properties?.subtitle?.maxGraphemes).toBe(200);
    expect(properties?.subtitle?.maxLength).toBe(2000);
  });

  it('subtitle is not required (many publications have none)', () => {
    expect(required).not.toContain('subtitle');
  });

  it('subtitle has a description', () => {
    expect(properties?.subtitle?.description).toBeDefined();
    expect(properties?.subtitle?.description!.length).toBeGreaterThan(0);
  });
});

describe('id.sifa.profile.self presentation overrides', () => {
  const selfLexicon = recordLexicons.find((l) => l.doc.id === 'id.sifa.profile.self');
  const properties = selfLexicon?.doc.defs.main.record?.properties;
  const required = selfLexicon?.doc.defs.main.record?.required ?? [];

  it('lexicon exists', () => {
    expect(selfLexicon).toBeDefined();
  });

  it('description no longer claims fields are non-duplicative of app.bsky.actor.profile', () => {
    expect(selfLexicon?.doc.description).toBeDefined();
    expect(selfLexicon!.doc.description).not.toMatch(/does not duplicate/i);
  });

  describe('displayName', () => {
    it('exists as an optional string field', () => {
      expect(properties?.displayName).toBeDefined();
      expect(properties?.displayName?.type).toBe('string');
      expect(required).not.toContain('displayName');
    });

    it('matches app.bsky.actor.profile.displayName constraints (64/640)', () => {
      expect(properties?.displayName?.maxGraphemes).toBe(64);
      expect(properties?.displayName?.maxLength).toBe(640);
    });
  });

  describe('avatar', () => {
    it('exists as an optional blob field', () => {
      expect(properties?.avatar).toBeDefined();
      expect(properties?.avatar?.type).toBe('blob');
      expect(required).not.toContain('avatar');
    });

    it('matches app.bsky.actor.profile.avatar accept list (png, jpeg)', () => {
      expect(properties?.avatar?.accept).toEqual(['image/png', 'image/jpeg']);
    });

    it('matches app.bsky.actor.profile.avatar size limit (1MB)', () => {
      expect(properties?.avatar?.maxSize).toBe(1000000);
    });
  });

  describe('pronouns', () => {
    it('exists as an optional string field', () => {
      expect(properties?.pronouns).toBeDefined();
      expect(properties?.pronouns?.type).toBe('string');
      expect(required).not.toContain('pronouns');
    });

    it('matches app.bsky.actor.profile.pronouns constraints (20/200)', () => {
      expect(properties?.pronouns?.maxGraphemes).toBe(20);
      expect(properties?.pronouns?.maxLength).toBe(200);
    });

    it('description identifies the field as a professional-context override', () => {
      expect(properties?.pronouns?.description).toMatch(/professional/i);
    });
  });

  describe('givenName', () => {
    it('exists as an optional string field', () => {
      expect(properties?.givenName).toBeDefined();
      expect(properties?.givenName?.type).toBe('string');
      expect(required).not.toContain('givenName');
    });

    it('has maxGraphemes 64 and maxLength 640', () => {
      expect(properties?.givenName?.maxGraphemes).toBe(64);
      expect(properties?.givenName?.maxLength).toBe(640);
    });

    it('description references Schema.org Person.givenName', () => {
      expect(properties?.givenName?.description ?? '').toContain('Schema.org');
      expect(properties?.givenName?.description ?? '').toContain('Person.givenName');
    });
  });

  describe('familyName', () => {
    it('exists as an optional string field', () => {
      expect(properties?.familyName).toBeDefined();
      expect(properties?.familyName?.type).toBe('string');
      expect(required).not.toContain('familyName');
    });

    it('has maxGraphemes 64 and maxLength 640', () => {
      expect(properties?.familyName?.maxGraphemes).toBe(64);
      expect(properties?.familyName?.maxLength).toBe(640);
    });

    it('description references Schema.org Person.familyName', () => {
      expect(properties?.familyName?.description ?? '').toContain('Schema.org');
      expect(properties?.familyName?.description ?? '').toContain('Person.familyName');
    });
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

describe('community location adoption', () => {
  const profilesWithLocation = ['self.json', 'position.json', 'education.json', 'location.json'];
  for (const file of profilesWithLocation) {
    it(`${file} references community.lexicon.location.address`, () => {
      const lex = JSON.parse(
        readFileSync(join(LEXICONS_DIR, 'profile', file), 'utf-8'),
      ) as LexiconDoc;
      const properties = lex.defs.main.record?.properties ?? {};
      const refs = collectRefs(properties);
      expect(refs).toContain('community.lexicon.location.address');
      expect(refs).not.toContain('id.sifa.defs#locationAddress');
    });
  }
});

describe('id.sifa.profile.presentation coverImage field', () => {
  const lexicon = recordLexicons.find((l) => l.doc.id === 'id.sifa.profile.presentation');
  const properties = lexicon?.doc.defs.main.record?.properties;
  const required = lexicon?.doc.defs.main.record?.required ?? [];

  it('lexicon exists', () => {
    expect(lexicon).toBeDefined();
  });

  it('coverImage exists as an optional blob field', () => {
    expect(properties?.coverImage).toBeDefined();
    expect(properties?.coverImage?.type).toBe('blob');
    expect(required).not.toContain('coverImage');
  });

  it('coverImage accepts png, jpeg, and webp', () => {
    expect(properties?.coverImage?.accept).toEqual(['image/png', 'image/jpeg', 'image/webp']);
  });

  it('coverImage caps at 2MB', () => {
    expect(properties?.coverImage?.maxSize).toBe(2000000);
  });

  it('coverImage has a description', () => {
    expect(properties?.coverImage?.description).toBeDefined();
    expect(properties?.coverImage?.description!.length).toBeGreaterThan(0);
  });
});

describe('id.sifa.profile.presentationDelivery address field', () => {
  const lexicon = recordLexicons.find((l) => l.doc.id === 'id.sifa.profile.presentationDelivery');
  const properties = lexicon?.doc.defs.main.record?.properties;
  const required = lexicon?.doc.defs.main.record?.required ?? [];

  it('lexicon exists', () => {
    expect(lexicon).toBeDefined();
  });

  it('address is an optional community.lexicon.location.address ref', () => {
    expect(properties?.address?.type).toBe('ref');
    expect(properties?.address?.ref).toBe('community.lexicon.location.address');
    expect(required).not.toContain('address');
  });

  it('retains the legacy free-text location string for dual-read', () => {
    expect(properties?.location?.type).toBe('string');
  });

  it('address has a description', () => {
    expect(properties?.address?.description).toBeDefined();
    expect(properties?.address?.description!.length).toBeGreaterThan(0);
  });
});

describe('id.sifa.profile.involvement lexicon', () => {
  const involvement = recordLexicons.find((l) => l.doc.id === 'id.sifa.profile.involvement');
  const properties = involvement?.doc.defs.main.record?.properties;
  const required = involvement?.doc.defs.main.record?.required ?? [];

  it('lexicon exists as a tid-keyed record', () => {
    expect(involvement).toBeDefined();
    expect(involvement!.doc.defs.main.type).toBe('record');
    expect(involvement!.doc.defs.main.key).toBe('tid');
  });

  it('requires only kind and createdAt', () => {
    expect(required).toEqual(['kind', 'createdAt']);
  });

  it('kind is a string with the five involvement NSID tokens', () => {
    expect(properties?.kind?.type).toBe('string');
    expect((properties?.kind as { knownValues?: string[] })?.knownValues).toEqual([
      'id.sifa.defs#involvementOpenSource',
      'id.sifa.defs#involvementCommunity',
      'id.sifa.defs#involvementCharity',
      'id.sifa.defs#involvementCivic',
      'id.sifa.defs#involvementOther',
    ]);
  });

  it('upstream is an optional string (a one-off contribution need not name an org)', () => {
    expect(properties?.upstream?.type).toBe('string');
    expect(required).not.toContain('upstream');
  });

  it('upstreamDid is an optional did-format string', () => {
    expect(properties?.upstreamDid?.type).toBe('string');
    expect(properties?.upstreamDid?.format).toBe('did');
    expect(required).not.toContain('upstreamDid');
  });

  it('upstreamUrl is an optional uri-format string', () => {
    expect(properties?.upstreamUrl?.type).toBe('string');
    expect(properties?.upstreamUrl?.format).toBe('uri');
  });

  it('startedAt and endedAt are freeform date strings (no datetime format, YYYY-MM documented)', () => {
    expect(properties?.startedAt?.type).toBe('string');
    expect(properties?.startedAt?.format).toBeUndefined();
    expect(properties?.startedAt?.description).toMatch(/YYYY-MM/);
    expect(properties?.endedAt?.format).toBeUndefined();
    expect(properties?.endedAt?.description).toMatch(/YYYY-MM/);
  });

  it('links is an optional array of id.sifa.defs#artifactLink with maxLength 50', () => {
    expect(properties?.links?.type).toBe('array');
    expect(properties?.links?.maxLength).toBe(50);
    expect(properties?.links?.items?.type).toBe('ref');
    expect(properties?.links?.items?.ref).toBe('id.sifa.defs#artifactLink');
    expect(required).not.toContain('links');
  });

  it('createdAt uses datetime format', () => {
    expect(properties?.createdAt?.format).toBe('datetime');
  });

  it('entityRef is an optional uri-format string (portable org link, #241 pattern)', () => {
    expect(properties?.entityRef?.type).toBe('string');
    expect(properties?.entityRef?.format).toBe('uri');
    expect(required).not.toContain('entityRef');
  });

  it('location is an optional community.lexicon.location.address ref', () => {
    expect(properties?.location?.type).toBe('ref');
    expect(properties?.location?.ref).toBe('community.lexicon.location.address');
    expect(required).not.toContain('location');
  });

  it('skills is an optional array of id.sifa.defs#skillRef with maxLength 50', () => {
    expect(properties?.skills?.type).toBe('array');
    expect(properties?.skills?.maxLength).toBe(50);
    expect(properties?.skills?.items?.ref).toBe('id.sifa.defs#skillRef');
    expect(required).not.toContain('skills');
  });
});

describe('id.sifa.defs involvement additions', () => {
  interface DefsDoc {
    defs: Record<
      string,
      {
        type: string;
        description?: string;
        knownValues?: string[];
        required?: string[];
        properties?: Record<
          string,
          { type: string; format?: string; knownValues?: string[]; maxGraphemes?: number }
        >;
      }
    >;
  }
  const defs = JSON.parse(readFileSync(join(LEXICONS_DIR, 'defs.json'), 'utf-8')) as DefsDoc;

  it('involvementKind is a string def with the five NSID tokens', () => {
    expect(defs.defs.involvementKind?.type).toBe('string');
    expect(defs.defs.involvementKind?.knownValues).toEqual([
      'id.sifa.defs#involvementOpenSource',
      'id.sifa.defs#involvementCommunity',
      'id.sifa.defs#involvementCharity',
      'id.sifa.defs#involvementCivic',
      'id.sifa.defs#involvementOther',
    ]);
  });

  it.each([
    'involvementOpenSource',
    'involvementCommunity',
    'involvementCharity',
    'involvementCivic',
    'involvementOther',
  ])('declares the %s token', (token) => {
    expect(defs.defs[token]?.type).toBe('token');
    expect(defs.defs[token]?.description?.length).toBeGreaterThan(0);
  });

  it('artifactLink is an object def requiring a uri-format url', () => {
    expect(defs.defs.artifactLink?.type).toBe('object');
    expect(defs.defs.artifactLink?.required).toEqual(['url']);
    expect(defs.defs.artifactLink?.properties?.url?.type).toBe('string');
    expect(defs.defs.artifactLink?.properties?.url?.format).toBe('uri');
  });

  it('artifactLink.kind is a bare-string enum and label is capped', () => {
    expect(defs.defs.artifactLink?.properties?.kind?.type).toBe('string');
    expect(defs.defs.artifactLink?.properties?.kind?.knownValues).toContain('pull-request');
    expect(defs.defs.artifactLink?.properties?.kind?.knownValues).toContain('release');
    expect(defs.defs.artifactLink?.properties?.label?.maxGraphemes).toBe(200);
  });
});

describe('id.sifa.getProfileView query lexicon', () => {
  interface XrpcDoc {
    defs: {
      main: {
        type: string;
        parameters?: { required?: string[]; properties?: Record<string, LexiconProperty> };
        output?: { encoding?: string; schema?: LexiconProperty };
        errors?: { name: string; description?: string }[];
      };
      profileView?: {
        type: string;
        required?: string[];
        properties?: Record<string, LexiconProperty>;
      };
    } & Record<string, { type: string }>;
  }
  const doc = JSON.parse(
    readFileSync(join(LEXICONS_DIR, 'getProfileView.json'), 'utf-8'),
  ) as XrpcDoc;

  it('main is a query with a required at-identifier actor param', () => {
    expect(doc.defs.main.type).toBe('query');
    expect(doc.defs.main.parameters?.required).toContain('actor');
    expect(doc.defs.main.parameters?.properties?.actor?.type).toBe('string');
    expect(doc.defs.main.parameters?.properties?.actor?.format).toBe('at-identifier');
  });

  it('outputs application/json referencing #profileView', () => {
    expect(doc.defs.main.output?.encoding).toBe('application/json');
    expect(doc.defs.main.output?.schema?.type).toBe('ref');
    expect(doc.defs.main.output?.schema?.ref).toBe('#profileView');
  });

  it('declares a ProfileNotFound error', () => {
    expect(doc.defs.main.errors?.map((e) => e.name)).toContain('ProfileNotFound');
  });

  it('profileView requires did and handle', () => {
    expect(doc.defs.profileView?.type).toBe('object');
    expect(doc.defs.profileView?.required).toEqual(expect.arrayContaining(['did', 'handle']));
    expect(doc.defs.profileView?.properties?.did?.format).toBe('did');
    expect(doc.defs.profileView?.properties?.handle?.format).toBe('handle');
  });

  it.each([
    ['positions', '#positionView'],
    ['education', '#educationView'],
    ['skills', '#skillView'],
    ['certifications', '#certificationView'],
    ['projects', '#projectView'],
    ['volunteering', '#volunteeringView'],
    ['involvement', '#involvementView'],
    ['publications', '#publicationView'],
    ['courses', '#courseView'],
    ['presentations', '#presentationView'],
    ['presentationDeliveries', '#presentationDeliveryView'],
    ['honors', '#honorView'],
    ['languages', '#languageView'],
    ['externalAccounts', '#externalAccountView'],
    ['locations', '#locationView'],
    ['activeApps', '#activeAppView'],
  ] as const)('profileView.%s is an array of %s', (field, ref) => {
    const prop = doc.defs.profileView?.properties?.[field];
    expect(prop?.type).toBe('array');
    expect(prop?.items?.type).toBe('ref');
    expect(prop?.items?.ref).toBe(ref);
  });

  it('every local def referenced by the view is defined in the document', () => {
    const defNames = new Set(Object.keys(doc.defs));
    const localRefs = new Set<string>();
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (key === 'ref' && typeof value === 'string' && value.startsWith('#')) {
          localRefs.add(value.slice(1));
        }
        walk(value);
      }
    };
    walk(doc.defs);
    for (const ref of localRefs) {
      expect(defNames, `local ref #${ref} must resolve to a def`).toContain(ref);
    }
  });
});

describe('openToWorkStatus commissions token', () => {
  interface DefsDoc {
    defs: {
      openToWorkStatus: { knownValues: string[] };
      commissions?: { type: string; description: string };
      contractRoles?: { type: string; description: string };
    };
  }
  interface SelfDoc {
    defs: {
      main: {
        record: {
          properties: {
            openTo: { items: { knownValues: string[] } };
          };
        };
      };
    };
  }
  const defs = JSON.parse(readFileSync(join(LEXICONS_DIR, 'defs.json'), 'utf-8')) as DefsDoc;
  const self = JSON.parse(
    readFileSync(join(LEXICONS_DIR, 'profile', 'self.json'), 'utf-8'),
  ) as SelfDoc;

  it('defs.json declares a commissions token', () => {
    expect(defs.defs.commissions).toBeDefined();
    expect(defs.defs.commissions?.type).toBe('token');
    expect(defs.defs.commissions?.description).toMatch(/commissioned creative work/i);
  });

  it('openToWorkStatus knownValues includes id.sifa.defs#commissions', () => {
    expect(defs.defs.openToWorkStatus.knownValues).toContain('id.sifa.defs#commissions');
  });

  it('profile/self.json openTo knownValues includes id.sifa.defs#commissions', () => {
    expect(self.defs.main.record.properties.openTo.items.knownValues).toContain(
      'id.sifa.defs#commissions',
    );
  });

  it('profile/self.json openTo knownValues stays in sync with defs.json openToWorkStatus', () => {
    expect([...self.defs.main.record.properties.openTo.items.knownValues].sort()).toEqual(
      [...defs.defs.openToWorkStatus.knownValues].sort(),
    );
  });

  it('contractRoles description distinguishes B2B contract from individual commissions', () => {
    expect(defs.defs.contractRoles?.description).toMatch(/B2B|consulting|project-based/i);
    expect(defs.defs.contractRoles?.description).not.toMatch(
      /^Open to contract or freelance work\.$/,
    );
  });
});
