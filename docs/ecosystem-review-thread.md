# Ecosystem review: `id.sifa.graph.follow`

Draft text for the public review thread. Paste into the atproto Discord (Guido
will post manually) and open a parallel issue on
[`lexicon-community/lexicon`](https://github.com/lexicon-community/lexicon)
proposing promotion to `community.lexicon.graph.follow`.

Do **not** post automatically from CI or from this repo. The point of the
review window is human judgement.

---

## Subject

Review request: `id.sifa.graph.follow` — a professional-context follow graph (and possible `community.lexicon.graph.follow` candidate)

## Body

Hi all,

Sifa (the AT Protocol professional-network AppView at [sifa.id](https://sifa.id))
is about to start emitting follow records to the firehose. Before we do, we want
ecosystem eyes on the lexicon and the semantics.

### The lexicon

NSID: `id.sifa.graph.follow`
Schema: <https://github.com/singi-labs/sifa-lexicons/blob/main/lexicons/id/sifa/graph/follow.json>
Resolvable at: `did:plc:2f2ahswozqy4v5lvu676375y` (verified via `_lexicon.sifa.id` TXT record)

```json
{
  "lexicon": 1,
  "id": "id.sifa.graph.follow",
  "description": "A one-way professional follow. Indicates the follower wants to see the subject's professional content on Sifa.",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["subject", "createdAt"],
        "properties": {
          "subject": { "type": "string", "format": "did" },
          "createdAt": { "type": "string", "format": "datetime" }
        }
      }
    }
  }
}
```

The shape is intentionally minimal and matches the conventions used by
`app.bsky.graph.follow`: a single `subject` DID, a `createdAt` datetime, TID key.

### Semantic distinction (important)

`id.sifa.graph.follow` is **a distinct graph, not a Bluesky superset.**

- It captures the intent "I want to see this person's _professional_ content on
  Sifa," not their general social posts.
- It is **not** a superset, mirror, or extension of `app.bsky.graph.follow`.
- A Bluesky-only client must not assume the two are interchangeable. Following
  someone on Bluesky does not imply a Sifa follow, and vice versa. Each graph
  belongs to its own AppView contract.
- Users who want both relationships create both records.

We chose a separate NSID (instead of reusing `app.bsky.graph.follow`) precisely
because the _audience_ and _consent_ model are different: Sifa surfaces
professional activity (jobs, projects, endorsements, certifications). A user
agreeing to follow someone professionally is a distinct act from agreeing to
follow them socially.

### What we're asking for

1. **Sanity-check the schema.** Is there anything obviously wrong, missing, or
   non-idiomatic? We deliberately omitted optional metadata (no `note`, no
   `visibility`, no labels) — keeping iter-1 minimal. Happy to defend or
   reconsider that choice.
2. **Naming feedback.** Does `id.sifa.graph.follow` read correctly to other
   AppView authors? Any collision concerns?
3. **Promotion candidate?** Would the lexicon-community find a generalized
   `community.lexicon.graph.follow` useful — i.e. a generic "context-scoped
   follow" type that any AppView could reuse? Sifa is willing to migrate if a
   consensus shape forms. Otherwise we stay in the `id.sifa.*` namespace.
4. **Firehose etiquette.** We plan to start emitting `id.sifa.graph.follow`
   records to the relays no sooner than **two weeks** after this thread opens.
   Flag any concerns about indexer load, NSID typo-squatting, or migration
   timing now rather than after.

### Out of scope for this round

- Connection records (`id.sifa.graph.connection`, mutual + bidirectional) —
  separate review later.
- Adding optional fields. If review feedback demands a shape change, that's a
  separate, explicit decision; we will not silently amend.
- Sifa AppView ingest behavior (lives in `sifa-api`, not in this lexicon repo).

Thanks for any time you can spend on this. Reply here, on the GitHub issue,
or open a PR against the schema if you spot something concrete.

— Guido (Singi Labs / Sifa)

---

## Tracking

- Source issue: <https://github.com/singi-labs/sifa-lexicons/issues/54>
- Epic: singi-labs/sifa-workspace#203
- Review window: minimum 2 weeks between thread open and `sifa-api` starting
  to emit follow records to the firehose.
