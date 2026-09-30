---
'@forumone/create-throughline': patch
---

A scaffolded site depends on the current release of every Throughline package. The ranges were typed into the templates as `^0.2.0`, which admits patches only for a 0.x version, so a new site installed the earliest releases. They are now read from the workspace when the scaffolder is built, and baked into `dist/versions.json`.
