# @forumone/throughline-smoke-test

End-to-end verification of the monorepo's build, test, lint, and publish pipeline.

**This package will be deleted** once the pipeline round-trip to npm has been verified (see C0.9 in `docs/spec/C0-monorepo-scaffold.md`). Do not depend on it.

```ts
import { hello } from '@forumone/throughline-smoke-test'
hello('world') // => 'Hello, world'
```
