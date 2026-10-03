#!/usr/bin/env bash
# Publishes a snapshot of the three published packages: `<version>-<name>`
# under the npm dist-tag `<dist-tag>`. Run by release.yml, for a pull request
# (`pr-<n>-<sha>`, tag `pr`) and for a merge to main (`next-<sha>`, tag `next`).
#
#   scripts/publish-snapshot.sh <name> <dist-tag>
#
# It versions the checkout in place and never commits or tags: a snapshot is
# a build of this commit, not a release. The base version is what the pending
# changesets would release (`snapshot.useCalculatedVersion`), so
# `1.2.0-next-a1b2c3d` is a preview of 1.2.0.
#
# Changesets refuses a snapshot in pre-release mode, so in pre mode this exits
# it first, here only. The result is the version the pre-release line is
# heading for: `1.0.0-pr-264-a1b2c3d` while main is at `1.0.0-next.N`.
set -euo pipefail

name="${1:?snapshot name, e.g. pr-264-a1b2c3d}"
dist_tag="${2:?npm dist-tag, e.g. pr}"

if [[ -f .changeset/pre.json ]]; then
  pnpm changeset pre exit
fi

pnpm changeset version --snapshot "$name"

# No pending changesets means nothing was versioned, and nothing to publish.
if git diff --quiet -- 'packages/*/package.json'; then
  echo "No unreleased changesets: nothing to publish."
  exit 0
fi

pnpm turbo run build
pnpm changeset publish --tag "$dist_tag" --no-git-tag

summary="${GITHUB_STEP_SUMMARY:-/dev/stdout}"
{
  echo "### Snapshot published under \`$dist_tag\`"
  echo
  echo '```bash'
  for pkg in packages/throughline packages/design-system; do
    node -e "const p=require('./$pkg/package.json'); console.log('pnpm add ' + p.name + '@' + p.version)"
  done
  node -e "const p=require('./packages/create-throughline/package.json'); console.log('pnpm create @forumone/throughline@' + p.version + ' my-site')"
  echo '```'
} >> "$summary"
