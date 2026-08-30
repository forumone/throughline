---
'@forumone/throughline-approvals': patch
'@forumone/throughline-audit': patch
'@forumone/throughline-components': patch
'@forumone/throughline-core': patch
'@forumone/throughline-design-contract': patch
'@forumone/throughline-email': patch
'@forumone/throughline-forms': patch
'@forumone/throughline-integrations': patch
'@forumone/throughline-plugin-contract': patch
'@forumone/throughline-publishing': patch
'@forumone/throughline-reference-ds': patch
'@forumone/throughline-workflows': patch
---

One `@types/node`, so a host does not end up with two copies of `@payloadcms/ui`

Twelve packages asked for `@types/node@^20.17.0` and `design-system-payload`
asked for `^24.13.2`. Inside this repository that is untidy. Inside a host that
consumes the suite from source — which is how `forumone/forumone-2026` uses it,
as a git submodule in one pnpm workspace — it is a runtime failure.

pnpm hashes a package's identity with its resolved peers. `publishing` and
`integrations` both take `@payloadcms/ui` as a peer *and* as a devDependency, so
each got its own copy resolved against `@types/node@20`, while the host's copy
resolved against `@types/node@24`. Same version, 3.87.1, two directories:

    apps/web                     → @payloadcms+ui@3.87.1_…_9ce0de5c…
    packages/publishing          → @payloadcms+ui@3.87.1_…_13184ec4…
    packages/integrations        → @payloadcms+ui@3.87.1_…_13184ec4…

Two directories are two module instances. Two instances of `@payloadcms/ui` are
two `ConfigContext` objects, and `PublishButton` read the one the admin's
provider had never populated:

    TypeError: Cannot destructure property 'config' of useConfig() as it is undefined

The host saw an intermittent 500 on every admin document view — `PublishButton`
is installed on each collection with a publish policy, so lists, `/admin` and
the login screen were all fine and only editing broke. Nothing caught it:
install, `--frozen-lockfile`, typecheck, lint and every test passed, because the
two copies are byte-identical and the split exists only at module resolution.
forumone/forumone-2026#498.

Aligning on `^24.13.2` collapses them to one instance. Nothing here targets a
Node 20 API deliberately; the packages typecheck and test unchanged against the
newer types.

`create-throughline` keeps `^20.17.0` on purpose. It is the one package
declaring `engines.node: >=20.9.0`, and typechecking a CLI against types newer
than the runtime it promises to support is how a Node 24-only call ships to
somebody on Node 20.
