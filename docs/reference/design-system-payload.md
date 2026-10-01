# @forumone/throughline-design-system-payload

Turns a design-system manifest into Payload blocks (`./generate`), turns stored blocks back into component props (`./render`), and supplies test helpers that check the result (`./testing`).

## Install

This package is **private**. It ships TypeScript source and is consumed as a workspace package, for example through a site's Throughline submodule. It is not on npm, so a project made by `create-throughline` cannot install it yet. The scaffold does not generate blocks.

Peers: `payload@^3`, `@payloadcms/ui@^3` and `react@^18 || ^19`. `vitest@^3 || ^4` is an optional peer, needed only for `./testing`.

## Subpath exports

| Subpath      | Main exports                                                                                                                                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.`          | `fieldOverride`, `Overrides`, `ComponentOverride`, `FieldOverride`                                                                                                                                         |
| `./generate` | `generateBlocks(options)`, `generateBlock`, `isBlockCandidate`, `toPayloadField`, `linkField`, `arrange`, `collectSelectOptions`, `SelectOptionResolver`, `GeneratedBlock`, `ManifestLike`, `ContentField` |
| `./render`   | `coerceBlock(component, fields, data, ctx)`, `RenderBlocks`, `CoerceContext`                                                                                                                               |
| `./client`   | `BlockSummary`, `RowSummary`, `BlockGuidance` (referenced from Payload's import map)                                                                                                                       |
| `./testing`  | `describeBlockInvariants`, `checkUntouchedBlocks`, `defaultMismatches`, `checkBlockProps`, `argsFileLoader`, `formatBlockPropsResult`                                                                      |

## Testing (`./testing`)

### `describeBlockInvariants(blocks, options?)`

Registers a vitest suite. `blocks` is either `GeneratedBlock[]`, which carry their contracts, or `Block[]` with the contracts supplied as `options.manifest`.

| Option      | Default                            | Meaning                                                                           |
| ----------- | ---------------------------------- | --------------------------------------------------------------------------------- |
| `manifest`  | none                               | Used to look up each plain `Block`'s contract by slug                             |
| `minBlocks` | `1`                                | The fewest blocks allowed. Set it near the library's size so an empty list fails. |
| `title`     | `"design-system block invariants"` | The suite's name                                                                  |

It asserts:

1. **Untouched blocks validate.** Every field-level `validate` passes on the data Payload stores for a newly added block, first with no array rows and then with one empty row in each array. `req.payload` throws if a validate calls it.
2. **Contract defaults survive.** Every generated checkbox starts at the contract's `defaultValue`, or `false` when there is none. No generated text field has a string default.
3. **Every block's contract is known**, and the list holds at least `minBlocks` blocks.

`checkUntouchedBlocks(blocks): Promise<UntouchedFailure[]>` and `defaultMismatches(block, contractFields): DefaultMismatch[]` are the pure forms.

### `check-block-props` (bin)

```bash
check-block-props <manifest.json> <components-dir> [<components-dir>...] [--overrides <module>]
```

For each manifest component that has an args file (`<dir>/<Name>/<Name>Args.{ts,tsx,mts,js,mjs}`, matched case-insensitively, with props as the default export), it coerces the data Payload would store for the contract through `coerceBlock`, using the site's overrides and stubbed media, link and rich-text resolvers. It then compares the shape of each prop that appears on both sides.

| Exit code | Meaning                                                 |
| --------- | ------------------------------------------------------- |
| 0         | Every compared prop matches                             |
| 1         | At least one mismatch, or no component had an args file |
| 2         | The arguments were wrong                                |

`checkBlockProps({ manifest, loadArgs, overrides })` returns `{ checked, skipped, mismatches }`.

## Related

- [Authoring component contracts](../guides/authoring-component-contracts.md#defaults-that-reach-the-cms)
- [@forumone/throughline-design-contract](design-contract.md)
