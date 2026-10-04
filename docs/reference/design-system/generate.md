# Generating Payload blocks: `/generate`, `/render`, `/client`, `/testing`

This was `@forumone/throughline-design-system-payload` in 0.x, a private package that was never published; [`docs/spec/1.0-exports.md`](../../spec/1.0-exports.md) maps its imports.

Turns a Throughline design-system manifest into Payload blocks, and those blocks back into React props.

It is published as part of `@forumone/throughline-design-system`, built to JavaScript.

## Entry points

| Subpath      | Runs in              | Exports                                                                                                                                                              |
| ------------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `./generate` | `payload.config.ts`  | `generateBlocks`, `generateBlock`, `toPayloadField`, `linkField`, `arrange`, label helpers, select-option resolution, and `fieldOverride` with the `Overrides` types |
| `./render`   | the render path      | `coerceBlock`, `RenderBlocks`                                                                                                                                        |
| `./client`   | Payload's import map | `BlockSummary`, `RowSummary`, `BlockGuidance`                                                                                                                        |
| `./testing`  | vitest, or a script  | `describeBlockInvariants`, `checkBlockProps` and the pure checks behind them                                                                                         |

The overrides are the hand-written part. They cover the few places where a contract's content model and the component's props disagree, and the generator and the renderer read the same object, so a field renamed there is renamed in both.

Every link the generator builds (`linkField`) is a group with a `mode`, a `reference` relationship to the site's `linkCollections`, and a `url`. The `reference` carries `custom: { throughlineLinkTarget: true }`. That marker is how Throughline's publish pipeline tells a link from any other relationship, and its `link-targets` step refuses a publish whose links go to a draft, trashed or deleted page. See [publishing](../throughline/publishing.md#links-to-pages-readers-cant-see).

## Testing a site's blocks

A site's blocks can be wrong in ways no typecheck sees, and the first site on this package found each of these in production.

### `describeBlockInvariants(blocks, options?)`

Registers a vitest suite. `vitest` is an optional peer.

```ts
// apps/web/src/blocks/blocks.test.ts
import { describeBlockInvariants } from '@forumone/throughline-design-system/testing'
import { designSystemBlocks, manifest } from './index'

describeBlockInvariants(designSystemBlocks, { manifest, minBlocks: 40 })
```

`blocks` is either the `GeneratedBlock[]` that `generateBlocks` returns, which carry their contracts, or plain Payload `Block[]` with `options.manifest` to look the contracts up by slug.

- **Untouched blocks validate.** For every block, it builds the data Payload stores for a newly added block: checkbox and radio defaults, and `[]` for an array. Then it calls every field's own `validate` on that data, and again with one empty row in every array. A rule that refuses a block nobody has typed into fails, and so does one that calls `req.payload` for an empty value. Payload's built-in `required` check is not called: a required field in an untouched block is supposed to ask the author for a value.
- **Contract defaults survive.** Every generated checkbox must start at its contract's `defaultValue`, or `false` when the contract has none. A checkbox is never `undefined`, so a React default like `hasFacade = true` never applies, and the contract's `defaultValue` is the only default a reader gets. A generated text field must have no string default, because that is copy nobody typed, saved into every block an author adds.
- **The library is not empty.** Set `minBlocks` close to the library's real size, so a manifest that fails to load fails the suite.

`checkUntouchedBlocks(blocks)` and `defaultMismatches(block, contractFields)` return the same findings as lists.

### `check-block-props`

Checks that each contract describes the props its component takes.

```bash
check-block-props design-system/dist/manifest.json design-system/src/components \
  --overrides apps/web/src/blocks/overrides.ts
```

For each component in the manifest, it builds the data Payload would store for the contract and runs it through the real `coerceBlock` with the site's overrides. It then compares the shape of each prop with the component's args file, `<Name>/<Name>Args.ts`, found case-insensitively, whose default export `satisfies <Name>Props`. TypeScript has already checked the args file against the component, so when the two shapes disagree it is the contract that is wrong.

- Give several component directories for a design system split across layers.
- `--overrides` names a module exporting `overrides`, named or as the default.
- It compares only props that both sides have. Coercion adds `srcSet` siblings, args files carry code-only props, and an optional field an args file never sets cannot be compared.
- A string and a rendered React node are treated as the same shape, because a `ReactNode` prop takes either.
- It exits 1 on a mismatch, and also when no component had an args file, because that run compared nothing. It exits 2 on bad arguments.

The bin registers `tsx` so it can load TypeScript args files and overrides. `checkBlockProps({ manifest, loadArgs, overrides })` is the same check as a function.
