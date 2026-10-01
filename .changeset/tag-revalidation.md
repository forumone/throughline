---
'@forumone/throughline-workflows': minor
'@forumone/create-throughline': patch
---

Revalidation no longer guesses paths, and covers the changes a publish event never announces.

- **workflows (breaking)**: `createRevalidateOnPublishFunction` has no built-in URL
  builders. They mapped `pages` to `/<slug>`, `posts` to `/blog/<slug>` and any other
  collection to `/<slug>`, so a site whose routes differed revalidated the wrong path
  without a word. `urlBuilders` is now required; a collection with no entry has its
  tags dropped and no path revalidated, and the run logs a warning. To keep the old
  behaviour, pass the old builders:

  ```ts
  urlBuilders: {
    pages: (slug) => (slug === 'home' || slug === '' ? '/' : `/${slug}`),
    posts: (slug) => `/blog/${slug}`,
  }
  ```

  and then check them against your routes.
- **workflows**: `createTagRevalidationHooks` — collection `afterChange` and
  `afterDelete`, and global `afterChange`, hooks that call
  `revalidateTag(tag, { expire: 0 })`. Draft saves and autosave drop nothing (via
  publishing's `isDraftWrite`); an unpublish still does. A hook never throws: outside a
  Next request (seeds, migrations, the CLI) it logs at `debug`, and any other failure
  at `error` with the tag and the cause.
- **workflows**: `createCacheTags` builds every tag string, so the hooks, the publish
  workflow (new `cacheTags` option) and cached reads cannot name different tags.
  Defaults: the bare slug for a collection, `global_<slug>` for a global. Also on the
  dependency-free `@forumone/throughline-workflows/cache-tags` subpath for frontend code.
  `@forumone/throughline-publishing` is now a dependency of this package.
- **create-throughline**: the scaffold adds `apps/web/src/lib/cache-tags.ts`, attaches
  the tag hooks to `Pages`, and passes explicit `urlBuilders` and the shared
  `cacheTags` to the publish workflow.
