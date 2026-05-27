/**
 * One-time interactive OAuth bootstrap for the lexicon publisher service identity.
 *
 * Runs the browser-based OAuth authorization code flow (PAR + PKCE + DPoP,
 * handled by @atproto/oauth-client-node) against the authority DID's PDS as a
 * public native client (atproto OAuth requires native clients to use
 * token_endpoint_auth_method=none). Prints the resulting refresh token + DPoP
 * key so they can be stored as GitHub Actions secrets.
 *
 * Usage:
 *   pnpm publish:bootstrap <handle-or-did>
 *
 * Example:
 *   pnpm publish:bootstrap did:plc:2f2ahswozqy4v5lvu676375y
 */
import { createServer } from 'node:http';
import { exec } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { NodeOAuthClient } from '@atproto/oauth-client-node';
import type {
  NodeSavedSession,
  NodeSavedSessionStore,
  NodeSavedState,
  NodeSavedStateStore,
} from '@atproto/oauth-client-node';

const REDIRECT_PORT = 8765;
const REDIRECT_PATH = '/callback';

async function main() {
  const subject = process.argv[2];
  if (!subject) {
    console.error('Usage: pnpm publish:bootstrap <handle-or-did>');
    process.exit(1);
  }

  const clientMetadataPath = new URL('../client-metadata.json', import.meta.url);
  const clientMetadata = JSON.parse(await readFile(clientMetadataPath, 'utf8'));

  const stateStore: NodeSavedStateStore = makeMemoryStore<NodeSavedState>();
  const sessionStore: NodeSavedSessionStore = makeMemoryStore<NodeSavedSession>();

  const client = new NodeOAuthClient({
    clientMetadata,
    stateStore,
    sessionStore,
  });

  const state = `bootstrap-${Date.now()}`;
  const authUrl = await client.authorize(subject, {
    scope: 'atproto transition:generic',
    state,
  });

  const codePromise = waitForCallback(state);
  console.log('Open this URL in your browser to authorize:');
  console.log(authUrl.toString());
  openInBrowser(authUrl.toString());

  const params = await codePromise;
  console.log('\nReceived authorization code, exchanging for tokens...');

  const { session } = await client.callback(params);
  const did = session.did;

  const stored = await sessionStore.get(did);
  if (!stored) {
    throw new Error('Session was not persisted by the OAuth client');
  }
  const refreshToken = stored.tokenSet?.refresh_token;
  if (!refreshToken) {
    throw new Error('No refresh token returned by the PDS');
  }

  const out = {
    did,
    refreshToken,
    dpopJwk: stored.dpopJwk,
    tokenSet: stored.tokenSet,
    clientId: clientMetadata.client_id,
  };

  const outPath = new URL('../.oauth-bootstrap-result.json', import.meta.url);
  await writeFile(outPath, JSON.stringify(out, null, 2), { mode: 0o600 });

  console.log('\n=== BOOTSTRAP COMPLETE ===');
  console.log('Authorized as DID:', did);
  console.log('Wrote bootstrap result to:', outPath.pathname);
  console.log('\nNow set these as GitHub Actions secrets:');
  console.log('  LEXICON_PUBLISHER_DID            = ' + did);
  console.log('  LEXICON_PUBLISHER_REFRESH_TOKEN  = (out.refreshToken)');
  console.log('  LEXICON_PUBLISHER_DPOP_KEY_JWK   = (out.dpopJwk, full JSON)');
  console.log('  LEXICON_PUBLISHER_TOKEN_SET      = (out.tokenSet, full JSON)');
  console.log('\nAlso export them locally for the first manual publish run.');
  console.log('Delete .oauth-bootstrap-result.json after secrets are saved.');
  process.exit(0);
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

function waitForCallback(expectedState: string): Promise<URLSearchParams> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      if (!req.url) return;
      const url = new URL(req.url, `http://127.0.0.1:${REDIRECT_PORT}`);
      if (url.pathname !== REDIRECT_PATH) {
        res.writeHead(404).end();
        return;
      }
      const stateParam = url.searchParams.get('state');
      if (stateParam !== expectedState) {
        res.writeHead(400).end('State mismatch');
        server.close();
        reject(new Error('State mismatch'));
        return;
      }
      res
        .writeHead(200, { 'content-type': 'text/html' })
        .end('<h1>Authorization received</h1><p>You can close this tab.</p>');
      server.close();
      resolve(url.searchParams);
    });
    server.listen(REDIRECT_PORT, '127.0.0.1');
  });
}

function openInBrowser(url: string) {
  const cmd =
    process.platform === 'darwin'
      ? `open "${url}"`
      : process.platform === 'win32'
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
