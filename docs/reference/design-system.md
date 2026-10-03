# `@forumone/throughline-design-system`

The design-system side of Throughline. A design system describes its components in a manifest; this package defines that manifest, lints it, and turns it into Payload blocks, rendering and admin components for a Throughline site.

> **1.0 is in progress.** This package is `@forumone/throughline-design-contract` and `@forumone/throughline-design-system-payload` together; [Upgrading from 0.x](../guides/upgrading.md) moves a 0.x site onto it. Pre-releases publish as `1.0.0-next.N` under the `next` dist-tag.

| Subpath     | Holds                                                                                                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/contract` | `ComponentContractSchema`, `ManifestSchema`, `loadManifest`: the contract every component declares and the manifest they make; see [the contract](design-system/contract.md)            |
| `/lint`     | `lintManifest`, `formatLintIssues`, `assertManifestClean`                                                                                                                               |
| `/generate` | `generateBlocks` and friends, manifest to Payload blocks, and `fieldOverride` for a site's exceptions; see [generating blocks](design-system/generate.md)                               |
| `/render`   | `RenderBlocks` and `coerceBlock`: stored blocks back to React                                                                                                                           |
| `/client`   | `BlockSummary`, `BlockGuidance`, `RowSummary`: admin components named in Payload's import map                                                                                           |
| `/testing`  | `describeBlockInvariants`, `checkUntouchedBlocks`, `checkBlockProps`: invariants a site runs over its blocks                                                                            |
| bin         | `check-block-props <manifest.json> <components-dir>…`: does each contract produce the props its component takes? See [`check-block-props`](design-system/generate.md#check-block-props) |

```bash
pnpm add @forumone/throughline-design-system@next
```

`/contract` and `/lint` have no peers, so a design system that only publishes a manifest needs nothing else. The rest expects `payload` and `react`, `/client` expects `@payloadcms/ui`, `/generate` reads component source with `typescript`, and `/testing` is a vitest suite.

## Related

- [Components](throughline/components.md) in `@forumone/throughline`: serves the manifest over MCP
- Concept: [Design system contracts](../concepts/design-system-contracts.md)
- Guide: [Authoring component contracts](../guides/authoring-component-contracts.md)
