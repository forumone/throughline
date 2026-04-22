# @forumone/throughline-tsconfig

Internal shared TypeScript configs. Not published.

| File           | Purpose                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| `base.json`    | Strict TS baseline. All other configs extend this.                                                   |
| `library.json` | Published Node library packages. `composite: true`; each consumer sets its own `rootDir` / `outDir`. |
| `nextjs.json`  | Next.js apps (docs, playground). `noEmit`, bundler resolution, `next` plugin.                        |
| `react.json`   | React library packages (reference DS). Extends `library.json`, adds DOM libs and `react-jsx`.        |

Consume via `"extends": "@forumone/throughline-tsconfig/<name>.json"` in a package's `tsconfig.json`.
