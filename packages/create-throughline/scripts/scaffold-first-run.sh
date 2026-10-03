#!/usr/bin/env bash
# What a person does after `pnpm create` and `pnpm install`, as the
# post-install steps list them: commit the scaffold, build the design system the
# config reads, generate the Payload types and import map, and commit those. A
# scaffold's own `check-generated` gate compares against what is committed, so
# it needs both commits.
#
#   bash scripts/scaffold-first-run.sh <site-dir>
#
# Expects the variables payload.config.ts checks at load to be set; the
# scaffold's CI workflow lists them as placeholders.
set -euo pipefail
cd "$1"

git init -q
git add -A
git -c user.name=scaffold-check -c user.email=scaffold-check@example.com commit -q -m "Scaffold"

pnpm --filter ./design-system run --if-present build
pnpm --dir apps/web generate:types
pnpm --dir apps/web generate:importmap

git add -A
# Nothing to commit when the generated files already matched.
git diff --cached --quiet ||
  git -c user.name=scaffold-check -c user.email=scaffold-check@example.com commit -q -m "Generate Payload types and import map"
