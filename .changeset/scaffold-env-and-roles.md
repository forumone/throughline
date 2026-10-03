---
'@forumone/create-throughline': patch
---

A scaffolded project puts its env file where `next dev` reads it, and does not make every account an administrator. The instructions copy `.env.example` to `apps/web/.env.local` rather than the root, which `next dev` in `apps/web` never read. New users default to `editor`; the first account, made at `/admin/create-first-user`, is the admin; and only an admin may set a role or a group.
