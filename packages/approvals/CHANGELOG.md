# @forumone/throughline-approvals

## 0.2.1

### Patch Changes

- Updated dependencies [a4b5108]
  - @forumone/throughline-core@0.2.1
  - @forumone/throughline-publishing@0.2.2

## 0.2.0

### Minor Changes

- 3ef6f6a: Initial release. Conversational approval workflow server with HMAC-signed single-use action tokens, per-group approver resolution, first-decision-wins semantics, version-bound approvals, seven-day default expiration, an HTML confirmation flow on the action endpoint, and five MCP tools (`request_approval`, `respond_to_approval`, `get_approval_status`, `list_pending_approvals`, `list_my_requests`). The plugin's `onInit` attaches the approval resolver to the Payload instance under `Symbol.for('@forumone/throughline/approvals-resolver')` so the publishing server can look it up automatically.

### Patch Changes

- Updated dependencies [3ef6f6a]
  - @forumone/throughline-publishing@0.2.1
