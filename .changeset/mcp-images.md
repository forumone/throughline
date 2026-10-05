---
'@forumone/throughline': minor
---

An agent can fill an image slot it has no image for (forumone-2026#845).

- **Three new image values.** Wherever `save_draft`, `edit_blocks`, `create_draft`, `update_draft` or the block tools take an image, they also take `{ importUrl, alt }` (fetch a public image), `{ file: { base64, filename }, alt }` (upload a file the agent can read) or `{ placeholder: { alt, label } }` (a generated PLACEHOLDER image).
  - Each becomes a media document, created as the person, after every other check passes.
  - The result lists them under `imagesCreated`.
- **`uploadUrl` in `get`.** It's the media collection's create screen, so the person can upload the image there and hand back its address. It's made absolute like `previewUrl`.
- **`placeholderImages: { collection, field? }`** (content plugin, passed on by `throughline()`) flags placeholders with a checkbox. The publishing pipeline's new `placeholder-images` step refuses a page that still uses one, naming each place. The checkbox is a migration in the host.
- **Prompts.** The authoring prompts tell the agent to offer upload, link or placeholder instead of leaving an image slot empty.
