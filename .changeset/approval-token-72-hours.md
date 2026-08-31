---
'@forumone/throughline-approvals': minor
---

An emailed approval link lasts 72 hours, not 14 days

The action token's default lifetime outlived the thing it acts on. `plugin.ts`
expires an approval request after seven days (`expirationDays ?? 7`), so the
second week of a token's life could only ever act on a request that was already
gone — a link that still verifies and then finds nothing.

Seventy-two hours is what an approval actually needs: it covers a weekend, which
is the realistic gap between sending a request and somebody opening their mail,
and it stays well inside the request's own expiry so the two cannot disagree.
`createExpireStaleApprovalsFunction` handles anything that ages out either way.

The token is otherwise well built — HMAC-SHA256, constant-time compare, bound to
one approval, action and approver, single-use, with a confirmation interstitial
— so this narrows a window rather than closing a hole.

`maxAgeMs` per call is unchanged, so a host that wants the old behaviour can
pass it. **Minor rather than patch**: a link somebody was sitting on for a week
stops working, which is a behaviour change even though it is the intended one.

Nothing asserted the default before. There is now a test that does, and it says
why the number is what it is, so it cannot drift back without somebody deciding
to.

Found auditing the host that consumes this suite: forumone/forumone-2026#486,
F-13.
