---
'@forumone/throughline-design-system': minor
---

Contract 1.1.0 adds `primitives` to the manifest: layout and content building blocks that a composed section can be made of, but that never become blocks on their own. A `PrimitiveContract` declares closed-set `props` (`token`, `enum` or `boolean`), `slots` for a layout primitive, and `content` for a content primitive. `lintManifest` checks that every token a primitive allows exists and belongs to the prop's token group. Manifests at 1.0.0 still load, as having no primitives. Before this, an unknown top-level key was stripped silently.
