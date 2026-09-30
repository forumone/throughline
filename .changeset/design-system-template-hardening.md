---
'@forumone/throughline-reference-ds': patch
'@forumone/create-throughline': patch
---

The reference design system's manifest build and validation, which every scaffolded project vendors, now:

- refuse a component directory with no contract, instead of silently leaving it out of the manifest
- read the directories that hold components from a `CONTRACT_LAYERS` list
- name the manifest from the project's own `package.json`, instead of claiming to be `@forumone/throughline-reference-ds`
- treat `antiExamples.empty` and `intent.brevity` as errors
