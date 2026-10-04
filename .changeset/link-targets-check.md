---
'@forumone/throughline': minor
'@forumone/throughline-design-system': minor
---

Publishing refuses a page whose internal links go to a draft, trashed or deleted document (forumone-2026#756). A new pipeline step, `link-targets`, runs after `required-fields` and looks up every link's target. A deleted target, a trashed one, or an unpublished one in a collection with drafts blocks the publish (`code: 'link-targets'`). Each issue names the block or field and the target's title, and its `field` is the link's own path, so the admin marks it. An unpublished target with a scheduled publish time is a warning, not a block.

**This is a new blocking step, and it's on by default.** After upgrading, a page that already links to a draft or trashed page can't be published until the link is fixed. `get_publish_status` and `check` report it like any other blocker. To switch it off, set `publishing: { linkTargets: { enabled: false } }`.

A link is either an internal link in Lexical rich text, or a relationship field marked with `custom: { throughlineLinkTarget: true }`. The design-system generator's `linkField` now marks its `reference`, so every generated link is covered without changes. To cover a hand-written link field, wrap it in `markLinkTarget` from `@forumone/throughline/publishing`. A marked reference whose sibling `mode` isn't `internal` is ignored, and `markLinkTarget(field, { when })` takes a different rule. The structural walk behind `referencesIn` is now `walkDocument`, exported from `/media` along with `linkTargetsIn`.
