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

---

## Lexicon Schemas

| NSID                               | Purpose                        |
| ---------------------------------- | ------------------------------ |
| `id.sifa.defs`                     | Shared tokens and types        |
| `id.sifa.profile.self`             | Professional profile singleton |
| `id.sifa.profile.position`         | Work experience                |
| `id.sifa.profile.education`        | Education                      |
| `id.sifa.profile.skill`            | Skills                         |
| `id.sifa.profile.certification`    | Certifications and licenses    |
| `id.sifa.profile.project`          | Projects                       |
| `id.sifa.profile.volunteering`     | Volunteer experience           |
| `id.sifa.profile.publication`      | Publications                   |
| `id.sifa.profile.course`           | Courses                        |
| `id.sifa.profile.honor`            | Honors and awards              |
| `id.sifa.profile.language`         | Language proficiency           |
| `id.sifa.endorsement`              | Skill endorsements             |
| `id.sifa.endorsement.confirmation` | Endorsement confirmations      |
| `id.sifa.graph.follow`             | Professional follows           |
| `id.sifa.authProfileAccess`        | OAuth permission set           |

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

**Prerequisites:** Node.js 25+, npm.

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

| Repository                                                     | Description                              | License          |
| -------------------------------------------------------------- | ---------------------------------------- | ---------------- |
| [sifa-api](https://github.com/singi-labs/sifa-api)             | AppView backend (Fastify, AT Protocol)   | Source-available |
| [sifa-web](https://github.com/singi-labs/sifa-web)             | Frontend (Next.js, React, TailwindCSS)   | Source-available |
| [sifa-deploy](https://github.com/singi-labs/sifa-deploy)       | Docker Compose + Caddy deployment config | Source-available |
| [sifa-workspace](https://github.com/singi-labs/sifa-workspace) | Project coordination and issue tracking  | Source-available |

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
- **Discussions:** [GitHub Discussions](https://github.com/orgs/singi-labs/discussions)
- **Issues:** [Report bugs](https://github.com/singi-labs/sifa-lexicons/issues)

---

## License

**MIT**

See [LICENSE](LICENSE) for full terms.

---

Made with ♥ in 🇪🇺 by [Singi Labs](https://singi.dev)
