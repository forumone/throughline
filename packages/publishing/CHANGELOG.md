# @forumone/throughline-publishing

## 0.2.0

### Minor Changes

- [`123d2ea`](https://github.com/forumone/throughline/commit/123d2ea0172d9495b9e2c8e8c6039e623f5fba66) Thanks [@briangraves](https://github.com/briangraves)! - Initial release. Policy-gated publishing server with a seven-step pipeline (exist, composition, accessibility, required-fields, embargo, approval, execute), five MCP tools (publish, unpublish, schedule_publish, get_publish_status, rollback), and a Payload `beforeChange` hook on every publishable collection that rejects direct `_status` writes from anywhere other than the pipeline's execute step. Built-in accessibility checks cover alt text, heading hierarchy, and link labels; clients add custom checks via the `accessibilityChecks` option.
