import { describe, expect, it } from 'vitest';

import {
  diffLexicons,
  driftExitCode,
  loadLocalLexicons,
  resolvePdsEndpoint,
} from '../scripts/lexicon-drift.js';

const FIXTURE_DIR = new URL('./fixtures/drift/lexicons/', import.meta.url).pathname;

async function publishedFromFixture() {
  const local = await loadLocalLexicons(FIXTURE_DIR);
  // Simulate the PDS: same content, different key order, $type added.
  const published = new Map<string, unknown>();
  for (const [id, record] of local) {
    const reversed = Object.fromEntries(Object.entries(record).reverse());
    published.set(id, { $type: 'com.atproto.lexicon.schema', ...reversed });
  }
  return { local, published };
}

describe('loadLocalLexicons', () => {
  it('loads every lexicon JSON keyed by id', async () => {
    const local = await loadLocalLexicons(FIXTURE_DIR);
    expect([...local.keys()].sort()).toEqual(['id.example.a', 'id.example.b']);
  });
});

describe('diffLexicons', () => {
  it('reports no drift when the PDS matches the repo', async () => {
    const { local, published } = await publishedFromFixture();
    const report = diffLexicons(local, published);
    expect(report).toEqual({ missing: [], changed: [], orphan: [] });
    expect(driftExitCode(report)).toBe(0);
  });

  it('reports a changed schema as drift', async () => {
    const { local, published } = await publishedFromFixture();
    published.set('id.example.b', {
      lexicon: 1,
      id: 'id.example.b',
      defs: { main: { type: 'token', description: 'Stale description' } },
    });
    const report = diffLexicons(local, published);
    expect(report.changed).toEqual(['id.example.b']);
    expect(driftExitCode(report)).not.toBe(0);
  });

  it('reports a schema missing from the PDS as drift', async () => {
    const { local, published } = await publishedFromFixture();
    published.delete('id.example.a');
    const report = diffLexicons(local, published);
    expect(report.missing).toEqual(['id.example.a']);
    expect(driftExitCode(report)).not.toBe(0);
  });

  it('reports a record on the PDS with no repo file as drift', async () => {
    const { local, published } = await publishedFromFixture();
    published.set('id.example.gone', { lexicon: 1, id: 'id.example.gone', defs: {} });
    const report = diffLexicons(local, published);
    expect(report.orphan).toEqual(['id.example.gone']);
    expect(driftExitCode(report)).not.toBe(0);
  });
});

describe('resolvePdsEndpoint', () => {
  it('returns the atproto_pds service endpoint from a DID document', () => {
    const doc = {
      service: [
        {
          id: '#atproto_pds',
          type: 'AtprotoPersonalDataServer',
          serviceEndpoint: 'https://pds.example',
        },
      ],
    };
    expect(resolvePdsEndpoint(doc)).toBe('https://pds.example');
  });

  it('throws when the DID document has no PDS service', () => {
    expect(() => resolvePdsEndpoint({ service: [] })).toThrow(/atproto_pds/);
  });
});
