/**
 * Publish every lexicon JSON in `lexicons/**` as a `com.atproto.lexicon.schema`
 * record on the authority DID's PDS. Idempotent: existing records are updated,
 * missing records are created, no-op writes are skipped.
 *
 * Requires the OAuth env vars listed in scripts/oauth-session.ts.
 *
 * Usage:
 *   pnpm tsx scripts/publish-lexicons.ts            # publish + verify
 *   pnpm tsx scripts/publish-lexicons.ts --check    # listRecords-only verification
 */
import { Agent } from '@atproto/api';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { restoreOAuthSession } from './oauth-session.js';

const LEXICONS_DIR = new URL('../lexicons/', import.meta.url).pathname;
const COLLECTION = 'com.atproto.lexicon.schema';

type LexiconRecord = { id: string; [k: string]: unknown };

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

function recordsEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(stableStringify(a)) === JSON.stringify(stableStringify(b));
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

async function loadLocalLexicons(): Promise<Map<string, LexiconRecord>> {
  const records = new Map<string, LexiconRecord>();
  for await (const path of walkLexicons(LEXICONS_DIR)) {
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

async function listAllPublishedRkeys(agent: Agent, repo: string): Promise<Set<string>> {
  const rkeys = new Set<string>();
  let cursor: string | undefined;
  do {
    const res = await agent.com.atproto.repo.listRecords({
      repo,
      collection: COLLECTION,
      limit: 100,
      cursor,
    });
    for (const r of res.data.records) {
      const parts = r.uri.split('/');
      rkeys.add(parts[parts.length - 1]);
    }
    cursor = res.data.cursor;
  } while (cursor);
  return rkeys;
}

async function publish() {
  const check = process.argv.includes('--check');

  console.log('Restoring OAuth session...');
  const session = await restoreOAuthSession();
  const agent = new Agent(session);
  const repo = session.did;
  console.log('Authenticated as', repo);

  const local = await loadLocalLexicons();
  console.log(`Loaded ${local.size} local lexicons`);

  if (check) {
    const published = await listAllPublishedRkeys(agent, repo);
    const missing = [...local.keys()].filter((k) => !published.has(k));
    const orphan = [...published].filter((k) => !local.has(k));
    console.log(`Published on PDS: ${published.size}`);
    console.log(`Missing from PDS: ${missing.length}`, missing);
    console.log(`Orphan on PDS (in repo but not in lexicons/): ${orphan.length}`, orphan);
    process.exit(missing.length === 0 ? 0 : 2);
  }

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let failed = 0;

  for (const [rkey, record] of local) {
    try {
      const existing = await agent.com.atproto.repo
        .getRecord({ repo, collection: COLLECTION, rkey })
        .then((r) => r.data.value)
        .catch(() => null);

      if (existing && recordsEqual(existing, record)) {
        unchanged++;
        console.log(`SKIP ${rkey} (unchanged)`);
        continue;
      }

      await agent.com.atproto.repo.putRecord({
        repo,
        collection: COLLECTION,
        rkey,
        record,
      });
      if (existing) {
        updated++;
        console.log(`UPD  ${rkey}`);
      } else {
        created++;
        console.log(`NEW  ${rkey}`);
      }
    } catch (err) {
      failed++;
      console.error(`FAIL ${rkey}`, err);
    }
  }

  console.log(
    `\nSummary: ${created} created, ${updated} updated, ${unchanged} unchanged, ${failed} failed`,
  );

  if (failed > 0) {
    console.error('One or more putRecord calls failed.');
    process.exit(1);
  }

  // Verify
  const published = await listAllPublishedRkeys(agent, repo);
  const missing = [...local.keys()].filter((k) => !published.has(k));
  if (missing.length > 0) {
    console.error('Verification failed: still missing from PDS:', missing);
    process.exit(1);
  }
  console.log(`\nVerified: PDS has ${published.size} records covering all local NSIDs.`);

  // Spot-check the profile.self shape per issue #48 acceptance criteria
  const selfRes = await agent.com.atproto.repo.getRecord({
    repo,
    collection: COLLECTION,
    rkey: 'id.sifa.profile.self',
  });
  const selfProps = (
    selfRes.data.value as {
      defs?: { main?: { record?: { properties?: Record<string, unknown> } } };
    }
  )?.defs?.main?.record?.properties;
  const requiredKeys = ['industries', 'availableFromUtc', 'availableToUtc'];
  const missingKeys = requiredKeys.filter((k) => !selfProps || !(k in selfProps));
  if (missingKeys.length > 0) {
    console.error(
      'Verification failed: id.sifa.profile.self missing keys on PDS:',
      missingKeys,
    );
    process.exit(1);
  }
  console.log('Verified: id.sifa.profile.self contains', requiredKeys.join(', '));
}

publish().catch((err) => {
  console.error(err);
  process.exit(1);
});
