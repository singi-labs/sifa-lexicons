/**
 * Generate TypeScript types from lexicon schemas.
 *
 * Includes external lexicons (com.atproto.*, community.lexicon.*) that our
 * schemas reference, so lex-cli can resolve all type references.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const LEXICONS_DIR = join(ROOT, 'lexicons');
const EXTERNAL_DIR = join(ROOT, 'external-lexicons');
const OUTPUT_DIR = join(ROOT, 'src', 'generated');

const EXCLUDED_FILES = [
  'authProfileAccess.json',
  'authProfile.json', // permission-set lexicon (not supported by lex-cli codegen)
  'authMeet.json', // permission-set lexicon (not supported by lex-cli codegen)
  'authConnection.json', // permission-set lexicon (not supported by lex-cli codegen)
  'authProject.json', // permission-set lexicon (not supported by lex-cli codegen)
];

function findJsonFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findJsonFiles(fullPath));
    } else if (entry.name.endsWith('.json') && !EXCLUDED_FILES.includes(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

const ownFiles = findJsonFiles(LEXICONS_DIR);
const externalFiles = findJsonFiles(EXTERNAL_DIR);
const allFiles = [...ownFiles, ...externalFiles];

console.log(`Found ${ownFiles.length} own + ${externalFiles.length} external lexicon files`);

/**
 * Strip `x-skos:*` term annotations before codegen.
 *
 * lex-cli copies unknown keys verbatim into the generated `lexicons.ts` schema
 * dictionary, which is typed against @atproto/lexicon's closed object types, so
 * leaving them in fails `tsc`. The annotations belong on the source lexicons,
 * which is what gets published to the authority PDS and what a lexicon resolver
 * reads. They are not needed to generate TypeScript types, and stripping them
 * leaves the generated output byte-identical to a run with no annotations.
 */
function stripAnnotations(node) {
  if (Array.isArray(node)) return node.map(stripAnnotations);
  if (node && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node)
        .filter(([key]) => !key.startsWith('x-skos:'))
        .map(([key, value]) => [key, stripAnnotations(value)]),
    );
  }
  return node;
}

const stageDir = join(tmpdir(), `sifa-lexicons-codegen-${process.pid}`);
rmSync(stageDir, { recursive: true, force: true });
const stagedFiles = allFiles.map((file) => {
  const staged = join(stageDir, relative(ROOT, file));
  mkdirSync(dirname(staged), { recursive: true });
  writeFileSync(staged, JSON.stringify(stripAnnotations(JSON.parse(readFileSync(file, 'utf8')))));
  return staged;
});

try {
  execFileSync('npx', ['lex', 'gen-server', OUTPUT_DIR, ...stagedFiles, '--yes'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
} finally {
  rmSync(stageDir, { recursive: true, force: true });
}

console.log('Running fixup script...');
execFileSync('node', ['scripts/fixup-generated.js'], { cwd: ROOT, stdio: 'inherit' });
