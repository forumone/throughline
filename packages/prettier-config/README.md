# @forumone/throughline-prettier-config

Internal shared Prettier config. Not published.

## Usage

In a package's `package.json`:

```json
{
  "prettier": "@forumone/throughline-prettier-config"
}
```

The monorepo root applies these settings via `.prettierrc.json` → `{ "extends": "@forumone/throughline-prettier-config" }` pattern is not directly supported; instead the root `.prettierrc.json` mirrors these values. The package exists so client projects can share the same formatting.
