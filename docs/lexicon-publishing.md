# Lexicon publishing runbook

Publishes every `lexicons/**/*.json` file in this repo as a
`com.atproto.lexicon.schema` record on the authority DID's PDS, so that
lexicon resolvers (lexicon.garden, third-party apps) can verify and read
the `id.sifa.*` namespace at runtime.

## Identity

| | |
|--|--|
| Authority DID | `did:plc:2f2ahswozqy4v5lvu676375y` |
| PDS | `https://eurosky.social` |
| DNS proof | `_lexicon.sifa.id TXT did=did:plc:2f2ahswozqy4v5lvu676375y` (already configured) |
| Client metadata | `https://sifa.id/.well-known/sifa-lexicon-publisher/client-metadata.json` (hosted by sifa-web) |
| Auth | OAuth 2.0 confidential client, `private_key_jwt`, ES256, DPoP. No app passwords. |

## One-time bootstrap (manual, done once per service identity)

Prerequisites:

1. The OAuth client metadata file must already be live at
   `https://sifa.id/.well-known/sifa-lexicon-publisher/client-metadata.json`.
   The hosted copy is shipped from the sifa-web repo (see
   `sifa-web/public/.well-known/sifa-lexicon-publisher/client-metadata.json`).
   On first run the public JWK inside it is a placeholder — you'll replace it
   with the real public JWK generated below.

2. You can sign into eurosky.social as the authority DID (handle + password).

Steps:

```bash
cd ~/Git/sifa-lexicons
pnpm install
pnpm publish:bootstrap did:plc:2f2ahswozqy4v5lvu676375y
```

The script:

1. Generates an ES256 keypair (kid `lexicon-publisher-1`).
2. Prints the public JWK. Update the sifa-web `client-metadata.json` so its
   `jwks.keys[0]` equals this public JWK, deploy, then press Enter.
3. Opens your browser at the eurosky.social authorize endpoint.
4. Captures the callback at `http://127.0.0.1:8765/callback`.
5. Exchanges the code for an access + refresh token bound to the DPoP key.
6. Writes `.oauth-bootstrap-result.json` (gitignored, mode 0600) containing:
   - `did`
   - `refreshToken`
   - `signingKeyJwk` (private ES256 JWK)
   - `dpopJwk` (private DPoP JWK)
   - `tokenSet` (full token set including expiry)

Set these as GitHub Actions secrets on `singi-labs/sifa-lexicons`:

| Secret | Source field |
|--------|--------------|
| `LEXICON_PUBLISHER_DID` | `did` |
| `LEXICON_PUBLISHER_REFRESH_TOKEN` | `refreshToken` |
| `LEXICON_PUBLISHER_SIGNING_KEY_JWK` | `signingKeyJwk` (full JSON object) |
| `LEXICON_PUBLISHER_DPOP_KEY_JWK` | `dpopJwk` (full JSON object) |
| `LEXICON_PUBLISHER_TOKEN_SET` | `tokenSet` (full JSON object) |

Then delete `.oauth-bootstrap-result.json`.

## Phase 1 — one-shot catch-up (manual)

After bootstrap, with the env vars exported locally:

```bash
export LEXICON_PUBLISHER_DID=did:plc:2f2ahswozqy4v5lvu676375y
export LEXICON_PUBLISHER_REFRESH_TOKEN=...
export LEXICON_PUBLISHER_SIGNING_KEY_JWK='{"kty":"EC",...}'
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

If the refresh token is revoked or the signing key is compromised:

1. Run `pnpm publish:bootstrap` again to mint new credentials.
2. Update the hosted `client-metadata.json` with the new public JWK.
3. Replace the GitHub Actions secrets with the new values.
4. (Optional) Revoke the old refresh token via the PDS revocation endpoint.

## Verification

After publishing, sanity check from any machine:

```bash
curl -s 'https://eurosky.social/xrpc/com.atproto.repo.listRecords?repo=did:plc:2f2ahswozqy4v5lvu676375y&collection=com.atproto.lexicon.schema&limit=100' \
  | python3 -c "import sys,json; r=json.load(sys.stdin); print(len(r['records'])); [print(rec['uri'].split('/')[-1]) for rec in r['records']]"
```

Should output `27` followed by the 27 NSIDs. lexicon.garden should show the
verified-authority badge on each `id.sifa.*` NSID page.
