#!/usr/bin/env bash
#
# Stop hook: run the cheap half of CI's gate — typecheck and lint — when a
# session ends with pending changes under apps/ or design-system/.
#
# Why a hook and not only CI: these failures are cheap to fix in the session
# that caused them and expensive later. A session that touched nothing exits in
# milliseconds, which is what keeps this cheap enough to leave switched on.
#
# Deliberately not here: tests, manifest validation, the generated-files check
# and the build. They take minutes or need a database; they are CI's job. See
# CLAUDE.md for the whole gate.
#
# This reports. It never blocks and never edits, so it cannot wedge a session on
# a failure it cannot resolve. Exit is always 0. Set THROUGHLINE_SKIP_GATE=1 to
# silence it, for instance in headless sessions that run their own gate.

set -uo pipefail

[[ -z "${THROUGHLINE_SKIP_GATE:-}" ]] || exit 0

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
[[ -n "$ROOT" ]] || exit 0

if [[ -z "$(git -C "$ROOT" status --porcelain -- apps design-system 2>/dev/null)" ]]; then
  exit 0
fi

cd "$ROOT" || exit 0

OUTPUT="$(pnpm typecheck 2>&1 && pnpm lint 2>&1)"
STATUS=$?

if [[ $STATUS -eq 0 ]]; then
  MESSAGE="Gate clean: typecheck + lint. Tests, validate, check-generated and the build are CI's job — see CLAUDE.md."
else
  # The failing rule or type error is at the end, and a systemMessage is read
  # in a terminal, not scrolled.
  MESSAGE="Gate FAILED (typecheck/lint) — CI will fail on this:

$(printf '%s' "$OUTPUT" | tail -25)"
fi

node -e 'process.stdout.write(JSON.stringify({ systemMessage: process.argv[1], suppressOutput: true }))' "$MESSAGE"
exit 0
