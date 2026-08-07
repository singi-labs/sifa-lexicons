import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  MATCH_KEYS,
  UNMAPPED,
  VOCABULARIES,
  buildDocument,
  collectMappings,
  findJsonFiles,
} from '../scripts/build-term-mappings.js';

const ROOT = join(import.meta.dirname, '..');
const LEXICONS_DIR = join(ROOT, 'lexicons');

const docs = findJsonFiles(LEXICONS_DIR).map((f) => ({
  file: f,
  doc: JSON.parse(readFileSync(f, 'utf8')),
}));

const PREFIXES = Object.keys(VOCABULARIES);

function isAnnotationKey(key: string) {
  return key.startsWith('x-skos:');
}

describe('term annotations are well formed', () => {
  it('every x-skos key is a known SKOS mapping relation or a note', () => {
    for (const { file, doc } of docs) {
      const walk = (node: unknown, path: string) => {
        if (!node || typeof node !== 'object') return;
        for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
          if (key === 'x-skos:note') {
            // Free-text rationale riding alongside a mapping, not a mapping
            // relation itself.
            expect(typeof value, `${file} ${path}.${key}`).toBe('string');
            expect((value as string).length, `${file} ${path}.${key} is empty`).toBeGreaterThan(0);
          } else if (isAnnotationKey(key)) {
            expect(MATCH_KEYS, `${file} ${path}.${key}`).toContain(key);
            expect(Array.isArray(value), `${file} ${path}.${key} must be an array`).toBe(true);
            expect((value as unknown[]).length, `${file} ${path}.${key} is empty`).toBeGreaterThan(
              0,
            );
          } else {
            walk(value, `${path}.${key}`);
          }
        }
      };
      walk(doc.defs, 'defs');
    }
  });

  it('every term uses a declared vocabulary prefix', () => {
    for (const mapping of collectMappings()) {
      for (const term of mapping.terms) {
        const prefix = term.split(':')[0];
        expect(PREFIXES, `${mapping.lexicon} ${mapping.field ?? '(record)'}: ${term}`).toContain(
          prefix,
        );
        expect(term.split(':')[1]?.length ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it('no annotation sits at document level', () => {
    // Document-level keys survive lex-cli codegen but are silently stripped by
    // `lexiconDoc.parse` in @atproto/lexicon, so an annotation there would be
    // present in some representations and absent in others with no error.
    // Def level and property level survive both.
    for (const { file, doc } of docs) {
      const stray = Object.keys(doc).filter(isAnnotationKey);
      expect(stray, `${file} has document-level annotations`).toEqual([]);
    }
  });
});

describe('generated well-known document', () => {
  const generated = buildDocument();
  const committed = JSON.parse(
    readFileSync(join(ROOT, 'well-known', 'term-mappings.json'), 'utf8'),
  );

  it('is in sync with the lexicons', () => {
    // Regenerate with `node scripts/build-term-mappings.js` when this fails.
    expect(committed).toEqual(generated);
  });

  it('records a mapping for the record types Sifa emits structured data for', () => {
    const covered = new Set(generated.mappings.map((m) => m.lexicon));
    for (const nsid of [
      'id.sifa.profile.self',
      'id.sifa.profile.position',
      'id.sifa.profile.education',
      'id.sifa.profile.publication',
      'id.sifa.profile.presentation',
      'id.sifa.profile.presentationDelivery',
      'id.sifa.profile.certification',
      'id.sifa.profile.course',
      'id.sifa.profile.project',
    ]) {
      expect(covered, nsid).toContain(nsid);
    }
  });

  it('never maps a connection to foaf:knows', () => {
    const terms = generated.mappings.flatMap((m) => m.terms);
    expect(terms).not.toContain('foaf:knows');
  });

  it('states a reason for every deliberately unmapped record', () => {
    for (const entry of UNMAPPED) {
      expect(entry.reason.length, entry.lexicon).toBeGreaterThan(0);
    }
  });

  it('never both maps and unmaps the same thing', () => {
    // Disjoint per lexicon+field, not per lexicon: a record can be mapped
    // while one of its fields deliberately is not (id.sifa.profile.self maps
    // to schema:Person, but `pronouns` has no external equivalent).
    const key = (m) => `${m.lexicon}#${m.field ?? ''}`;
    const mapped = new Set(generated.mappings.map(key));
    for (const entry of UNMAPPED) {
      expect(mapped, `${key(entry)} is both mapped and declared unmapped`).not.toContain(
        key(entry),
      );
    }
  });

  it('does not annotate a record it declares unmapped at record level', () => {
    const mappedLexicons = new Set(generated.mappings.map((m) => m.lexicon));
    for (const entry of UNMAPPED.filter((u) => !u.field)) {
      expect(mappedLexicons, `${entry.lexicon} is unmapped at record level`).not.toContain(
        entry.lexicon,
      );
    }
  });
});
