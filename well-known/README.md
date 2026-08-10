# Published Sifa documents

Machine-readable documents Sifa publishes alongside the lexicons. Both are
served from `sifa.id`; this directory holds the copies generated from this
repo.

## `term-mappings.json`

Which `id.sifa.*` terms mean the same thing as terms already standardised in
BIBO, schema.org, DCMI Terms, FOAF and W3C ORG, with SKOS match strengths.

**This repo is the source.** The facts live as `x-skos:*` annotations on the
lexicon defs and properties, which are published to the authority PDS as part
of the lexicon records, so a resolver already reads them. This file is
generated from those annotations by `npm run build:term-mappings`, and a test
fails if it drifts from them.

Served at `https://sifa.id/.well-known/sifa-term-mappings.json`.

`@singi-labs/sifa-sdk` keeps a synced copy for its JSON-LD emitters, refreshed
by `pnpm sync:term-mappings` there and drift-checked nightly against this repo.

## `activity-tiers.json` — moved

Sifa's mapping of AT Protocol record types to display tiers: which records show
on a public profile, which are owner-only, and which Sifa does not render at
all.

**The source of truth is now
[`@singi-labs/sifa-sdk`](https://github.com/singi-labs/sifa-sdk), at
`src/taxonomy/activity-tiers.json`.** The copy that used to live here has been
removed rather than left to rot: it had fallen 60 entries behind, because every
substantive change to the taxonomy was made in the SDK and none here.

That is the right home. The taxonomy is _editorial, not protocol_: none of it
is published to a PDS, and it governs how Sifa renders a record rather than
what any record means. It belongs with the rendering code that acts on it,
which is also what `sifa-api`'s reconciliation test already checks against.

### How to consume it

Fetch the published document:

```ts
const res = await fetch('https://sifa.id/.well-known/sifa-activity-tiers.json');
const spec = await res.json();
const tier = spec.lexicons[nsid]?.tier ?? 'filtered';
```

Or, in TypeScript, use the typed helpers instead of fetching:

```ts
import { getActivityTier, ACTIVITY_TIERS } from '@singi-labs/sifa-sdk';

const tier = getActivityTier(nsid); // 'creation' | 'action' | 'filtered'
```

For an NSID the document does not list: if its parent app is registered in
`sifa-api`'s `atproto-app-registry.ts` and not excluded, treat it as
`creation`; otherwise treat it as `filtered`.

The records themselves stay public on the author's PDS whatever tier Sifa
assigns. This document does not gate data; it only records Sifa's own rendering
choices, so the profile page, the activity stream and third-party consumers
stay coherent as new atproto apps appear rather than each reinventing the same
editorial calls.

### Proposing changes

Open a pull request against `src/taxonomy/activity-tiers.json` in
[`singi-labs/sifa-sdk`](https://github.com/singi-labs/sifa-sdk), stating which
NSIDs are added or reclassified and linking evidence (lexicon definition, app
docs, registry entry).
