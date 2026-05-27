# Sifa activity-tiers spec

`activity-tiers.json` is Sifa's canonical mapping of AT Protocol record types
(NSIDs) to display tiers. It tells Sifa surfaces, third-party clients, and
sibling AppViews how Sifa categorises a given record when deciding whether to
show it on a public profile, on the owner-only "What is public about me" page,
or to hide it entirely from Sifa UI.

It is **editorial**, not protocol. The records themselves remain public on the
author's PDS regardless of which tier Sifa assigns. This file does not gate
data; it only governs Sifa's own rendering choices.

## The three tiers

| Tier | Label | Public profile? | What goes here |
|------|-------|-----------------|----------------|
| `creation` | "Made" | yes | Substantive authored records: posts, articles, repos, galleries, livestreams, CV entries, RSVPs, comments. |
| `action` | "Did" | no, owner-only | Engagement: likes, reposts, follows, votes, stars, reactions, short replies. Visible to the actor on `/me/activity`; not shown to others on Sifa. |
| `filtered` | (none) | no | Infrastructure, configuration, moderation (blocks/mutes/flags), ephemeral consumption signals (bookmarks, highlights), game state, OAuth scope records. Not shown anywhere in Sifa. |

Records in `action` and `filtered` still exist on the author's PDS and may be
displayed by other apps. Sifa simply opts out of rendering them on its own
surfaces.

## Schema

```json
{
  "$schema": "https://sifa.id/schemas/activity-tiers/v1.json",
  "version": "1.0.0",
  "updated": "YYYY-MM-DD",
  "tiers": {
    "<tier-id>": {
      "label": "<short label or null>",
      "description": "<one-sentence description>",
      "shownOnPublicProfile": true | false
    }
  },
  "lexicons": {
    "<nsid>": {
      "tier": "creation" | "action" | "filtered",
      "app": "<optional app id>",
      "notes": "<optional caveat>"
    }
  }
}
```

`app` values correspond to ids in `sifa-api`'s `atproto-app-registry.ts` plus
the sibling products: `sifa`, `barazo`. The field is informational; consumers
should switch on `tier`, not `app`.

## How to consume it

Sifa serves this file at `https://sifa.id/.well-known/activity-tiers.json`
(deployment path TBD — see "Deployment" below). Recommended consumers:

```ts
const res = await fetch('https://sifa.id/.well-known/activity-tiers.json');
const spec = await res.json();
const tier = spec.lexicons[nsid]?.tier ?? 'filtered';
```

Suggested defaults for NSIDs not listed in the file:
- If the NSID's parent app is registered in `sifa-api`'s registry and not in
  `EXCLUDED_COLLECTIONS`, treat it as `creation`.
- Otherwise treat it as `filtered`.

A typed helper in `@singi-labs/sifa-sdk` is a planned follow-up; until then,
consumers can copy the JSON or fetch it at build time.

## Proposing changes

Open a pull request against `well-known/activity-tiers.json` in
[`singi-labs/sifa-lexicons`](https://github.com/singi-labs/sifa-lexicons). PRs
should:

1. State which NSID(s) are being added/reclassified.
2. Link evidence (lexicon definition, app docs, registry entry).
3. Bump `version` per the versioning policy below.
4. Bump `updated`.

Reclassifying an existing NSID across tiers (e.g. `action` to `creation`) is a
breaking change for consumers and must go through a major bump.

## Versioning

The `version` field follows semver:

| Change | Bump |
|--------|------|
| Tier renamed, tier removed, NSID moved between tiers | major |
| New NSID added, new tier added | minor |
| Note/typo fix, `app` field change, `updated` field touch | patch |

The current version is `1.0.0`. The `$schema` URL is reserved for a future
JSON Schema description and may 404 until then.

## Limitations and honest caveats

- This is Sifa's editorial classification. Other AT Protocol AppViews are free
  to show, hide, or recombine the same records however they like.
- Records on the author's PDS are public regardless of tier. `filtered` does
  not mean private.
- A handful of NSIDs are inherently ambiguous (e.g. `app.bsky.feed.post`
  carries both throwaway social posts and serious long-form writing). The spec
  picks one tier per NSID; per-record nuance is the consumer layer's job.
- Coverage is bounded by what Sifa currently knows about. The file mirrors
  `sifa-api`'s `atproto-app-registry.ts` plus the sibling products' lexicons
  (`id.sifa.*`, `forum.barazo.*`). New AT Protocol apps appear all the time;
  this list will lag and should be updated as Sifa adds support for them.

## Deployment

The source of truth is this file in `sifa-lexicons`. Serving it at
`https://sifa.id/.well-known/activity-tiers.json` is a follow-up: `sifa-web`
does not yet expose anything from `/.well-known/`. A follow-up PR in
`sifa-web` will mirror this file (likely via `public/.well-known/` or a Next.js
route handler) so the URL above resolves.

Until then, consumers should treat the GitHub raw URL as the canonical source:

```
https://raw.githubusercontent.com/singi-labs/sifa-lexicons/main/well-known/activity-tiers.json
```

## Rationale

Sifa's "show your work" trust model means surfaces have to decide, per record
type, whether a given activity is the kind of thing that belongs on a
professional profile. Without a shared classification, every consumer (Sifa
profile page, Sifa timeline, owner-Stream, third-party AppViews) reinvents the
same decisions inconsistently. This spec centralises the editorial call so
those surfaces stay coherent as new ATproto apps appear.
