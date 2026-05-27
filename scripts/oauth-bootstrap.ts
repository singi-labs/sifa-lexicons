/**
 * One-time interactive OAuth bootstrap for the lexicon publisher service identity.
 *
 * Generates an ES256 keypair, runs the browser-based OAuth authorization code flow
 * against the authority DID's PDS (PAR + PKCE + DPoP, handled by
 * @atproto/oauth-client-node), and prints the resulting refresh token + private
 * JWKs so they can be stored as GitHub Actions secrets.
 *
 * Usage:
 *   pnpm tsx scripts/oauth-bootstrap.ts <handle-or-did>
 *
 * Example:
 *   pnpm tsx scripts/oauth-bootstrap.ts did:plc:2f2ahswozqy4v5lvu676375y
 *
 * Prerequisites:
 *   - client-metadata.json (with the public JWK printed by this script) must be
 *     hosted at the client_id URL BEFORE the browser flow can succeed. This script
 *     prints the public JWK, waits for confirmation, then opens the browser.
 */
import { createServer } from 'node:http';
import { exec } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { JoseKey, NodeOAuthClient } from '@atproto/oauth-client-node';
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
    console.error('Usage: pnpm tsx scripts/oauth-bootstrap.ts <handle-or-did>');
    process.exit(1);
  }

  console.log('Generating ES256 signing key (kid=lexicon-publisher-1)...');
  const signingKey = await JoseKey.generate(['ES256'], 'lexicon-publisher-1');
  const privateJwk = signingKey.privateJwk;
  const publicJwk = signingKey.publicJwk;
  if (!privateJwk || !publicJwk) {
    throw new Error('Key generation failed to produce JWKs');
  }

  const clientMetadataPath = new URL('../client-metadata.json', import.meta.url);
  const clientMetadata = JSON.parse(await readFile(clientMetadataPath, 'utf8'));
  clientMetadata.jwks = { keys: [publicJwk] };

  console.log('\n=== ACTION REQUIRED ===');
  console.log(
    'Update the hosted client-metadata.json (sifa-web) so its "jwks.keys[0]" matches:',
  );
  console.log(JSON.stringify(publicJwk, null, 2));
  console.log(
    '\nThe metadata at',
    clientMetadata.client_id,
    'MUST be live with this exact key before continuing.',
  );
  console.log('Press Enter when the hosted metadata has been deployed...');
  await waitForEnter();

  const stateStore: NodeSavedStateStore = makeMemoryStore<NodeSavedState>();
  const sessionStore: NodeSavedSessionStore = makeMemoryStore<NodeSavedSession>();

  const client = new NodeOAuthClient({
    clientMetadata,
    keyset: [signingKey],
    stateStore,
    sessionStore,
  });

  const state = `bootstrap-${Date.now()}`;
  const authUrl = await client.authorize(subject, {
    scope: 'atproto transition:generic',
    state,
  });

  const codePromise = waitForCallback(state);
  console.log('\nOpen this URL in your browser to authorize:');
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
    signingKeyJwk: privateJwk,
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
  console.log('  LEXICON_PUBLISHER_DID              = ' + did);
  console.log('  LEXICON_PUBLISHER_REFRESH_TOKEN    = (out.refreshToken)');
  console.log('  LEXICON_PUBLISHER_SIGNING_KEY_JWK  = (out.signingKeyJwk, full JSON)');
  console.log('  LEXICON_PUBLISHER_DPOP_KEY_JWK     = (out.dpopJwk, full JSON)');
  console.log('\nAlso save these to a local .env for the first manual publish run.');
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

function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    const onData = () => {
      process.stdin.off('data', onData);
      process.stdin.pause();
      resolve();
    };
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
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
