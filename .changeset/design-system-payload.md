---
'@forumone/throughline-design-system-payload': minor
---

The design-system-to-Payload bridge joins the suite

`@forumone/throughline-design-system-payload` turns a component manifest into Payload blocks and those blocks back into React. It lived in the first site to use it; every Throughline site needs it, and a second one copying it by hand is the drift the contract system exists to prevent.

Moved with `git subtree`, so its history came too. Private and unpublished for now — a `dist` build and `.js` import extensions are what it would need to publish, and nothing needs that while consumers take it from the workspace.
