/**
 * Compare the `com.atproto.lexicon.schema` records on the authority PDS with
 * `lexicons/**`. Read-only and unauthenticated. Exits 1 when they diverge, so
 * a silent no-op publish still turns the scheduled workflow red.
 *
 * Usage:
 *   npm run drift:check
 *   LEXICON_AUTHORITY_DID=did:plc:... npm run drift:check
 */
import {
  diffLexicons,
  driftExitCode,
  fetchPublishedLexicons,
  loadLocalLexicons,
} from './lexicon-drift.js';

// Matches the _lexicon.sifa.id TXT record (see README).
const DEFAULT_AUTHORITY_DID = 'did:plc:2f2ahswozqy4v5lvu676375y';
const LEXICONS_DIR = new URL('../lexicons/', import.meta.url).pathname;

async function main() {
  const did = process.env.LEXICON_AUTHORITY_DID || DEFAULT_AUTHORITY_DID;
  const local = await loadLocalLexicons(LEXICONS_DIR);
  const published = await fetchPublishedLexicons(did);
  const report = diffLexicons(local, published);

  console.log(`Authority: ${did}`);
  console.log(`Repo lexicons: ${local.size}, published records: ${published.size}`);
  console.log(`Missing from PDS: ${report.missing.length}`, report.missing);
  console.log(`Changed on PDS vs repo: ${report.changed.length}`, report.changed);
  console.log(`Orphan on PDS (not in lexicons/): ${report.orphan.length}`, report.orphan);

  const code = driftExitCode(report);
  console.log(code === 0 ? 'No drift.' : 'Drift detected.');
  process.exit(code);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
