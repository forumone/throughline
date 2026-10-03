# @forumone/throughline-prettier-config

Internal shared Prettier config. Private: a workspace package, never published.

Nothing consumes it. The root `.prettierrc.json`, which every package in the repository formats by, repeats the same six settings rather than pointing at this package, so a change here changes nothing until you make it there too.

To use it from a package in this repository, add it as a `workspace:*` devDependency and name it in that package's `package.json`:

```json
{
  "prettier": "@forumone/throughline-prettier-config"
}
```
