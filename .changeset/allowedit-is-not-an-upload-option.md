---
'@forumone/throughline-design-system-payload': patch
---

Revert `admin.allowEdit: false` on generated upload fields. It never did
anything, and 0.4.3's entry describing it is wrong.

**0.4.3 claimed that a generated upload field "offers the reference and not the
document". It does not, and did not.** Anyone who read that entry and stopped
worrying about editors replacing a shared asset from inside a block should start
again. The behaviour is unchanged from 0.4.2.

`admin.allowEdit` is not honoured on an upload field in payload 3.87.1, for
three independent reasons:

- **It is not an option.** `UploadAdmin` is `allowCreate` and `isSortable`.
  `allowEdit` belongs to `RelationshipAdmin`, which is a different field type.
- **It would not survive the trip to the client.** `UploadAdminClient` is
  `AdminClient & Pick<UploadAdmin, 'allowCreate' | 'isSortable'>`.
- **The component does not read it.** `@payloadcms/ui`'s `fields/Upload/HasOne`
  renders `allowEdit: !readonly`, hardcoded. Compare `allowCreate`, which *is*
  wired through from the field config in `fields/Upload/index.js`.

So the pencil can only be removed with `readOnly`, which takes the picker with
it. The asymmetry with `allowCreate` reads as an upstream oversight rather than
a decision and is filed as one; until it moves, this is a Payload behaviour a
host designs around rather than a generator setting.

What replaces the code is a note at `toPayloadField` saying all of the above,
because the fix looks obvious, has now been tried once, and would be tried
again.

**Why it passed every gate**, which is the part worth carrying forward. It was
written through a helper returning `{ admin: Record<string, unknown> }`, and
that widening is exactly what suppresses TypeScript's excess-property check —
written inline, `tsc` rejects `allowEdit` on an upload's admin, and does so
today. The tests then asserted the key was present *on the generated config
object*, which is one end of a string whose other end nothing reads. The
replacement tests assert what this file actually controls: that an image
field's `admin` carries the contract's description and no keys of its own, and
that a field with no constraints gets no `admin` at all.

`allowCreate` was never set by the reverted code and is still untouched.
