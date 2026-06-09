/**
 * Persist a rotated OAuth token set back to the publisher's GitHub Actions
 * secrets.
 *
 * Why this exists: atproto OAuth refresh tokens are single-use and rotate on
 * every refresh. The publish job restores the session from the
 * LEXICON_PUBLISHER_* secrets, the client refreshes (rotating the token), and
 * the new token lives only in memory. Without writing it back, the next run
 * replays the now-consumed token and the PDS rejects it with
 * `invalid_grant: Refresh token replayed`. See sifa-lexicons#58.
 */
import { execFile } from 'node:child_process';

type SavedTokenSet = { refresh_token?: string } | undefined;

/**
 * True when the OAuth client rotated the refresh token during this run, so the
 * new value must be written back to the GitHub Actions secret.
 */
export function refreshTokenChanged(
  previousRefreshToken: string | undefined,
  savedTokenSet: SavedTokenSet,
): boolean {
  const next = savedTokenSet?.refresh_token;
  return Boolean(next && next !== previousRefreshToken);
}

/** Set a GitHub Actions repo secret via the gh CLI (value passed on stdin, never argv). */
function ghSecretSet(name: string, value: string, repo: string, token: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'gh',
      ['secret', 'set', name, '--repo', repo],
      { env: { ...process.env, GH_TOKEN: token } },
      (err) => (err ? reject(err) : resolve()),
    );
    child.stdin?.end(value);
  });
}

/**
 * Persist a rotated OAuth token set back to the publisher's GitHub Actions
 * secrets. No-ops (with a clear warning) when no rotation is detected or when
 * the persistence PAT isn't configured -- so behaviour is never worse than
 * before, and self-heals once LEXICON_PUBLISHER_SECRETS_PAT is added.
 */
export async function persistRotatedTokenSet(
  savedTokenSet: SavedTokenSet,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (!savedTokenSet) {
    console.warn('No saved session after publish -- cannot check for token rotation.');
    return;
  }
  if (!refreshTokenChanged(env.LEXICON_PUBLISHER_REFRESH_TOKEN, savedTokenSet)) {
    console.log('Refresh token unchanged; no secret update needed.');
    return;
  }
  const token = env.LEXICON_PUBLISHER_SECRETS_PAT;
  const repo = env.GITHUB_REPOSITORY;
  if (!token || !repo) {
    console.warn(
      'Refresh token rotated but LEXICON_PUBLISHER_SECRETS_PAT / GITHUB_REPOSITORY are not set. ' +
        'The new token was not persisted, so the next run will fail with "Refresh token replayed". ' +
        'Add a fine-grained PAT (Secrets: read+write on sifa-lexicons) as LEXICON_PUBLISHER_SECRETS_PAT ' +
        'to enable self-healing, or re-bootstrap manually (npm run publish:bootstrap).',
    );
    return;
  }
  try {
    await ghSecretSet('LEXICON_PUBLISHER_TOKEN_SET', JSON.stringify(savedTokenSet), repo, token);
    if (savedTokenSet.refresh_token) {
      await ghSecretSet(
        'LEXICON_PUBLISHER_REFRESH_TOKEN',
        savedTokenSet.refresh_token,
        repo,
        token,
      );
    }
    console.log('Persisted rotated OAuth token set to GitHub Actions secrets (self-heal).');
  } catch (err) {
    // Don't fail the publish over a persistence error -- the records are already
    // published and the rotation already happened. Warn loudly instead.
    console.warn(
      'Failed to persist the rotated token to GitHub Actions secrets:',
      err,
      '\nThe next run will likely fail with "Refresh token replayed". ' +
        'Re-bootstrap manually (npm run publish:bootstrap) or fix the gh CLI error above.',
    );
  }
}
