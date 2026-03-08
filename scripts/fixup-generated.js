/**
 * Post-generation fixup for lex-cli output.
 *
 * 1. Replaces the generated index.ts with clean type re-exports (only id.sifa.* types)
 * 2. Fixes missing .js import extensions for NodeNext compatibility
 * 3. Injects the authProfileAccess lexicon into schemaDict/ids
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const GENERATED_DIR = new URL('../src/generated', import.meta.url).pathname;
const TYPES_DIR = join(GENERATED_DIR, 'types');
const LEXICONS_DIR = new URL('../lexicons', import.meta.url).pathname;

const EXCLUDED_LEXICONS = [
  { file: 'id/sifa/authProfileAccess.json', dictKey: 'IdSifaAuthProfileAccess' },
];

async function getTypeFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.ts'))
    .map((e) => join(e.parentPath ?? e.path, e.name));
}

function toExportName(filePath) {
  const rel = relative(TYPES_DIR, filePath).replace(/\.ts$/, '');
  return rel
    .split('/')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('');
}

async function buildReplacementIndex(typeFiles) {
  // Only export id.sifa.* types (not com.atproto.* or community.lexicon.*)
  const sifaFiles = typeFiles.filter((f) => {
    const rel = relative(TYPES_DIR, f);
    return rel.startsWith('id/sifa/');
  });

  const exports = sifaFiles
    .map((file) => {
      const name = toExportName(file);
      const relPath = './' + relative(GENERATED_DIR, file).replace(/\.ts$/, '.js');
      return `export * as ${name} from "${relPath}";`;
    })
    .sort();

  return `/**
 * GENERATED CODE - Re-exports only.
 * Only id.sifa.* types are exported. External types (com.atproto.*, community.lexicon.*)
 * are included in generation for reference resolution but not re-exported.
 */
${exports.join('\n')}
export { schemas, validate } from "./lexicons.js";
`;
}

async function fixImportExtensions(filePath) {
  let content = await readFile(filePath, 'utf-8');
  const original = content;
  content = content.replace(/from '(\.\.?\/[^']+?)(?<!\.js)'/g, "from '$1.js'");
  if (content !== original) {
    await writeFile(filePath, content);
  }
}

async function injectExcludedLexicons(lexiconsFile) {
  let content = await readFile(lexiconsFile, 'utf-8');

  for (const { file, dictKey } of EXCLUDED_LEXICONS) {
    if (content.includes(`  ${dictKey}:`)) continue;

    const lexiconJson = JSON.parse(await readFile(join(LEXICONS_DIR, file), 'utf-8'));

    const schemaDictEntry = `  ${dictKey}: ${JSON.stringify(lexiconJson, null, 4).replace(/\n/g, '\n  ')},\n`;
    content = content.replace(
      '} as const satisfies Record<string, LexiconDoc>',
      `${schemaDictEntry}} as const satisfies Record<string, LexiconDoc>`,
    );

    const idsEntry = `  ${dictKey}: '${lexiconJson.id}',\n`;
    const idsMatch = content.match(/export const ids = \{[\s\S]*?\} as const/);
    if (idsMatch && !idsMatch[0].includes(dictKey)) {
      content = content.replace(/(\} as const)$/m, `${idsEntry}$1`);
    }

    console.log(`Injected excluded lexicon: ${dictKey} (${lexiconJson.id})`);
  }

  await writeFile(lexiconsFile, content);
}

async function main() {
  const typeFiles = await getTypeFiles(TYPES_DIR);
  const indexContent = await buildReplacementIndex(typeFiles);
  await writeFile(join(GENERATED_DIR, 'index.ts'), indexContent);

  for (const file of typeFiles) {
    await fixImportExtensions(file);
  }

  await fixImportExtensions(join(GENERATED_DIR, 'lexicons.ts'));
  await fixImportExtensions(join(GENERATED_DIR, 'util.ts'));

  await injectExcludedLexicons(join(GENERATED_DIR, 'lexicons.ts'));

  const sifaFiles = typeFiles.filter((f) => relative(TYPES_DIR, f).startsWith('id/sifa/'));
  console.log(
    `Fixed ${typeFiles.length + 2} generated files (${sifaFiles.length} sifa types exported, ${typeFiles.length - sifaFiles.length} external types included for resolution)`,
  );
}

main();
