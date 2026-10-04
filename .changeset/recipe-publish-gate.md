---
'@forumone/throughline': minor
---

The publish gate for composed sections. The new `publishing.recipes` option names the block that holds a recipe and the collection recipes live in. With it, the composition step checks that each such block's recipe exists, is approved, still passes `lintRecipe` against the current manifest, and has its required content filled, instead of calling the block an unknown component. The components plugin now also attaches its loaded manifest for this. The composition validator also checks placement: a component placed only `inline` can't be a block on a page by itself.
