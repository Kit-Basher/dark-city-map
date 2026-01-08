#!/usr/bin/env bash
set -euo pipefail

start_dir="${1:-$(pwd)}"

find_git_root() {
  local dir="$1"
  while true; do
    if [ -d "$dir/.git" ]; then
      echo "$dir"
      return 0
    fi
    if [ "$dir" = "/" ]; then
      return 1
    fi
    dir="$(dirname "$dir")"
  done
}

git_root=""
if git_root="$(find_git_root "$start_dir")"; then
  :
else
  echo "Not inside a git repo (no .git found above: $start_dir)" >&2
  echo "Tip: run this from one of:" >&2
  echo "  dark-city-game" >&2
  echo "  dark-city-bot" >&2
  echo "  dark-city-map-web" >&2
  exit 2
fi

repo_name="$(basename "$git_root")"

if ! git -C "$git_root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Found .git at $git_root but git does not consider it a work tree" >&2
  exit 3
fi

branch="$(git -C "$git_root" branch --show-current 2>/dev/null || true)"
origin_url="$(git -C "$git_root" remote get-url origin 2>/dev/null || true)"

printf "Repo:   %s\n" "$repo_name"
printf "Path:   %s\n" "$git_root"
printf "Branch: %s\n" "${branch:-<detached>}"
printf "Origin: %s\n" "${origin_url:-<none>}"

expected_origin=""
case "$repo_name" in
  dark-city-game)
    expected_origin="https://github.com/Kit-Basher/dark-city-game.git"
    ;;
  dark-city-bot)
    expected_origin="https://github.com/Kit-Basher/Dark-City-Bot.git"
    ;;
  dark-city-map-web)
    expected_origin="https://github.com/Kit-Basher/dark-city-map.git"
    ;;
  *)
    expected_origin=""
    ;;
esac

if [ -n "$expected_origin" ]; then
  if [ -z "$origin_url" ]; then
    echo "ERROR: origin remote is missing (expected: $expected_origin)" >&2
    exit 4
  fi
  if [ "$origin_url" != "$expected_origin" ]; then
    echo "ERROR: origin remote mismatch" >&2
    echo "  expected: $expected_origin" >&2
    echo "  actual:   $origin_url" >&2
    exit 5
  fi
fi

if [ -n "$branch" ] && [ "$branch" != "main" ]; then
  echo "WARNING: you are not on main (current: $branch)" >&2
  echo "If this is intentional, continue. If not, switch branches before committing." >&2
fi

if git -C "$git_root" status --porcelain | grep -q .; then
  echo "Working tree: dirty" >&2
else
  echo "Working tree: clean" >&2
fi

exit 0
