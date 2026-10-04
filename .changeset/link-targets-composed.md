---
'@forumone/throughline': minor
---

The `link-targets` publish step now checks links inside composed sections (forumone-2026#756). A composed section stores its content as JSON, one value per field its recipe declares, so before this change a landing page whose composed-section link went to a draft, trashed or deleted page published without a warning. With `publishing.recipes` configured, the step reads every recipe the document uses in one query. It then walks each block's content by the recipe's `contract.content.fields`: a `link` (`{ mode, reference: { relationTo, value } }`, with the same `mode` rule as a generated link), internal links in a `richtext` field, and both of those inside a `group` or `array`. The verdicts and messages are the same as for any other link. The issue's `field` is the content field's path (`layout[2].content`), and its `where` is the block (`Block 3 (Composed section)`). `composedRecipeIds` and the `composed` option of `linkTargetsIn` are exported from `/media`.

A new subpath, `@forumone/throughline/links`, exports `markLinkTarget`, `LINK_TARGET_KEY` and `linkTargetMarker`. It imports nothing at run time, so a link-field helper that a `'use client'` module also imports can mark its reference. `/publishing` still exports `markLinkTarget` and `LINK_TARGET_KEY`.

`/integrations` now exports `LAST_ERROR_SUMMARY`, `lastErrorText`, `lastErrorDetail` and `statusUpdateData`, so a site can test what an integration's `lastError` will say.
