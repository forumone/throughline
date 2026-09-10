---
'@forumone/throughline-design-system-payload': patch
---

A generated upload field offers the reference and not the document:
`admin.allowEdit: false` on every `image` field and on a `videoUpload`.

Payload's upload field puts two actions side by side and they look alike. The
picker changes which library document this block points at — local to the block,
carried by the draft, published when the page is. The pencil opens that document
in a drawer where the file itself can be replaced — global, immediate, and
invisible from where it is offered.

Three facts compound, and a host has none of them on screen:

- a media document is shared by every block that picked it;
- an upload collection is conventionally unversioned, so replacing the file is
  live the moment it is saved — there is no draft of it to hold back;
- a host storing blocks as JSON has no `_rels` row for an upload inside one, so
  nothing can compute what else points at the document.

Downstream that turned "change the photograph on this page" into "change it on
all five pages that picked this photograph, now, while the page you are looking
at is still a draft" — which then read to the editor as Save draft having
published. Five heroes had been seeded from one stock image; the render path was
never involved.

`allowCreate` is deliberately untouched. Uploading a new file is the safe answer
to "I want a different picture here" and stays one click, or this would trade a
shared-asset bug for editors editing the shared asset because adding one was
tedious. What is removed is the one action whose blast radius cannot be seen
from where it is offered.

`admin.description` still survives — it is built from the contract's
`constraints` and was the only thing in `admin` before this, so the merge is
asserted by a test rather than left to whoever edits the helper next.

No knob to put the pencil back. `overrides` cannot express it today and adding
one is worth doing when somebody wants it; refusing by default is the right way
round, because the failure is silent and the recovery is manual.
