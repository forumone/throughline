---
'@forumone/throughline': major
---

`resend`, `@react-email/components` and `@react-email/render` are optional peers rather than dependencies, and `inngest` is an optional peer. `payload` is the only required one. Each optional peer is loaded only by the subpath that uses it, and the root loads none: the approval emails import their templates when they send, so registering the suite with `throughline()` no longer loads React or React Email. A missing optional peer fails when its feature runs, with an error naming the package to install.
