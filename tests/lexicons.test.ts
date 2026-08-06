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
  default?: boolean;
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
  'onBehalfOf',
  'title',
  'subtitle',
  'subCategory',
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

describe('Skill subCategory field', () => {
  const skillLexicon = recordLexicons.find((l) => l.doc.id === 'id.sifa.profile.skill');
  const properties = skillLexicon?.doc.defs.main.record?.properties;
  const required = skillLexicon?.doc.defs.main.record?.required ?? [];

  it('subCategory exists as an optional string', () => {
    expect(properties?.subCategory).toBeDefined();
    expect(properties?.subCategory?.type).toBe('string');
  });

  it('subCategory is freeform (no knownValues, unlike category)', () => {
    expect((properties?.subCategory as { knownValues?: string[] })?.knownValues).toBeUndefined();
  });

  it('subCategory matches the name field length constraints (64/640)', () => {
    expect(properties?.subCategory?.maxGraphemes).toBe(64);
    expect(properties?.subCategory?.maxLength).toBe(640);
  });

  it('subCategory is not required (skills need no grouping)', () => {
    expect(required).not.toContain('subCategory');
  });

  it('subCategory description mentions the user-defined grouping under category', () => {
    expect(properties?.subCategory?.description).toBeDefined();
    expect(properties?.subCategory?.description).toMatch(/category/i);
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

describe('id.sifa.org.profile lexicon', () => {
  const orgProfile = recordLexicons.find((l) => l.doc.id === 'id.sifa.org.profile');
  const properties = orgProfile?.doc.defs.main.record?.properties;
  const required = orgProfile?.doc.defs.main.record?.required ?? [];

  it('personalProfileVisible is an optional boolean defaulting to false', () => {
    expect(properties?.personalProfileVisible?.type).toBe('boolean');
    expect(properties?.personalProfileVisible?.default).toBe(false);
    expect(required).not.toContain('personalProfileVisible');
  });

  it('personalProfileVisible describes the sole-trader case it exists for', () => {
    const description = properties?.personalProfileVisible?.description ?? '';
    expect(description).toMatch(/sole trader/i);
    expect(description).toMatch(/personal profile/i);
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

describe('id.sifa.confirmation lexicon', () => {
  const confirmation = recordLexicons.find((l) => l.doc.id === 'id.sifa.confirmation');
  const properties = confirmation?.doc.defs.main.record?.properties;
  const required = confirmation?.doc.defs.main.record?.required ?? [];

  it('exists as a tid-keyed record', () => {
    expect(confirmation).toBeDefined();
    expect(confirmation!.doc.defs.main.type).toBe('record');
    expect(confirmation!.doc.defs.main.key).toBe('tid');
  });

  it('requires subject, relation, and createdAt', () => {
    expect(required).toEqual(['subject', 'relation', 'createdAt']);
  });

  // The subject strongRef deliberately carries no collection constraint: one
  // confirmation record type serves co-speaker credits, project membership,
  // and every people-link section we add later.
  it('subject is a com.atproto.repo.strongRef', () => {
    expect(properties?.subject?.type).toBe('ref');
    expect(properties?.subject?.ref).toBe('com.atproto.repo.strongRef');
  });

  it('subject description says the CID is an integrity hint, not a join key', () => {
    expect(properties?.subject?.description ?? '').toMatch(/AT-URI/);
    expect(properties?.subject?.description ?? '').toMatch(/integrity hint/i);
  });

  it('relation references id.sifa.defs#confirmationRelation', () => {
    expect(properties?.relation?.type).toBe('ref');
    expect(properties?.relation?.ref).toBe('id.sifa.defs#confirmationRelation');
  });

  it('createdAt uses datetime format', () => {
    expect(properties?.createdAt?.format).toBe('datetime');
  });

  // Without a snapshot, a claimer can rename "Volunteer bake sale" to anything
  // they like after you confirm and your record still vouches for it. Mirrors
  // skillName on id.sifa.endorsement, which exists for the same reason.
  it('subjectName snapshots what was confirmed', () => {
    expect(properties?.subjectName?.type).toBe('string');
    expect(properties?.subjectName?.maxGraphemes).toBe(300);
    expect(required).not.toContain('subjectName');
  });

  it('subjectName description explains the drift check it enables', () => {
    expect(properties?.subjectName?.description ?? '').toMatch(/renamed|changed|drift/i);
  });

  // Third-party implementers need to know the claim is readable from the
  // claimer's repo before anyone confirms it. That is inherent to atproto and
  // should not be a surprise.
  it('description warns that the claim is public before confirmation', () => {
    expect(confirmation!.doc.description ?? '').toMatch(/public/i);
    expect(confirmation!.doc.description ?? '').toMatch(/before/i);
  });
});

describe('id.sifa.defs confirmation additions', () => {
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

  it('confirmationRelation names every shipped relation', () => {
    expect(defs.defs.confirmationRelation?.type).toBe('string');
    expect(defs.defs.confirmationRelation?.knownValues).toEqual([
      'id.sifa.defs#coSpeaker',
      'id.sifa.defs#projectMember',
      'id.sifa.defs#author',
      'id.sifa.defs#collaborator',
    ]);
  });

  it.each(['coSpeaker', 'projectMember', 'author', 'collaborator'])(
    'declares the %s token',
    (token) => {
      expect(defs.defs[token]?.type).toBe('token');
      expect(defs.defs[token]?.description?.length).toBeGreaterThan(0);
    },
  );

  it('projectMemberRef requires only a did', () => {
    expect(defs.defs.projectMemberRef?.type).toBe('object');
    expect(defs.defs.projectMemberRef?.required).toEqual(['did']);
    expect(defs.defs.projectMemberRef?.properties?.did?.type).toBe('string');
    expect(defs.defs.projectMemberRef?.properties?.did?.format).toBe('did');
  });

  it('projectMemberRef.role reuses the projectRole known values', () => {
    expect(defs.defs.projectMemberRef?.properties?.role?.knownValues).toEqual(
      defs.defs.projectRole?.knownValues,
    );
  });

  it('projectMemberRef.title is capped free text', () => {
    expect(defs.defs.projectMemberRef?.properties?.title?.type).toBe('string');
    expect(defs.defs.projectMemberRef?.properties?.title?.maxGraphemes).toBe(128);
  });
});

describe('id.sifa.profile.involvement collaborators field', () => {
  const involvement = recordLexicons.find((l) => l.doc.id === 'id.sifa.profile.involvement');
  const properties = involvement?.doc.defs.main.record?.properties;
  const required = involvement?.doc.defs.main.record?.required ?? [];

  // Same shape as project members, because it is the same relation: people you
  // did this with. Reusing projectMemberRef rather than minting a parallel def
  // that differs only in name.
  it('collaborators is an optional array of id.sifa.defs#projectMemberRef', () => {
    expect(properties?.collaborators?.type).toBe('array');
    expect(properties?.collaborators?.items?.type).toBe('ref');
    expect(properties?.collaborators?.items?.ref).toBe('id.sifa.defs#projectMemberRef');
    expect(required).not.toContain('collaborators');
  });

  it('collaborators caps at 50', () => {
    expect(properties?.collaborators?.maxLength).toBe(50);
  });

  it('collaborators description points at id.sifa.confirmation', () => {
    expect(properties?.collaborators?.description ?? '').toContain('id.sifa.confirmation');
  });

  it('involvement declares sameAs, so a collaborator can keep their own entry', () => {
    expect(properties?.sameAs?.ref).toBe('id.sifa.defs#externalRecordRef');
    expect(required).not.toContain('sameAs');
  });
});

describe('id.sifa.profile.publication authors are confirmable', () => {
  const publication = recordLexicons.find((l) => l.doc.id === 'id.sifa.profile.publication');
  const properties = publication?.doc.defs.main.record?.properties;

  // The name is required and the DID optional on purpose: an ORCID import knows
  // who wrote a paper without knowing whether they are on atproto at all.
  it('an author needs a name and may carry a did', () => {
    const authorDef = publication?.doc.defs.author as
      | { required?: string[]; properties?: Record<string, { format?: string }> }
      | undefined;
    expect(authorDef?.required).toEqual(['name']);
    expect(authorDef?.properties?.did?.format).toBe('did');
  });

  it('publication declares sameAs', () => {
    expect(properties?.sameAs?.ref).toBe('id.sifa.defs#externalRecordRef');
  });
});

describe('id.sifa.profile.project members field', () => {
  const project = recordLexicons.find((l) => l.doc.id === 'id.sifa.profile.project');
  const properties = project?.doc.defs.main.record?.properties;
  const required = project?.doc.defs.main.record?.required ?? [];

  it('members is an optional array of id.sifa.defs#projectMemberRef', () => {
    expect(properties?.members?.type).toBe('array');
    expect(properties?.members?.items?.type).toBe('ref');
    expect(properties?.members?.items?.ref).toBe('id.sifa.defs#projectMemberRef');
    expect(required).not.toContain('members');
  });

  it('members caps at 50', () => {
    expect(properties?.members?.maxLength).toBe(50);
  });

  // A named person's own profile must never render a record from someone
  // else's repo: the author could rename it to anything at any time. They keep
  // their own entry and link it back with projectRef.
  it('members description rules out rendering this record on the named person profile', () => {
    expect(properties?.members?.description ?? '').toMatch(/own record|their own/i);
  });

  // projectRef is the hierarchical relation: this personal entry corresponds to
  // a canonical id.sifa.project.self. Peer sameness moved to sameAs, because
  // conflating the two left no name for it on presentationDelivery, where
  // presentationRef already means "instance of that talk".
  it('projectRef stays the hierarchical link to project.self', () => {
    expect(properties?.projectRef?.description ?? '').toContain('id.sifa.project.self');
    expect(properties?.projectRef?.description ?? '').not.toContain('another person');
  });

  // Naming someone is a claim, not a fact. The lexicon has to say so, because
  // an implementer reading only the schema would otherwise render the DID as
  // an established team member.
  it('members description points at id.sifa.confirmation for the consent half', () => {
    expect(properties?.members?.description ?? '').toContain('id.sifa.confirmation');
  });
});

describe('sameAs peer link', () => {
  // One field name across every record type that can name another person, for
  // the same reason id.sifa.confirmation is one record type: the relation is
  // identical, and a per-collection name would be four spellings of it.
  const withSameAs = ['id.sifa.profile.project', 'id.sifa.profile.presentationDelivery'] as const;

  it.each(withSameAs)('%s declares an optional sameAs', (nsid) => {
    const lexicon = recordLexicons.find((l) => l.doc.id === nsid);
    const properties = lexicon?.doc.defs.main.record?.properties;
    const required = lexicon?.doc.defs.main.record?.required ?? [];
    expect(properties?.sameAs?.type).toBe('ref');
    expect(properties?.sameAs?.ref).toBe('id.sifa.defs#externalRecordRef');
    expect(required).not.toContain('sameAs');
  });

  // externalRecordRef rather than strongRef: the CID is an integrity hint and
  // the reference must resolve live, because the other person edits their
  // record without that invalidating the link.
  it.each(withSameAs)('%s sameAs description says it is the same real thing', (nsid) => {
    const lexicon = recordLexicons.find((l) => l.doc.id === nsid);
    const description = lexicon?.doc.defs.main.record?.properties?.sameAs?.description ?? '';
    expect(description).toMatch(/same/i);
    expect(description).toMatch(/own/i);
  });

  // Composition, not sameness. A delivery is an instance of a talk; it is not
  // another copy of one.
  it('presentationDelivery keeps presentationRef for the parent talk', () => {
    const lexicon = recordLexicons.find((l) => l.doc.id === 'id.sifa.profile.presentationDelivery');
    const description =
      lexicon?.doc.defs.main.record?.properties?.presentationRef?.description ?? '';
    expect(description).toContain('id.sifa.profile.presentation');
    expect(description).not.toMatch(/same project|another person/i);
  });
});

describe('retired collaborative project lexicons', () => {
  it.each(['id.sifa.project.member', 'id.sifa.project.membership'])(
    '%s is marked deprecated in favour of id.sifa.confirmation',
    (nsid) => {
      const lexicon = recordLexicons.find((l) => l.doc.id === nsid);
      expect(lexicon).toBeDefined();
      expect(lexicon!.doc.description).toMatch(/DEPRECATED/);
      expect(lexicon!.doc.description).toContain('id.sifa.confirmation');
    },
  );
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

describe('openToWorkStatus speakingEngagements token', () => {
  interface DefsDoc {
    defs: {
      openToWorkStatus: { knownValues: string[] };
      speakingEngagements?: { type: string; description: string };
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

  it('defs.json declares a speakingEngagements token', () => {
    expect(defs.defs.speakingEngagements).toBeDefined();
    expect(defs.defs.speakingEngagements?.type).toBe('token');
    expect(defs.defs.speakingEngagements?.description).toMatch(/speak/i);
  });

  it('openToWorkStatus knownValues includes id.sifa.defs#speakingEngagements', () => {
    expect(defs.defs.openToWorkStatus.knownValues).toContain('id.sifa.defs#speakingEngagements');
  });

  it('profile/self.json openTo knownValues includes id.sifa.defs#speakingEngagements', () => {
    expect(self.defs.main.record.properties.openTo.items.knownValues).toContain(
      'id.sifa.defs#speakingEngagements',
    );
  });
});

describe('Board and advisory employment types', () => {
  interface DefsDoc {
    defs: Record<
      string,
      {
        type: string;
        description?: string;
        knownValues?: string[];
      }
    >;
  }
  const defs = JSON.parse(readFileSync(join(LEXICONS_DIR, 'defs.json'), 'utf-8')) as DefsDoc;
  const positionLexicon = recordLexicons.find((l) => l.doc.id === 'id.sifa.profile.position');
  const properties = positionLexicon?.doc.defs.main.record?.properties;
  const employmentType = properties?.employmentType as { knownValues?: string[] } | undefined;

  // The three roles are career-shaped -- a title, duties, a term -- so they belong on
  // position rather than on the investment record. See sifa-lexicons#86.
  it.each(['boardMember', 'boardObserver', 'advisor'])('declares the %s token', (token) => {
    expect(defs.defs[token]?.type).toBe('token');
    expect(defs.defs[token]?.description?.length).toBeGreaterThan(0);
  });

  it('defs.employmentType knownValues include the three new tokens', () => {
    expect(defs.defs.employmentType?.knownValues).toContain('id.sifa.defs#boardMember');
    expect(defs.defs.employmentType?.knownValues).toContain('id.sifa.defs#boardObserver');
    expect(defs.defs.employmentType?.knownValues).toContain('id.sifa.defs#advisor');
  });

  it('position.employmentType knownValues stay in sync with defs.json employmentType', () => {
    expect([...(employmentType?.knownValues ?? [])].sort()).toEqual(
      [...(defs.defs.employmentType?.knownValues ?? [])].sort(),
    );
  });

  // A non-executive director is not an employee, and neither is a volunteer -- the field
  // has never been payroll-only. Kept as-is rather than renamed: a breaking rename buys
  // nothing for users.
  it('boardObserver description distinguishes it from boardMember by the absence of a vote', () => {
    expect(defs.defs.boardObserver?.description).toMatch(/observ|no vote|non-voting/i);
    expect(defs.defs.boardObserver?.description).not.toBe(defs.defs.boardMember?.description);
  });

  it('the existing employment types are preserved', () => {
    for (const token of ['fullTime', 'partTime', 'contract', 'freelance', 'volunteer']) {
      expect(defs.defs.employmentType?.knownValues).toContain(`id.sifa.defs#${token}`);
    }
  });
});

describe('Position onBehalfOf field', () => {
  const positionLexicon = recordLexicons.find((l) => l.doc.id === 'id.sifa.profile.position');
  const properties = positionLexicon?.doc.defs.main.record?.properties;
  const required = positionLexicon?.doc.defs.main.record?.required ?? [];

  // A board seat held as a fund's representative is a disclosure, not a role type: the
  // person answers to a third party. Independent seats simply omit it.
  it('onBehalfOf exists as an optional string with a grapheme cap', () => {
    expect(properties?.onBehalfOf).toBeDefined();
    expect(properties?.onBehalfOf?.type).toBe('string');
    expect(properties?.onBehalfOf?.maxGraphemes).toBe(256);
    expect(required).not.toContain('onBehalfOf');
  });

  // The referent is usually an organization but can be a person (a family-office
  // principal), and a DID does not distinguish the two, so the field stays permissive.
  it('onBehalfOfDid is an optional did-format string', () => {
    expect(properties?.onBehalfOfDid?.type).toBe('string');
    expect(properties?.onBehalfOfDid?.format).toBe('did');
    expect(required).not.toContain('onBehalfOfDid');
  });

  it('onBehalfOfEntityRef is an optional uri-format string', () => {
    expect(properties?.onBehalfOfEntityRef?.type).toBe('string');
    expect(properties?.onBehalfOfEntityRef?.format).toBe('uri');
    expect(required).not.toContain('onBehalfOfEntityRef');
  });

  it('onBehalfOf description explains the representation disclosure', () => {
    expect(properties?.onBehalfOf?.description).toMatch(/behalf|represent/i);
  });

  it('position required fields are unchanged (backward compatible)', () => {
    expect(required).toEqual(['title', 'startedAt', 'createdAt']);
  });
});
