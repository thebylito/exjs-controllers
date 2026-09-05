#!/usr/bin/env bash
# Prints the CHANGELOG.md section for a version, ready to use as GitHub
# Release notes. The `## [x.y.z]` heading and the `[x.y.z]: <url>` link
# definition are dropped; the compare URL is appended as a visible line.
#
# Usage: release-notes.sh <version> [changelog-file]
set -euo pipefail

version="${1:?usage: release-notes.sh <version> [changelog-file]}"
file="${2:-CHANGELOG.md}"

section="$(awk -v v="$version" '
  BEGIN { gsub(/\./, "\\.", v); heading = "^## \\[" v "\\]" }
  !found && $0 ~ heading { found = 1; next }
  found && (/^## \[/ || /^---[[:space:]]*$/) { exit }
  found { print }
' "$file")"

compare_url="$(printf '%s\n' "$section" | sed -n -E 's/^\[[^]]+\]: *(https?:[^ ]+) *$/\1/p' | head -n 1)"
notes="$(printf '%s\n' "$section" | grep -v -E '^\[[^]]+\]: *https?:' || true)"

# Trim leading/trailing blank lines.
notes="${notes#"${notes%%[![:space:]]*}"}"
notes="${notes%"${notes##*[![:space:]]}"}"

if [ -z "$notes" ]; then
  echo "release-notes.sh: no section '## [$version]' found in $file" >&2
  exit 1
fi

printf '%s\n' "$notes"
if [ -n "$compare_url" ]; then
  printf '\n**Full changelog:** %s\n' "$compare_url"
fi
