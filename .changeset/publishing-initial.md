---
'@forumone/throughline-publishing': minor
---

Initial release. Policy-gated publishing server with a seven-step pipeline (exist, composition, accessibility, required-fields, embargo, approval, execute), five MCP tools (publish, unpublish, schedule_publish, get_publish_status, rollback), and a Payload `beforeChange` hook on every publishable collection that rejects direct `_status` writes from anywhere other than the pipeline's execute step. Built-in accessibility checks cover alt text, heading hierarchy, and link labels; clients add custom checks via the `accessibilityChecks` option.
