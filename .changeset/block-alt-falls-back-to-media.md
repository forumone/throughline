---
'@forumone/throughline-design-system-payload': minor
---

A block's alt text falls back to the media library's

An image's alt field in a block (`imageAlt` beside `image`, or `alt` beside `src` in an image group or row) used to be the only alt the component got, so authors typed a description the media record already had, or left it empty and the image rendered as decorative. Now an empty block alt is filled from the media document's `alt`. A block's own alt still wins when it is filled in.

Those alt fields are now generated as optional, with a note saying they fall back, and an optional image group no longer demands its alt once the image is chosen. Blocks are stored as JSON, so this changes no columns. The catch: an empty block alt no longer marks an image as decorative.
