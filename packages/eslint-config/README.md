# @forumone/throughline-eslint-config

Internal shared ESLint flat config. Not published.

## Entries

| Export                                      | Use for                                            |
| ------------------------------------------- | -------------------------------------------------- |
| `@forumone/throughline-eslint-config`       | Node/TS library packages (default).                |
| `@forumone/throughline-eslint-config/react` | Packages with JSX/TSX (reference DS, client apps). |

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
