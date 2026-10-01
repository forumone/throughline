# Security model

What Throughline protects against, what it doesn't, and where to add controls when your threat model needs them.

## Threat model

Three actors:

- **Marketers / editors** — authorized humans interacting through Claude or the Payload admin
- **Approvers** — authorized humans deciding via email links
- **Untrusted public** — visitors to the published frontend, form submitters, anyone hitting public endpoints

Three primary protections:

- **Authentication**: who you are
- **Authorization**: what you can do (gated by Payload's collection-level access plus role-based MCP gating)
- **The trust boundary**: even authenticated, authorized callers can't bypass the publish pipeline

## Authentication

| Surface | Auth mechanism |
| --- | --- |
| Payload admin UI | Cookie-based session, signed by `PAYLOAD_SECRET` |
| MCP endpoint (`/api/mcp`) | Bearer key from `payload-mcp-api-keys`, which `@payloadcms/plugin-mcp` brings |
| Approval email URLs | HMAC-signed token (signed by `APPROVAL_TOKEN_SECRET`) |
| Public form submissions | Honeypot + IP-based rate limit; no login |
| Inngest function delivery | Payload of HMAC-signed events from Inngest |

### MCP API keys

Keys live in `payload-mcp-api-keys`, the collection `@payloadcms/plugin-mcp` adds. Each key is bound to a person in `users` and carries one checkbox per tool. `/api/mcp` looks up `Authorization: Bearer <key>`, refuses an unknown key, and runs every tool as the person the key is bound to. That person's roles apply, and an unticked tool is denied.

A key is a credential, so only admins should manage keys. The plugin doesn't enforce that by default. Older releases declared the collection with no `access` block, which meant anybody signed in. Current releases let each person manage their own keys. Narrow it to admins with `mcpApiKeyAccess` from `@forumone/throughline-core`. The scaffold does this already:

```ts
import { mcpApiKeyAccess } from '@forumone/throughline-core'
import { mcpPlugin } from '@payloadcms/plugin-mcp'

mcpPlugin({
  mcp: { tools: mcpTools.tools },
  overrideApiKeyCollection: mcpApiKeyAccess(isAdmin),
})
```

`isAdmin` is your site's own `Access` rule. The helper applies it to `read`, `create`, `update`, `delete` and `unlock`, and refuses an MCP key principal before it asks the rule, so a key can never manage keys. It changes `access` and nothing else. To set other options too, such as the collection's `admin.group`, call it inside your own override and spread the result.

Best practices:

- One key per consumer (Claude Desktop, Claude Code, your CI bot, etc.) — easier to revoke
- Rotate on team changes (someone leaves, a laptop is lost)
- Scope by capability when supported (e.g., a key for read-only audit access is safe to share more broadly)

### Approval tokens

Each approval email contains three URLs of the shape:

```
/api/approvals/decision?token=<HMAC>&action=<approve|decline|request-changes>
```

The token encodes `{ approvalId, userId, action }` and is HMAC-SHA256-signed with `APPROVAL_TOKEN_SECRET`. The server verifies before applying the decision. Tokens have a short expiry (default 14 days, matching the approval's expiry).

This means:

- An approver doesn't need to log in to decide — useful for non-developer reviewers
- A leaked email URL can be replayed until the approval expires (or you rotate the secret)
- A leaked secret invalidates every email URL in flight; rotate carefully

If your domain requires login-on-every-decision, the approver can also call `decide_approval` through the Approvals MCP, which uses MCP API key auth.

### Form submission auth

Forms are public-by-default. The framework enforces:

- **Honeypot field** — a hidden field bots fill, which the server rejects. Catches dumb bots.
- **IP rate limiting** — submissions from one IP-hash exceeding N per hour get 429'd. The IP is HMAC-hashed (using `FORMS_IP_HASH_SECRET`) so logs don't store raw IPs.
- **Allowlisted destinations** — submissions can only deliver to destinations on the per-form allowlist. Forms can't be used as open relays.

For higher-trust forms, layer:

- **CAPTCHA / Turnstile** — wire in your form rendering, not in core
- **Auth-required forms** — gate with Payload's collection-level access; the form's submit endpoint inherits

## Authorization

Two orthogonal axes:

### Roles

The `users` collection has a `roles` field. Common roles:

- **`admin`** — anything
- **`editor`** — create/update/delete content; publish only when policy allows
- **`approver`** — grant/decline approvals; doesn't imply edit access
- **`form-admin`** — create/edit forms; read submissions

Roles gate MCP tool access. The Components plugin's `propose_components` tool requires `admin` or `editor`; the Audit plugin's read tools require `admin`, `editor`, or `auditor` (configurable). The Forms plugin's submission-read tools require `admin` or `form-admin`.

Custom roles are easy: add to the `users.roles` field options, add to the access function for whatever resources you're gating.

### "Signed in" is not `Boolean(req.user)`

Payload's `defaultAccess`, and many hand-written rules, treat any `req.user` as a signed-in person. In a Throughline site that is not true. The MCP key collection sets `auth.useAPIKey`, and **before Payload 3.89.0** that registered Payload's API-key strategy for every REST route. A request with `Authorization: payload-mcp-api-keys API-Key <key>` then got the *key document* as `req.user`. It has no roles, so role checks refused it. `Boolean(req.user)` didn't, so a rule like "published, or anybody signed in" served every draft to anyone holding a key, with no MCP involved.

Payload 3.89.0 fixed this upstream, and every Throughline package now requires `payload@^3.89.0`. Don't rely on that alone. A site's own access layer should refuse the key principal too, so the hole stays closed even if that one upstream fix regresses. Core exports the check:

```ts
import { isSignedIn, signedIn } from '@forumone/throughline-core'

// A predicate, for rules that do more than one thing:
export const publishedOrSignedIn: Access = ({ req }) =>
  isSignedIn(req.user) ? true : { _status: { equals: 'published' } }

// Or the Access function itself, in a collection's `access` block:
access: { read: publishedOrSignedIn, create: signedIn }
```

`isSignedIn` refuses only a principal from `payload-mcp-api-keys`. A tool call through `/api/mcp` arrives as the person the key is bound to, so the check doesn't affect it. Watch self-scoped rules in particular. `{ id: { equals: req.user.id } }` checked against `users` would match whichever user has the key document's id, because both tables use small sequential ids. Gate such a rule on `isSignedIn` first. `isMcpApiKeyPrincipal(req.user)` is exported for rules that need to tell the two apart directly.

Also check role checks that look up the collection first. A role rule reads `req.user.roles`, which a key document doesn't have, so it refuses already. Checking `req.user.collection === 'users'` first states that intent, and it's what TypeScript asks for once `payload-types.ts` exists.

### Groups

Orthogonal to roles. Groups (`editorial`, `legal`, `senior`) are about content workflow, not system access. See [Configuring approvers](../guides/configuring-approvers.md).

A user can be both `editor` (system role) and a member of `editorial` (workflow group). The two are independent.

## The trust boundary

The publish pipeline is the single sanctioned path to `_status: 'published'`. See [The trust boundary](../concepts/the-trust-boundary.md) for full details.

Why this matters for security:

- **Claude can't ship content that fails policy.** If the brand-voice check rejects, publishing fails.
- **Editors can't ship without approval** when the page requires it. The admin UI's "Publish" button calls the same endpoint Claude would; same gates fire.
- **A compromised MCP API key still can't bypass policy.** The attacker can edit drafts, but they can't publish anything that fails the gates.

The boundary is enforced at the application layer. Database access bypasses it (anyone with `psql` can write `_status: 'published'` directly). Treat database credentials as sensitive accordingly.

## What's encrypted

| Data | Storage | Encryption |
| --- | --- | --- |
| User passwords | `users` collection (Payload-managed) | bcrypt at rest; never logged |
| Sessions | Cookies | Signed (not encrypted) by `PAYLOAD_SECRET` |
| MCP API keys | `payload-mcp-api-keys` collection | Encrypted with `PAYLOAD_SECRET`, plus an HMAC index for lookup (Payload's API-key fields). Rotating `PAYLOAD_SECRET` invalidates every key |
| Integration configs | `integrations` collection | Plaintext at rest |
| Audit log diffs | `audit-events` collection, `diff` column | Plaintext; each entry is `{ before, after }` and can hold sensitive values |
| Approval tokens (in email URLs) | Not stored after send; signed | HMAC; verify-only |

If your compliance posture requires field-level encryption (HIPAA, PCI), that's a Phase 2 expansion — Payload supports custom field hooks that can transparently en/decrypt values, but it's not built into Throughline.

## What goes through TLS

All HTTPS by convention; Vercel / Railway / Fly all default to TLS termination at the load balancer. Postgres connections must be TLS too — Neon and Supabase enforce this; self-hosted Postgres needs explicit configuration.

Inngest <-> your app: HMAC-signed but typically also over TLS through the platform's ingress.

## Out of scope (Phase 2)

What Throughline core deliberately doesn't ship:

- **SSO / SAML / OIDC** — Payload supports these via plugins (`@payloadcms/plugin-cloud-sso`, custom auth strategies). Throughline's user/group model integrates with whatever auth you wire.
- **Field-level encryption** — possible via Payload field hooks, not built-in.
- **Secrets management** — the framework reads from `process.env`. For Vault / Secrets Manager / KMS integration, inject env vars from your secrets system at deploy time.
- **DLP / content scanning** — if your domain requires scanning content before publish, write an `AccessibilityCheck` that calls your DLP service.
- **VPN / IP allowlisting on admin** — handle at the platform level (Cloudflare Access, Vercel firewalls, your VPN provider).
- **Audit log tamper-evidence** — the audit log is a regular Postgres table. For tamper-evident logging (hash-chained, append-only), wire to a system designed for that (Datadog audit, AWS CloudTrail, internal append-only store) and write to it from the `audit/event.recorded` Inngest event.

## Reasonable defaults checklist

Before going live:

- [ ] All secrets are 48+ random bytes, generated with `openssl rand -base64`
- [ ] `PAYLOAD_SECRET`, `APPROVAL_TOKEN_SECRET`, `FORMS_IP_HASH_SECRET` are different values
- [ ] MCP API keys are scoped per-consumer, not shared
- [ ] `mcpPlugin` is passed `overrideApiKeyCollection: mcpApiKeyAccess(isAdmin)`, so only admins manage keys
- [ ] No access rule treats `Boolean(req.user)` as "signed in"; use `isSignedIn` from `@forumone/throughline-core`
- [ ] `payload` is 3.89.0 or later
- [ ] Payload admin is behind your platform's auth/firewall (or only accessible from approved IPs)
- [ ] Form destinations are an explicit allowlist; no wildcards
- [ ] Database backups are configured (provider-managed for Neon/Supabase; explicit for self-hosted)
- [ ] Resend domain is DNS-verified (SPF + DKIM + DMARC)
- [ ] Inngest signing key is set (so spoofed events get rejected)
- [ ] Vercel project's environment variables are scoped to Production only when needed (don't leak prod keys to preview deploys unless you actually want that)

## Reporting security issues

Find a security issue in Throughline core? Email `security@forumone.com`. Don't open a public issue.

For client-project-specific issues (something in your generated project that core doesn't determine), follow your org's responsible-disclosure process.
