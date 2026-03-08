# sifa-lexicons

AT Protocol lexicon schemas for [Sifa](https://sifa.id) -- a decentralized professional identity and career network built on the AT Protocol. Sifa provides portable professional profiles, verifiable track records from real community contributions, and no vendor lock-in. Think LinkedIn, but your data lives in your PDS.

## Namespace

All lexicons use the `id.sifa.*` namespace, resolved from the `sifa.id` domain.

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

## External dependencies

These lexicons reference types from:

- **`community.lexicon.*`** -- Location and calendar types ([lexicon-community](https://github.com/lexicon-community))
- **`com.atproto.*`** -- Core AT Protocol types (strongRef, selfLabels)

## License

MIT -- see [LICENSE](LICENSE).

Part of [Singi Labs](https://singi.dev).
