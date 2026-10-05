---
'@forumone/throughline': patch
---

`design_guide` for a component also returns `siteFields`: the fields a site adds to that block beyond the component's contract, described the way `get` describes a content type, with `findWith` saying which `find` kind looks up a value. A form block's `source.form` was invisible to an agent, so it added the block and left the form empty (forumone-2026#840).
