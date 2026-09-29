---
'@forumone/throughline-publishing': patch
---

"Restore as published" is refused in words an editor can act on.

Payload's restore dialog offers a "restore as published" checkbox. The trust
boundary refuses it, correctly, because it is a publish, but it did so with
the message written for a developer: "Direct writes to `_status` are not
allowed. Use the publishing server…". It now says "Restore it as a draft, then
publish it." Nothing about what is allowed or refused has changed.
