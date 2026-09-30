#!/usr/bin/env bash
#
# payload-types.ts and importMap.js are committed but generated from
# payload.config.ts. Regenerating and diffing is what stops them drifting from
# the config:
#
#   - a stale importMap.js is a 500 on any admin screen that renders a component
#     the map has never heard of — a plugin upgrade that swaps in a custom
#     Publish button is enough
#   - stale types make everything downstream compile against a schema that no
#     longer exists
#
# Run from the repository root, with the environment payload.config.ts demands.
# **No database is needed** — the config parses a connection string and never
# reaches it — which is what lets this run on every pull request.

set -euo pipefail

TYPES='apps/web/src/payload-types.ts'
MAP='apps/web/src/app/(payload)/admin/importMap.js'

# `git status --porcelain` rather than `git diff`: a file that was never
# committed is untracked, and `git diff` says nothing about it.
pnpm --dir apps/web run generate:types
if [ -n "$(git status --porcelain -- "$TYPES")" ]; then
  git --no-pager diff -- "$TYPES" || true
  echo "::error::payload-types.ts is stale or uncommitted — run 'pnpm --dir apps/web generate:types' and commit it."
  exit 1
fi

# importMap.js is compared as a *set* of lines. Payload emits plugin entries in
# an order that differs between macOS and Linux, so a byte comparison fails on a
# file whose content is identical. Order does not matter to correctness; a
# missing entry does, and that is what this catches.
sort "$MAP" > "${RUNNER_TEMP:-/tmp}/importmap-committed"
pnpm --dir apps/web run generate:importmap
sort "$MAP" > "${RUNNER_TEMP:-/tmp}/importmap-regenerated"

if ! diff -u "${RUNNER_TEMP:-/tmp}/importmap-committed" "${RUNNER_TEMP:-/tmp}/importmap-regenerated"; then
  echo "::error::importMap.js is stale — run 'pnpm --dir apps/web generate:importmap' and commit it."
  exit 1
fi

git checkout -- "$MAP"
