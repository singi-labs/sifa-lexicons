/**
 * Generate TypeScript types from lexicon schemas.
 *
 * Includes external lexicons (com.atproto.*, community.lexicon.*) that our
 * schemas reference, so lex-cli can resolve all type references.
 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = new URL('..', import.meta.url).pathname
const LEXICONS_DIR = join(ROOT, 'lexicons')
const EXTERNAL_DIR = join(ROOT, 'external-lexicons')
const OUTPUT_DIR = join(ROOT, 'src', 'generated')

const EXCLUDED_FILES = ['authProfileAccess.json']

function findJsonFiles(dir) {
  const results = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...findJsonFiles(fullPath))
    } else if (entry.name.endsWith('.json') && !EXCLUDED_FILES.includes(entry.name)) {
      results.push(fullPath)
    }
  }
  return results
}

const ownFiles = findJsonFiles(LEXICONS_DIR)
const externalFiles = findJsonFiles(EXTERNAL_DIR)
const allFiles = [...ownFiles, ...externalFiles]

console.log(`Found ${ownFiles.length} own + ${externalFiles.length} external lexicon files`)

const cmd = `npx lex gen-server ${OUTPUT_DIR} ${allFiles.join(' ')} --yes`
execSync(cmd, { cwd: ROOT, stdio: 'inherit' })

console.log('Running fixup script...')
execSync('node scripts/fixup-generated.js', { cwd: ROOT, stdio: 'inherit' })
