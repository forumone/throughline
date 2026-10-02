---
'@forumone/throughline-core': minor
---

Adds hardening for client uploads to Vercel Blob, moved from forumone-2026, at `@forumone/throughline-core/media`. Additive.

With `@payloadcms/storage-vercel-blob`'s `clientUploads: true`, the browser PUTs straight to Blob, so Payload's own `upload.mimeTypes` and `validateSvg` never run, and the token is minted with `allowOverwrite: true`, so the object key is the only access control. These are the checks that do run:

- **`uploadPrefixField()`, `uniqueUploadPrefix()`, `storageKey()`.** A random folder per upload, so a second upload of `hero.mp4` cannot replace the first's bytes, and the store cannot be enumerated by filename. Add the column with a migration that backfills `''`: an existing document must never get a prefix, or every file 404s.
- **`refuseMimeTypesOutside(list, message?)`** (`beforeChange`) refuses a type off the list.
- **`refuseStorageKeyMismatch()`** (`beforeChange`) refuses a client upload whose stored key and recorded key disagree, which would leave a link that 404s.
- **`sanitizeStoredSvg()`** (`afterChange`) re-reads an SVG and writes back the allowlist-sanitised version (`sanitizeSvg`) when anything was removed.
- **`recordStoredFacts({ mimeTypes })`** (`afterChange`) corrects `filesize` and `mimeType` to the stored object, not the in-memory conversion Payload measured.

`@vercel/blob` and `@payloadcms/plugin-cloud-storage` are new optional peers, needed only by this subpath.
