#!/usr/bin/env bash
#
# Static and test gate for Eternal (adapted to this repository).
#
#   1. bash -n      shell scripts (if any, excluding node_modules)
#   2. node --check JavaScript files under src/, scripts/, config/ and index.js
#   3. npm test     existing verification and builder test suites
#
# Exits non-zero on the first failing stage.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> [1/3] bash -n (shell scripts)"
found_sh=0
while IFS= read -r -d '' f; do
  found_sh=1
  bash -n "$f"
  echo "    OK $f"
done < <(find . -name '*.sh' -not -path './node_modules/*' -not -path './.git/*' -print0 | sort -z)
if [ "$found_sh" -eq 0 ]; then
  echo "    (no shell scripts)"
fi

echo "==> [2/3] node --check (project JavaScript)"
while IFS= read -r -d '' f; do
  node --check "$f" >/dev/null
  echo "    OK $f"
done < <(
  {
    [ -f index.js ] && printf '%s\0' "index.js"
    find src scripts config -name '*.js' -not -path '*/node_modules/*' -print0 2>/dev/null || true
  } | sort -zu
)

echo "==> [3/3] npm test"
npm test

echo
echo "CHECK OK"
