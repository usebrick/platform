#!/usr/bin/env bash
#
# post-comment.sh — post (or update) a slopbrick summary comment on a PR.
#
# Reads a SARIF or slopbrick JSON report at "$1" and creates (or updates)
# a single PR comment summarizing the run. Designed for GitHub Actions Ubuntu
# runners, which ship with bash, jq, and curl preinstalled.
#
# Usage:
#   post-comment.sh <report-path>
#
# Required env:
#   PR_NUMBER          — PR to comment on (defaults to $GITHUB_PR_NUMBER)
#   GITHUB_TOKEN       — token with `issues: write`
#   GITHUB_REPOSITORY  — owner/repo (auto-set by GitHub Actions)
#
# Optional env:
#   GITHUB_API_URL     — API root (defaults to https://api.github.com)
#
# Idempotency:
#   Looks for a comment on the PR whose body contains the marker
#   `<!-- slopbrick-comment -->` and updates it via PATCH if found,
#   otherwise posts a new comment.
#
set -euo pipefail

REPORT_PATH="${1:-slopbrick-report.sarif}"
PR_NUMBER="${PR_NUMBER:-${GITHUB_PR_NUMBER:-}}"

if [ -z "${PR_NUMBER:-}" ]; then
  echo "::error::PR_NUMBER not set; cannot post comment"
  exit 1
fi

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "::error::GITHUB_TOKEN not set; cannot post comment"
  exit 1
fi

if [ ! -f "$REPORT_PATH" ]; then
  echo "::error::Report not found at $REPORT_PATH"
  exit 1
fi

# Validate that the report is at least valid JSON.
if ! jq empty "$REPORT_PATH" 2>/dev/null; then
  echo "::error::Report at $REPORT_PATH is not valid JSON"
  exit 1
fi

# Detect format and extract the fields we need. SARIF v2.1 places results
# under .runs[0].results[] and uses locations[0].physicalLocation.artifactLocation.uri
# for the file path. slopbrick's native JSON uses top-level .issues[] with
# .filePath. slopIndex is only populated in the JSON format.
if jq -e '.runs[0].results | type == "array"' "$REPORT_PATH" >/dev/null 2>&1; then
  FORMAT="sarif"
  TOTAL=$(jq '[.runs[0].results[]] | length' "$REPORT_PATH")
  SLOP_INDEX=$(jq -r '.runs[0].properties.slopIndex // .properties.slopIndex // empty' "$REPORT_PATH")
  TOP_RULES=$(jq -r '
    [.runs[0].results[] | (.ruleId // "unknown")]
    | group_by(.)
    | map({rule: .[0], count: length})
    | sort_by(-.count)
    | .[0:5]
    | .[]
    | "- `\(.rule)` × \(.count)"
  ' "$REPORT_PATH")
  TOP_FILES=$(jq -r '
    [.runs[0].results[] | (.locations[0].physicalLocation.artifactLocation.uri // "unknown")]
    | group_by(.)
    | map({file: .[0], count: length})
    | sort_by(-.count)
    | .[0:3]
    | .[]
    | "- `\(.file)` × \(.count)"
  ' "$REPORT_PATH")
elif jq -e '.issues | type == "array"' "$REPORT_PATH" >/dev/null 2>&1; then
  FORMAT="json"
  TOTAL=$(jq '[.issues[]] | length' "$REPORT_PATH")
  SLOP_INDEX=$(jq -r '.slopIndex // empty' "$REPORT_PATH")
  TOP_RULES=$(jq -r '
    [.issues[] | (.ruleId // "unknown")]
    | group_by(.)
    | map({rule: .[0], count: length})
    | sort_by(-.count)
    | .[0:5]
    | .[]
    | "- `\(.rule)` × \(.count)"
  ' "$REPORT_PATH")
  TOP_FILES=$(jq -r '
    [.issues[] | (.filePath // "unknown")]
    | group_by(.)
    | map({file: .[0], count: length})
    | sort_by(-.count)
    | .[0:3]
    | .[]
    | "- `\(.file)` × \(.count)"
  ' "$REPORT_PATH")
else
  echo "::error::Report at $REPORT_PATH is neither SARIF nor slopbrick JSON (no .runs[0].results or .issues array)"
  exit 1
fi

# Empty placeholders when the report is clean so the body still renders.
if [ -z "$TOP_RULES" ]; then
  TOP_RULES="_(no issues)_"
fi
if [ -z "$TOP_FILES" ]; then
  TOP_FILES="_(no issues)_"
fi

# Build the Markdown body entirely inside jq to avoid bash interpolation
# pitfalls with backticks / dollar signs in the rendered text.
BODY=$(jq -rn \
  --arg total "$TOTAL" \
  --arg format "$FORMAT" \
  --arg slop "$SLOP_INDEX" \
  --arg rules "$TOP_RULES" \
  --arg files "$TOP_FILES" \
  '
  def slopLine: if $slop == "" then "n/a (use --format json to populate)" else $slop end;
  def fmtLine: if $total == "0" then "0 ✅ — no slop issues" else $total end;
  "<!-- slopbrick-comment -->\n## slopbrick\n\n- **Issues**: \(fmtLine)\n- **Slop Index**: \(slopLine)\n- **Format**: \($format)\n\n### Top rules\n\($rules)\n\n### Top files\n\($files)\n"
  ')

# Sanity-check body length — GitHub caps issue-comment bodies at 65536 chars.
BODY_LEN=${#BODY}
if [ "$BODY_LEN" -gt 60000 ]; then
  echo "::warning::Comment body is $BODY_LEN chars; truncating top sections"
  BODY="${BODY:0:60000}…\n<!-- truncated -->"
fi

PAYLOAD=$(jq -n --arg body "$BODY" '{body: $body}')

API_ROOT="${GITHUB_API_URL:-https://api.github.com}"
COMMENTS_URL="${API_ROOT}/repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments?per_page=100"

# Look for an existing comment on the PR containing our marker so re-runs
# update the same comment rather than spamming new ones.
EXISTING_ID=$(curl -fsSL \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$COMMENTS_URL" \
  | jq -r '[.[] | select(.body | contains("<!-- slopbrick-comment -->"))] | .[0].id // empty')

if [ -n "$EXISTING_ID" ]; then
  echo "::notice::Updating existing slopbrick comment id=$EXISTING_ID on PR #${PR_NUMBER}"
  curl -fsSL -X PATCH \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    -H "Content-Type: application/json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    -d "$PAYLOAD" \
    "${API_ROOT}/repos/${GITHUB_REPOSITORY}/issues/comments/${EXISTING_ID}" >/dev/null
else
  echo "::notice::Posting new slopbrick comment to PR #${PR_NUMBER}"
  curl -fsSL -X POST \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    -H "Content-Type: application/json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    -d "$PAYLOAD" \
    "${API_ROOT}/repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments" >/dev/null
fi

echo "✅ slopbrick comment posted to PR #${PR_NUMBER}"