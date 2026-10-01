---
'@forumone/throughline-plugin-contract': minor
'@forumone/throughline-core': minor
'@forumone/throughline-approvals': minor
'@forumone/throughline-email': minor
'@forumone/throughline-forms': minor
'@forumone/create-throughline': minor
---

A missing environment variable is reported together with every other one, in a
single error, instead of one plugin at a time.

The plugins that read the environment at init now declare what they cannot
start without, as data: `approvalsEnv` (`APPROVAL_TOKEN_SECRET`, 32+
characters), `emailEnv` (`RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`) and `formsEnv`
(`FORMS_IP_HASH_SECRET`, 32+ characters). Each is a list of `EnvRequirement`
(`{ name, minLength?, why }`), a new type in `plugin-contract`, and each
plugin's own init check now reads the same entries, so the two cannot drift.
An empty or whitespace-only value now counts as missing in those checks.

Core exports `assertEnvironment(...checks)`. Call it first in
`payload.config.ts` with the plugins' lists and your own variables; it throws
one `EnvironmentError` whose first line reads "Configuration problem: N
environment variables are missing or invalid", followed by every missing or
too-short variable and why it is needed. Values are never printed. An argument
can also be a function, for a rule that is not "this name, this long", such as
a database URL accepted under several names. `checkEnvValue` is the one-value
check behind it, for a plugin's own backstop.

New projects call `assertEnvironment` at the top of `payload.config.ts` with
`approvalsEnv`, `emailEnv`, `formsEnv`, `PAYLOAD_SECRET` (32+ characters),
`NEXT_PUBLIC_SERVER_URL` and the database resolver, and `.env.example` marks
which variables are checked. An existing site can do the same and delete any
hand-kept copy of the plugins' requirements.
