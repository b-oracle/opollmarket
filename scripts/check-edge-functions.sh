#!/usr/bin/env bash
# Type-check every Supabase Edge Function with `deno check`.
# Reports exact failing file:line and exits non-zero on the first failure batch.
#
# Usage:
#   bash scripts/check-edge-functions.sh           # check all functions
#   bash scripts/check-edge-functions.sh fn1 fn2   # check specific functions
set -uo pipefail

FUNCTIONS_DIR="supabase/functions"
if [ ! -d "$FUNCTIONS_DIR" ]; then
  echo "❌ $FUNCTIONS_DIR not found. Run from repo root." >&2
  exit 1
fi

if ! command -v deno >/dev/null 2>&1; then
  echo "❌ deno not installed. Install: https://deno.land/" >&2
  exit 1
fi

# Collect targets (skip _shared and any folder without index.ts)
declare -a TARGETS=()
if [ "$#" -gt 0 ]; then
  for name in "$@"; do
    f="$FUNCTIONS_DIR/$name/index.ts"
    if [ -f "$f" ]; then
      TARGETS+=("$f")
    else
      echo "⚠️  Skipping $name — no $f"
    fi
  done
else
  while IFS= read -r -d '' f; do
    TARGETS+=("$f")
  done < <(find "$FUNCTIONS_DIR" -mindepth 2 -maxdepth 2 -name index.ts -not -path "*/_shared/*" -print0 | sort -z)
fi

total=${#TARGETS[@]}
if [ "$total" -eq 0 ]; then
  echo "No edge functions to check."
  exit 0
fi

echo "🔎 Type-checking $total edge function(s) with deno check..."
echo

declare -a FAILED=()
declare -a FAIL_OUTPUTS=()

i=0
for f in "${TARGETS[@]}"; do
  i=$((i + 1))
  name="$(basename "$(dirname "$f")")"
  printf "[%2d/%2d] %-45s " "$i" "$total" "$name"

  # `deno check` prints "TS####: ... at file:line:col" — perfect for CI annotations.
  out=$(deno check --quiet --no-lock "$f" 2>&1)
  rc=$?

  if [ $rc -eq 0 ]; then
    echo "✅"
  else
    echo "❌"
    FAILED+=("$name")
    FAIL_OUTPUTS+=("$out")
  fi
done

echo
if [ "${#FAILED[@]}" -eq 0 ]; then
  echo "✅ All $total edge function(s) type-check cleanly."
  exit 0
fi

echo "═══════════════════════════════════════════════════════════"
echo "❌ ${#FAILED[@]} of $total edge function(s) failed type-check:"
echo "═══════════════════════════════════════════════════════════"
for idx in "${!FAILED[@]}"; do
  name="${FAILED[$idx]}"
  out="${FAIL_OUTPUTS[$idx]}"
  echo
  echo "── $name ──────────────────────────────────────────────"
  echo "$out"
  # Emit GitHub Actions annotations so failures show inline on PRs.
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    while IFS= read -r line; do
      # Match: "TS####: message ... at file:///path/to/file.ts:LINE:COL"
      if [[ "$line" =~ ^(TS[0-9]+).*$ ]]; then
        msg="$line"
      fi
      if [[ "$line" =~ at[[:space:]]+file://([^:]+):([0-9]+):([0-9]+) ]]; then
        file="${BASH_REMATCH[1]}"
        ln="${BASH_REMATCH[2]}"
        col="${BASH_REMATCH[3]}"
        # Make path repo-relative
        rel="${file#${PWD}/}"
        echo "::error file=${rel},line=${ln},col=${col}::${msg:-Type error}"
      fi
    done <<< "$out"
  fi
done

exit 1
