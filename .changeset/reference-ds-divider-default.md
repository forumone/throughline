---
'@forumone/throughline-reference-ds': patch
'@forumone/create-throughline': patch
---

The `Divider` contract now declares `decorative` with `defaultValue: true`, matching the component. Before, the default was written only in prose, so a divider added in the CMS started unticked and screen readers announced it.
