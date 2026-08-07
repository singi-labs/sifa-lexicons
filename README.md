<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/singi-labs/.github/main/assets/sifa-logo-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/singi-labs/.github/main/assets/sifa-logo-light.svg">
  <img alt="Sifa Logo" src="https://raw.githubusercontent.com/singi-labs/.github/main/assets/sifa-logo-dark.svg" width="120">
</picture>

# Sifa Lexicons

**AT Protocol lexicon schemas and TypeScript types for the `id.sifa.*` namespace.**

[![Status: Alpha](https://img.shields.io/badge/status-alpha-orange)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Validate](https://github.com/singi-labs/sifa-lexicons/actions/workflows/validate.yml/badge.svg)](https://github.com/singi-labs/sifa-lexicons/actions/workflows/validate.yml)
[![Node.js](https://img.shields.io/badge/node-25%20LTS-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-5.x-blue)](https://www.typescriptlang.org/)

</div>

---

## Overview

[Lexicons](https://atproto.com/specs/lexicon) are the schema language of the AT Protocol. They define how data is structured, validated, and exchanged across the decentralized network. Every record stored on a user's PDS (Personal Data Server) must conform to a lexicon schema.

This package defines the `id.sifa.*` namespace -- the data contract between a user's PDS and the Sifa AppView. Because the schemas live on the protocol layer, all professional profile data (positions, education, skills, endorsements) is portable: users own their data and can move between services without loss.

### Verified authority

Every schema in this repo is published as a `com.atproto.lexicon.schema` record on the namespace authority DID's PDS, with the DNS proof `_lexicon.sifa.id TXT did=did:plc:2f2ahswozqy4v5lvu676375y` in place. Third-party tools that resolve `id.sifa.*` lexicons at runtime get the canonical schema directly from the protocol -- no dependency on this repo being reachable.

[**Browse on lexicon.garden →**](https://lexicon.garden/identity/did:plc:2f2ahswozqy4v5lvu676375y)

---

## Lexicon Schemas

**Profile records**

| NSID                              | Purpose                                   |
| --------------------------------- | ----------------------------------------- |
| `id.sifa.profile.self`            | Professional profile singleton            |
| `id.sifa.profile.position`        | Work experience                           |
| `id.sifa.profile.education`       | Education                                 |
| `id.sifa.profile.skill`           | Skills                                    |
| `id.sifa.profile.certification`   | Certifications and licenses               |
| `id.sifa.profile.project`         | Projects                                  |
| `id.sifa.profile.volunteering`    | Volunteer experience                      |
| `id.sifa.profile.publication`     | Publications                              |
| `id.sifa.profile.course`          | Courses                                   |
| `id.sifa.profile.honor`           | Honors and awards                         |
| `id.sifa.profile.language`        | Language proficiency                      |
| `id.sifa.profile.location`        | Locations (residential, business, travel) |
| `id.sifa.profile.externalAccount` | Linked external accounts and websites     |

**Social graph**

| NSID                       | Purpose                                              |
| -------------------------- | ---------------------------------------------------- |
| `id.sifa.graph.follow`     | Professional follows                                 |
| `id.sifa.graph.connection` | **Deprecated, not implemented.** See the note below. |

> **`id.sifa.graph.connection` is deprecated and was never implemented.**
> It described an explicit two-record connection handshake: you create a record
> naming someone, they accept by creating their own naming you. Sifa instead
> derives a connection from two mutual `id.sifa.graph.follow` records, so
> nothing writes or reads this collection. The definition is retained so the
> NSID is not reused for something else; do not build against it.

> **`id.sifa.graph.follow` is a distinct graph, not a Bluesky superset.**
> Sifa's follow graph captures the intent "I want to see this person's professional
> content on Sifa." It is **not** a superset, mirror, or extension of
> `app.bsky.graph.follow`. A Bluesky-only client must not assume the two are
> interchangeable: following on Bluesky does not imply a Sifa follow, and vice
> versa. Each graph is owned by its own AppView contract. Users who want both
> relationships create both records.

**Collaborative projects**

| NSID                         | Purpose                                |
| ---------------------------- | -------------------------------------- |
| `id.sifa.project.self`       | Collaborative project record           |
| `id.sifa.project.member`     | Deprecated. Use `id.sifa.confirmation` |
| `id.sifa.project.membership` | Deprecated. Use `id.sifa.confirmation` |

Project members are named inline on `id.sifa.profile.project` and affirm the claim
with an `id.sifa.confirmation` record in their own repository.

**Social interactions**

| NSID                               | Purpose                                          |
| ---------------------------------- | ------------------------------------------------ |
| `id.sifa.endorsement`              | Skill endorsements                               |
| `id.sifa.endorsement.confirmation` | Endorsement confirmations                        |
| `id.sifa.confirmation`             | Affirmation that a record naming you is accurate |
| `id.sifa.meeting`                  | Face-to-face meeting attestation                 |

**OAuth permission sets**

| NSID                        | Purpose                                |
| --------------------------- | -------------------------------------- |
| `id.sifa.authProfile`       | Profile editing and follows            |
| `id.sifa.authProfileAccess` | Profile access (legacy permission set) |
| `id.sifa.authMeet`          | Meeting attestation                    |
| `id.sifa.authConnection`    | Connection management                  |
| `id.sifa.authProject`       | Project creation and team management   |

**Query methods**

| NSID                     | Purpose                                           |
| ------------------------ | ------------------------------------------------- |
| `id.sifa.getProfileView` | Aggregated public profile view served by AppViews |

**Shared types**

| NSID           | Purpose                 |
| -------------- | ----------------------- |
| `id.sifa.defs` | Shared tokens and types |

---

## Usage

### Validate schemas

```bash
npm install
npx lex validate ./lexicons
```

### Generate TypeScript types

```bash
npx lex gen-api ./lexicons --output ./src/types
```

### Use in your project

Copy the `lexicons/` directory into your AT Protocol project, or reference the schemas directly from this repository.

---

## External Dependencies

These lexicons reference types from:

- **`community.lexicon.*`** -- Location and calendar types ([lexicon-community](https://github.com/lexicon-community))
- **`com.atproto.*`** -- Core AT Protocol types (strongRef, selfLabels)

---

## Quick Start

**Prerequisites:** Node.js 26+, npm.

```bash
git clone https://github.com/singi-labs/sifa-lexicons.git
cd sifa-lexicons
npm install
```

---

## Development

```bash
npm test          # Run tests
npm run build     # Compile TypeScript
npm run lint      # Lint
```

See [CONTRIBUTING.md](https://github.com/singi-labs/.github/blob/main/CONTRIBUTING.md) for branching strategy, commit format, and code review process.

---

## Related Repositories

| Repository                                                     | Description                              |
| -------------------------------------------------------------- | ---------------------------------------- |
| sifa-api                                                       | AppView backend (Fastify, AT Protocol)   |
| sifa-web                                                       | Frontend (Next.js, React, TailwindCSS)   |
| sifa-deploy                                                    | Docker Compose + Caddy deployment config |
| [sifa-workspace](https://github.com/singi-labs/sifa-workspace) | Project coordination and issue tracking  |

---

## AT Protocol Lexicon Resources

| Resource                                                                  | Description                                                                         |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [lexicon.garden](https://lexicon.garden/)                                 | Discovery platform for AT Protocol lexicons -- browse, search, and explore schemas. |
| [lexicon-community/lexicon](https://github.com/lexicon-community/lexicon) | Shared community lexicons for cross-app interoperability.                           |
| [AT Protocol Lexicon Spec](https://atproto.com/specs/lexicon)             | Official specification for the Lexicon schema language.                             |

---

## Community

- **Website:** [sifa.id](https://sifa.id)
- **Bluesky:** [@sifa.id](https://bsky.app/profile/sifa.id)
- **Issues:** [Report bugs](https://github.com/singi-labs/sifa-lexicons/issues)

---

## License

**MIT**

See [LICENSE](LICENSE) for full terms.

---

Made with ♥ in 🇪🇺 by [Singi Labs](https://singi.dev)
