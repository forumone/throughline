---
'@forumone/throughline-approvals': patch
---

`get_approval_status` now refuses an unauthenticated caller, and answers only
the requester or a member of an approver group.

It had no authorization check of any kind. The handler was `async (input) =>` —
the signature did not accept `ctx`, so there was nothing to check against — and
it `findByID`d an arbitrary `approvalId` at the Local API default of
`overrideAccess: true`, returning the target, the requester, the approver
groups, the decision and the decision notes. The other four tools on this
server all check `ctx.user`, which made this the one approvals tool that still
answered when the rest correctly denied. Audit 04 F-20.

The rule is the union of what the two list tools already show a caller —
`list_my_requests` returns the approvals they requested, `list_pending_approvals`
the ones routed to their groups — so the by-id read agrees with the by-list
reads instead of being a way around them. No admin bypass, because
`respond_to_approval` has none either and a second policy on the same collection
is how the two drift.

A refused read returns `Approval not found`, the same sentence as a genuine
miss: ids are sequential, and a distinguishable refusal enumerates who is asking
whom to approve what.

**Behavioural change for consumers.** A `get_approval_status` call arriving with
no `ctx.user` now returns `{ error: 'Must be authenticated…' }` instead of the
approval. In practice that is every `Bearer`-authenticated MCP call, because
`@payloadcms/plugin-mcp` does not assign `req.user` — the same fact that made
the four gated tools deny and this one answer.
