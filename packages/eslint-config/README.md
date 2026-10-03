# @forumone/throughline-eslint-config

Internal shared ESLint flat config. Private: a workspace package, never published, so only packages in this repository can use it (as a `workspace:*` devDependency).

## Entries

| Export                                      | Use for                                                                                                                                               |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@forumone/throughline-eslint-config`       | Every package here: `throughline`, `design-system`, `create-throughline`, the reference DS and the playground.                                        |
| `@forumone/throughline-eslint-config/react` | Adds React and React Hooks rules for JSX/TSX. Nothing in the repository extends it today; the design system and the reference DS use the base config. |

## What it enforces

- `@typescript-eslint/no-unused-vars` — error (ignores `_`-prefixed args/vars)
- `@typescript-eslint/consistent-type-imports` — error (prefers `import type`, inline-type-imports on fix)
- `import-x/no-default-export` — warn, with overrides for Next.js routes/pages, Storybook stories, Payload config, and common config files
- `no-console` — warn
- typescript-eslint's `recommended` (non-type-checked — upgrade to `recommendedTypeChecked` per-package when tsconfig project services are wired in)

## Usage

```js
// packages/<name>/eslint.config.js
import base from '@forumone/throughline-eslint-config'
export default [...base]
```
