---
'@forumone/throughline-design-system': minor
---

Adds `@forumone/throughline-design-system/recipes`: composed sections stored as data. A recipe is a provisional component contract plus a tree of the manifest's primitives and inline components, with every word bound to a content field. `lintRecipe` checks a recipe against the current manifest (props, slots, bindings, heading order, image fields, component placement and required fields, size and depth) and reports each issue with its path. `RenderRecipe` draws a recipe with the host's components, through the same `CoerceContext` blocks use.
