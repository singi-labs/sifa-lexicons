/**
 * Restore a previously-bootstrapped OAuth session from environment variables.
 *
 * Required env vars:
 *   LEXICON_PUBLISHER_DID            The authority DID this session belongs to.
 *   LEXICON_PUBLISHER_REFRESH_TOKEN  Refresh token from oauth-bootstrap.
 *   LEXICON_PUBLISHER_DPOP_KEY_JWK   Private DPoP JWK (JSON string).
 *   LEXICON_PUBLISHER_TOKEN_SET      Full TokenSet JSON from oauth-bootstrap.
 */
import { readFile } from 'node:fs/promises';
import { NodeOAuthClient } from '@atproto/oauth-client-node';
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

export interface RestoredSession {
  session: OAuthSession;
  did: string;
  /**
   * Reads the current saved session from the in-memory store. The OAuth client
   * writes the rotated token set here whenever it refreshes, so calling this
   * AFTER the publish work captures the new (single-use) refresh token that
   * must be persisted for the next run.
   */
  readSavedSession: () => Promise<NodeSavedSession | undefined>;
}

export async function restoreOAuthSession(): Promise<RestoredSession> {
  const did = requireEnv('LEXICON_PUBLISHER_DID');
  const dpopJwk = JSON.parse(requireEnv('LEXICON_PUBLISHER_DPOP_KEY_JWK'));
  const tokenSet = JSON.parse(requireEnv('LEXICON_PUBLISHER_TOKEN_SET'));

  const clientMetadataPath = new URL('../client-metadata.json', import.meta.url);
  const clientMetadata = JSON.parse(await readFile(clientMetadataPath, 'utf8'));

  const stateStore: NodeSavedStateStore = makeMemoryStore<NodeSavedState>();
  const sessionStore: NodeSavedSessionStore = makeMemoryStore<NodeSavedSession>();

  const initial: NodeSavedSession = {
    dpopJwk,
    tokenSet,
    authMethod: { method: 'none' },
  } as NodeSavedSession;
  await sessionStore.set(did, initial);

  const client = new NodeOAuthClient({
    clientMetadata,
    stateStore,
    sessionStore,
  });

  const session = await client.restore(did, 'auto');
  return {
    session,
    did,
    readSavedSession: async () => sessionStore.get(did),
  };
}
