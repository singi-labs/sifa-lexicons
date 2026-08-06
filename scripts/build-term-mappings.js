/**
 * Generate `well-known/term-mappings.json` from the `x-skos:*` annotations in
 * the lexicon JSON.
 *
 * The lexicons are the source of truth: they are what gets published to the
 * authority PDS, so a third party resolving `id.sifa.*` already has the
 * annotations in hand. This file is the same information in one flat document
 * for consumers that would rather fetch one URL than walk 34 schemas.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const LEXICONS_DIR = join(ROOT, 'lexicons');
const OUT = join(ROOT, 'well-known', 'term-mappings.json');

export const VOCABULARIES = {
  schema: 'https://schema.org/',
  bibo: 'http://purl.org/ontology/bibo/',
  dcterms: 'http://purl.org/dc/terms/',
  foaf: 'http://xmlns.com/foaf/0.1/',
  org: 'http://www.w3.org/ns/org#',
  prism: 'http://prismstandard.org/namespaces/basic/2.1/',
  event: 'http://purl.org/NET/c4dm/event.owl#',
  skos: 'http://www.w3.org/2004/02/skos/core#',
};

export const MATCH_KEYS = [
  'x-skos:exactMatch',
  'x-skos:closeMatch',
  'x-skos:broadMatch',
  'x-skos:narrowMatch',
  'x-skos:relatedMatch',
];

/**
 * Records deliberately left unmapped, with the reason. Stated explicitly so a
 * consumer can tell "we have not got to it" apart from "no external term is
 * appropriate here". These carry no annotation in the lexicon itself, because
 * the absence is the point.
 */
export const UNMAPPED = [
  {
    lexicon: 'id.sifa.confirmation',
    reason:
      'A record affirming another record is reification. schema:Review and schema:ClaimReview both imply an evaluation that a confirmation does not make.',
  },
  {
    lexicon: 'id.sifa.endorsement',
    reason:
      'Same reification problem as confirmation. Any mapping that lets a consumer aggregate endorsements into a score works against a descriptive-only trust model.',
  },
  {
    lexicon: 'id.sifa.graph.connection',
    reason:
      'foaf:knows carries no consent semantics. A Sifa connection is bilateral and confirmed; flattening it would present an unconfirmed acquaintance claim as mutual.',
  },
  { lexicon: 'id.sifa.graph.follow', reason: 'See id.sifa.graph.connection.' },
  { lexicon: 'id.sifa.meeting', reason: 'Attestation semantics; same reification problem.' },
];

export function findJsonFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findJsonFiles(full));
    else if (entry.name.endsWith('.json')) out.push(full);
  }
  return out;
}

function matchOf(node) {
  for (const key of MATCH_KEYS) {
    if (Array.isArray(node?.[key])) return { match: key.slice('x-skos:'.length), terms: node[key] };
  }
  return null;
}

export function collectMappings() {
  const mappings = [];
  for (const file of findJsonFiles(LEXICONS_DIR).sort()) {
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    const nsid =
      doc.id ??
      relative(LEXICONS_DIR, file)
        .replace(/\.json$/, '')
        .split(sep)
        .join('.');
    const main = doc.defs?.main;
    if (!main) continue;

    const record = matchOf(main);
    if (record) mappings.push({ lexicon: nsid, ...record });

    const props = main.record?.properties ?? {};
    for (const field of Object.keys(props).sort()) {
      const found = matchOf(props[field]);
      if (found) mappings.push({ lexicon: nsid, field, ...found });
    }
  }
  return mappings;
}

export function buildDocument() {
  return {
    $schema: 'https://sifa.id/schemas/term-mappings/v1.json',
    version: '1.0.0',
    description:
      'Reconciliation between id.sifa.* lexicon terms and existing RDF vocabularies. RDF is used here as vocabulary only: Sifa records are Lexicon JSON on the AT Protocol, and nothing here changes how they are stored or transmitted. Match strengths use SKOS mapping relations.',
    vocabularies: VOCABULARIES,
    mappings: collectMappings(),
    unmapped: UNMAPPED,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const doc = buildDocument();
  mkdirSync(join(ROOT, 'well-known'), { recursive: true });
  writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n');
  console.log(`Wrote ${doc.mappings.length} mappings + ${doc.unmapped.length} unmapped to ${OUT}`);
}
