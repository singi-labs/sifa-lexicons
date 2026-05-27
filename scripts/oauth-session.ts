/**
 * Restore a previously-bootstrapped OAuth session from environment variables.
 *
 * Required env vars:
 *   LEXICON_PUBLISHER_DID              The authority DID this session belongs to.
 *   LEXICON_PUBLISHER_REFRESH_TOKEN    Refresh token from oauth-bootstrap.
 *   LEXICON_PUBLISHER_SIGNING_KEY_JWK  Private ES256 JWK (JSON string).
 *   LEXICON_PUBLISHER_DPOP_KEY_JWK     Private DPoP JWK (JSON string).
 *   LEXICON_PUBLISHER_TOKEN_SET        Full TokenSet JSON from oauth-bootstrap.
 */
import { readFile } from 'node:fs/promises';
import { JoseKey, NodeOAuthClient } from '@atproto/oauth-client-node';
import type {
  NodeSavedSession,
  NodeSavedSessionStore,
  NodeSavedState,
  NodeSavedStateStore,
} from '@atproto/oauth-client-node';
import type { OAuthSession } from '@atproto/oauth-client';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function makeMemoryStore<V extends NonNullable<unknown> | null>() {
  const map = new Map<string, V>();
  return {
    async get(key: string): Promise<V | undefined> {
      return map.get(key);
    },
    async set(key: string, value: V): Promise<void> {
      map.set(key, value);
    },
    async del(key: string): Promise<void> {
      map.delete(key);
    },
  };
}

export async function restoreOAuthSession(): Promise<OAuthSession> {
  const did = requireEnv('LEXICON_PUBLISHER_DID');
  const signingKeyJwk = JSON.parse(requireEnv('LEXICON_PUBLISHER_SIGNING_KEY_JWK'));
  const dpopJwk = JSON.parse(requireEnv('LEXICON_PUBLISHER_DPOP_KEY_JWK'));
  const tokenSet = JSON.parse(requireEnv('LEXICON_PUBLISHER_TOKEN_SET'));

  const clientMetadataPath = new URL('../client-metadata.json', import.meta.url);
  const clientMetadata = JSON.parse(await readFile(clientMetadataPath, 'utf8'));
  // The hosted metadata holds the authoritative public JWK; for the client
  // constructor we need a non-empty jwks placeholder. The signing key in the
  // keyset is what's actually used to sign assertions.
  if (!clientMetadata.jwks) {
    clientMetadata.jwks = { keys: [] };
  }

  const signingKey = await JoseKey.fromJWK(signingKeyJwk);

  const stateStore: NodeSavedStateStore = makeMemoryStore<NodeSavedState>();
  const sessionStore: NodeSavedSessionStore = makeMemoryStore<NodeSavedSession>();

  const kid = signingKeyJwk.kid ?? 'lexicon-publisher-1';
  const initial: NodeSavedSession = {
    dpopJwk,
    tokenSet,
    authMethod: { method: 'private_key_jwt', kid },
  } as NodeSavedSession;
  await sessionStore.set(did, initial);

  const client = new NodeOAuthClient({
    clientMetadata,
    keyset: [signingKey],
    stateStore,
    sessionStore,
  });

  // `restore` triggers a refresh if the access token is expired/near-expiry.
  // 'auto' is the default; pass true to force-refresh on every restore.
  return await client.restore(did, 'auto');
}
