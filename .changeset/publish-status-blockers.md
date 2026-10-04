---
'@forumone/throughline': minor
---

`get_publish_status` reports every preflight blocker at once, as `wouldPublish.blockers`, and the draft's `previewUrl`.

It used to stop at the first failing step, so a draft with a composition problem and a missing required field took two calls to learn about both. Once `exist` passes, each later step now runs and every failure is kept, in pipeline order. The first blocker still fills `blockedAt`, `code`, `reason`, `suggestion` and `issues` exactly as before. `publish` and `schedule_publish` still stop at the first failure.

`previewUrl` is the collection's own `admin.preview`, made absolute against `serverURL`, which is the link `create_draft` and `update_draft` already return. The shared helper moves to `utils/preview-url.ts`, and `content/tools` re-exports it. The service's `PublishStatusOutcome` gains `blockers` and `previewUrl`. (forumone-2026#827)
