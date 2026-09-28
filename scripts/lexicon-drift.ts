/**
 * Shared helpers for reading the repo's lexicon JSON and comparing it against
 * the `com.atproto.lexicon.schema` records published on the authority PDS.
 * Pure and side-effect free so both the publisher and the drift check can
 * import it (see scripts/check-lexicon-drift.ts).
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export const COLLECTION = 'com.atproto.lexicon.schema';

export type LexiconRecord = { id: string; [k: string]: unknown };

export type DriftReport = {
  /** In lexicons/ but not published. */
  missing: string[];
  /** Published, but the content differs from lexicons/. */
  changed: string[];
  /** Published, but no longer in lexicons/. */
  orphan: string[];
};

async function* walkLexicons(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkLexicons(path);
    } else if (entry.name.endsWith('.json')) {
      yield path;
    }
  }
}

function stableStringify(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableStringify);
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = stableStringify((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

export function recordsEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(stableStringify(a)) === JSON.stringify(stableStringify(b));
}

/** Drop the record-level `$type` a PDS may add, so it never reads as drift. */
function withoutRecordType(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const { $type, ...rest } = value as Record<string, unknown>;
    return $type === COLLECTION ? rest : value;
  }
  return value;
}

export async function loadLocalLexicons(dir: string): Promise<Map<string, LexiconRecord>> {
  const records = new Map<string, LexiconRecord>();
  for await (const path of walkLexicons(dir)) {
    const raw = await readFile(path, 'utf8');
    const record = JSON.parse(raw) as LexiconRecord;
    if (!record.id || typeof record.id !== 'string') {
      throw new Error(`Lexicon ${path} has no string "id" field`);
    }
    if (records.has(record.id)) {
      throw new Error(`Duplicate lexicon id ${record.id} (already seen elsewhere)`);
    }
    records.set(record.id, record);
  }
  return records;
}

export function diffLexicons(
  local: Map<string, LexiconRecord>,
  published: Map<string, unknown>,
): DriftReport {
  const missing: string[] = [];
  const changed: string[] = [];
  for (const [id, record] of local) {
    if (!published.has(id)) {
      missing.push(id);
    } else if (!recordsEqual(withoutRecordType(published.get(id)), record)) {
      changed.push(id);
    }
  }
  const orphan = [...published.keys()].filter((id) => !local.has(id));
  return { missing: missing.sort(), changed: changed.sort(), orphan: orphan.sort() };
}

export function driftExitCode(report: DriftReport): number {
  return report.missing.length + report.changed.length + report.orphan.length === 0 ? 0 : 1;
}

type DidDocument = {
  service?: { id: string; type?: string; serviceEndpoint: unknown }[];
};

export function resolvePdsEndpoint(doc: DidDocument): string {
  const pds = doc.service?.find((s) => s.id === '#atproto_pds' || s.id.endsWith('#atproto_pds'));
  if (!pds || typeof pds.serviceEndpoint !== 'string') {
    throw new Error('DID document has no #atproto_pds service endpoint');
  }
  return pds.serviceEndpoint;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

/** Read-only, unauthenticated: resolve the DID's PDS via PLC and list its schema records. */
export async function fetchPublishedLexicons(
  did: string,
  plcUrl = 'https://plc.directory',
): Promise<Map<string, unknown>> {
  const pds = resolvePdsEndpoint(await getJson<DidDocument>(`${plcUrl}/${did}`));
  const published = new Map<string, unknown>();
  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({ repo: did, collection: COLLECTION, limit: '100' });
    if (cursor) params.set('cursor', cursor);
    const page = await getJson<{
      records: { uri: string; value: unknown }[];
      cursor?: string;
    }>(`${pds}/xrpc/com.atproto.repo.listRecords?${params}`);
    for (const r of page.records) {
      published.set(r.uri.split('/').pop() as string, r.value);
    }
    cursor = page.records.length > 0 ? page.cursor : undefined;
  } while (cursor);
  return published;
}
