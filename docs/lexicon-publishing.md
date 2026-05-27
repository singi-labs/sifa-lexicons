# Lexicon publishing runbook

Publishes every `lexicons/**/*.json` file in this repo as a
`com.atproto.lexicon.schema` record on the authority DID's PDS, so that
lexicon resolvers (lexicon.garden, third-party apps) can verify and read
the `id.sifa.*` namespace at runtime.

## Identity

|                 |                                                                                                                                                                                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authority DID   | `did:plc:2f2ahswozqy4v5lvu676375y`                                                                                                                                                                                                                       |
| PDS             | `https://eurosky.social`                                                                                                                                                                                                                                 |
| DNS proof       | `_lexicon.sifa.id TXT did=did:plc:2f2ahswozqy4v5lvu676375y` (already configured)                                                                                                                                                                         |
| Client metadata | `https://sifa.id/.well-known/sifa-lexicon-publisher/client-metadata.json` (served by sifa-api)                                                                                                                                                           |
| Auth            | OAuth 2.0 public native client (`token_endpoint_auth_method=none`), DPoP. atproto OAuth requires native clients to use `none` auth — confidential `private_key_jwt` is only available for `application_type=web` with HTTPS redirects. No app passwords. |

## One-time bootstrap (manual, done once per service identity)

Prerequisites:

1. The OAuth client metadata is served by sifa-api at
   `https://sifa.id/.well-known/sifa-lexicon-publisher/client-metadata.json`
   (see `sifa-api/src/routes/well-known.ts`).
2. You can sign into eurosky.social as the authority DID (handle + password).

Steps:

```bash
cd ~/Git/sifa-lexicons
pnpm install
pnpm publish:bootstrap did:plc:2f2ahswozqy4v5lvu676375y
```

The script:

1. Opens your browser at the eurosky.social authorize endpoint.
2. Captures the callback at `http://127.0.0.1:8765/callback`.
3. Exchanges the code for an access + refresh token bound to the DPoP key
   (generated internally by `@atproto/oauth-client-node`).
4. Writes `.oauth-bootstrap-result.json` (gitignored, mode 0600) containing:
   - `did`
   - `refreshToken`
   - `dpopJwk` (private DPoP JWK)
   - `tokenSet` (full token set including expiry)

Set these as GitHub Actions secrets on `singi-labs/sifa-lexicons`:

| Secret                            | Source field                  |
| --------------------------------- | ----------------------------- |
| `LEXICON_PUBLISHER_DID`           | `did`                         |
| `LEXICON_PUBLISHER_REFRESH_TOKEN` | `refreshToken`                |
| `LEXICON_PUBLISHER_DPOP_KEY_JWK`  | `dpopJwk` (full JSON object)  |
| `LEXICON_PUBLISHER_TOKEN_SET`     | `tokenSet` (full JSON object) |

Then delete `.oauth-bootstrap-result.json`.

## Phase 1 — one-shot catch-up (manual)

After bootstrap, with the env vars exported locally:

```bash
export LEXICON_PUBLISHER_DID=did:plc:2f2ahswozqy4v5lvu676375y
export LEXICON_PUBLISHER_REFRESH_TOKEN=...
export LEXICON_PUBLISHER_DPOP_KEY_JWK='{"kty":"EC",...}'
export LEXICON_PUBLISHER_TOKEN_SET='{"access_token":"...","refresh_token":"...","token_type":"DPoP","expires_at":...}'

pnpm publish:lexicons
```

Expected output for the catch-up run:

- 9 `NEW` lines for the missing NSIDs
- 1 `UPD` line for `id.sifa.profile.self`
- 17 `SKIP ... (unchanged)` lines for the already-published, in-sync schemas
- Verification: PDS has 27 records; `id.sifa.profile.self` contains
  `industries`, `availableFromUtc`, `availableToUtc`.

To check status without publishing:

```bash
pnpm publish:check
```

## Phase 2 — CI workflow

`.github/workflows/publish-lexicons.yml` runs the same `publish:lexicons`
script on every push to `main` that touches `lexicons/**/*.json`. The
workflow uses concurrency group `publish-lexicons` so concurrent merges
serialize. Secrets come from the repo's Actions secrets store.

## Rotating credentials

If the refresh token is revoked, lost, or expires from disuse:

1. Run `pnpm publish:bootstrap` again to obtain new credentials.
2. Replace the GitHub Actions secrets with the new values.
3. (Optional) Revoke the old refresh token via the PDS revocation endpoint.

Note: refresh tokens for public clients are shorter-lived than for
confidential clients. As long as CI publishes at least once per refresh
token lifetime, automatic rotation keeps the session alive. If lexicons
go untouched for a long stretch, you may need to re-bootstrap.

## Verification

After publishing, sanity check from any machine:

```bash
curl -s 'https://eurosky.social/xrpc/com.atproto.repo.listRecords?repo=did:plc:2f2ahswozqy4v5lvu676375y&collection=com.atproto.lexicon.schema&limit=100' \
  | python3 -c "import sys,json; r=json.load(sys.stdin); print(len(r['records'])); [print(rec['uri'].split('/')[-1]) for rec in r['records']]"
```

Should output `27` followed by the 27 NSIDs. lexicon.garden should show the
verified-authority badge on each `id.sifa.*` NSID page.
