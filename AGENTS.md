# Sifa Lexicons -- AT Protocol Professional Profile Schemas

<!-- Auto-generated from sifa-workspace. To propose changes, edit the source:
     https://github.com/singi-labs/sifa-workspace -->

MIT License | Part of [github.com/singi-labs](https://github.com/singi-labs)

AT Protocol lexicon schemas for Sifa -- a decentralized professional identity and career network. Defines the `id.sifa.*` namespace for professional profiles, endorsements, and social graph.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 25 / TypeScript (strict) |
| Schemas | AT Protocol Lexicon JSON |
| Code gen | @atproto/lex-cli |
| Validation | Zod (generated from lexicons) |
| Testing | Vitest |

## What This Repo Does

- Defines AT Protocol lexicon schemas for professional profiles (`id.sifa.profile.*`)
- Defines endorsement and social graph schemas (`id.sifa.endorsement`, `id.sifa.graph.follow`)
- Generates TypeScript types and Zod validators from lexicon JSON
- Published as `@singi-labs/sifa-lexicons` npm package for use by sifa-api and sifa-web

## Lexicon-Specific Standards

- Lexicon JSON files live in `lexicons/id/sifa/` following AT Protocol directory conventions
- All changes to lexicon JSON must regenerate TypeScript types (`npm run generate`)
- Backward compatibility: never remove or rename existing fields, only add new optional fields
- String length: use `maxGraphemes` for user-facing text, `maxLength` at 10:1 ratio
- Timestamps: ISO 8601, client-declared (not trusted for ordering)
- Record keys: `tid` for collections, `literal:self` for singletons
- References between records use `strongRef` pattern (uri + cid)

---

## Project-Wide Standards

### About Sifa

Decentralized professional identity and career network built on the [AT Protocol](https://atproto.com/). Portable profiles, verifiable track record from real community contributions, no vendor lock-in.

- **Organization:** [github.com/singi-labs](https://github.com/singi-labs)
- **License:** Source-available (sifa-api, sifa-web) / MIT (sifa-lexicons)

### Coding Standards

1. **Strict TypeScript** -- `strict: true`, no `any`, no `@ts-ignore`.
2. **Conventional commits** -- `type(scope): description`.
3. **CI must pass** -- lint, typecheck, tests on every PR.
4. **Pin exact versions** -- no `^` or `~` in package.json.
5. **Named exports** -- prefer named exports over default exports.

### Git Workflow

All changes go through Pull Requests -- never commit directly to `main`. Branch naming: `type/short-description` (e.g., `feat/add-project-lexicon`, `fix/validation-schema`).

### AT Protocol Context

- Lexicons are the schema contract for AT Protocol data
- All records stored in user's PDS (Personal Data Server) -- portable, user-owned
- `id.sifa.*` namespace resolves from the `sifa.id` domain
- Sifa also reuses `forum.barazo.*` (timeline posts) and `community.lexicon.*` (location/calendar)
- Validate lexicons with `@atproto/lex-cli` and `goat` for interop
