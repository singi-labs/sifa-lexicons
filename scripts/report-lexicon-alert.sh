#!/usr/bin/env bash
# Open, or comment on, the single tracking issue for lexicon publishing
# problems. Deduplicated by label: one open issue at a time, later failures
# add a comment to it. Called from the publish and drift workflows on failure.
#
# Usage: scripts/report-lexicon-alert.sh "<what failed>"
# Env:   GH_TOKEN, GITHUB_REPOSITORY, GITHUB_SERVER_URL, GITHUB_RUN_ID
set -euo pipefail

reason="$1"
label="lexicon-publish-alert"
title="Lexicon publishing alert"
run_url="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"

body_file="$(mktemp)"
trap 'rm -f "$body_file"' EXIT
cat > "$body_file" <<EOF
${reason}

Run: ${run_url}

Check the run log. For drift, run \`npm run drift:check\` locally, then re-run the Publish lexicons workflow. Close this issue once the network matches the repo.
EOF

gh label create "$label" --repo "$GITHUB_REPOSITORY" --color B60205 \
  --description "Lexicon publish failure or published-vs-repo drift" --force

existing="$(gh issue list --repo "$GITHUB_REPOSITORY" --label "$label" --state open \
  --json number --jq '.[0].number // empty')"

if [ -n "$existing" ]; then
  gh issue comment "$existing" --repo "$GITHUB_REPOSITORY" --body-file "$body_file"
  echo "Commented on #${existing}"
else
  gh issue create --repo "$GITHUB_REPOSITORY" --title "$title" --label "$label" --body-file "$body_file"
fi
