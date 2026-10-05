---
'@forumone/throughline': minor
'@forumone/throughline-design-system': minor
---

A block with an empty required field no longer passes `check` or takes a page down (forumone-2026#840).

- **Publishing:** the composition step reports a `required-field` issue for each required field inside a block that is empty, for example "Block 3 (Featured Work) › Item 2 › Image is required before this can be published."
  - `check`, `get_publish_status` and the admin's publish all see it before the write.
  - Before this, only Payload's write enforced `required`, and `check` called such a page ready.
  - The rule walks the block's Payload config. So a field the site adds counts, such as a form block's `source.form`. A field the site omits or hides doesn't. A required link counts too, because the contract says so even though a generated link enforces it with a validate.
- **Render:** `RenderBlocks` no longer renders a component whose required image didn't arrive, whether the slot is empty in a draft or the image no longer resolves.
  - The component would read `item.image.src` from nothing and throw, and one card took Live Preview down to the error page.
  - The new `onIncompleteBlock` decides what renders instead. It defaults to nothing.
  - `missingRequiredImages` is exported for a host to ask the same question.
