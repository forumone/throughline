---
'@forumone/throughline-publishing': patch
---

Stop overwriting `publishedAt` on every publish.

`executeStep` wrote the current time into the collection's `publishedAtField` on
every run, so re-publishing an edit re-dated the document. The field means "when
this went live" — a listing sorts on it and a template prints it — so the visible
effect was that editing a two-year-old article sent it to the top of its index
under today's date, and an editor who typed the original date into the sidebar
watched publishing replace it.

The guard was already there and unused: the step computes `wasFirstPublish` for
the `content/page.published` payload, where it is reported as `isFirstPublish`.
It now also decides the write, so `publishedAt` is stamped on a first publish and
left alone afterwards. A document that should genuinely be re-dated is re-dated
by editing the field, which now survives.

`previousPublishedAt` and `isFirstPublish` in the event are unchanged, so a
subscriber that wants the publish time of *this* publish still has it.

Patch rather than minor: the fix restores what the field was documented to mean.
Anything relying on it as a last-published timestamp was relying on the bug — and
`updatedAt` is the field for that.
