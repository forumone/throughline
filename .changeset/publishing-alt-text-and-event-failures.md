---
'@forumone/throughline-publishing': patch
---

Fix two defects reported against 0.3.0.

**The `alt-text` check false-positived on Payload upload derivatives.** `walkForImages` descended into a populated upload's `sizes` map, and every generated size carries `filename` and `mimeType` but never `alt` — that lives on the parent document. Each configured `imageSize` therefore produced one false failure, and any page carrying a sized image could not be published. The walk now skips `sizes` on an object that is itself an image; alt text is checked once, on the parent. A parent with missing or empty alt still fails, at the parent's path, and a host with no `imageSizes` is unaffected.

**A failed Inngest emission failed a publish that had already succeeded.** The event is sent after the document is written, so a transport failure (an invalid `INNGEST_EVENT_KEY`, say) returned 500 for a document that was published — and lost the audit record for it. Publish, unpublish, rollback and `schedule_publish` now report success and carry the emission failure as a `warnings` array on the result. The admin renders it as a warning toast on an otherwise successful publish.

Also adds `disableAccessibilityChecks`, naming built-in checks to skip. `accessibilityChecks` only appends, so previously a built-in that misfired on a host's content shape blocked every publish until the plugin shipped a fix.
