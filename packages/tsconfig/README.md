# @forumone/throughline-tsconfig

Internal shared TypeScript configs. Private: a workspace package, never published.

| File           | Purpose                                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `base.json`    | Strict TS baseline. All other configs extend this.                                                                               |
| `library.json` | Node library packages (`throughline`, `create-throughline`). `composite: true`; each consumer sets its own `rootDir` / `outDir`. |
| `nextjs.json`  | Next.js apps (the playground). `noEmit`, bundler resolution, `next` plugin.                                                      |
| `react.json`   | React library packages (`design-system`, the reference DS). Extends `library.json`, adds DOM libs and `react-jsx`.               |

Consume via `"extends": "@forumone/throughline-tsconfig/<name>.json"` in a package's `tsconfig.json`, with the package as a `workspace:*` devDependency. A scaffolded project does not use these: its `tsconfig.json` files are its own.
