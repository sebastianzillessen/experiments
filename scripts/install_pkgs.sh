#!/usr/bin/env bash
# Idempotent installer wired into the SessionStart hook (.claude/settings.json).
# Skips quickly when node_modules is already present.
# Failure is non-fatal — the session continues either way.

set -u

repo_root="$(cd "$(dirname "$0")/.." && pwd)"

install_coop_shopping() {
  local dir="$repo_root/coop-shopping"
  [ -d "$dir" ] || return 0
  [ -f "$dir/package.json" ] || return 0
  if [ -d "$dir/node_modules" ]; then
    return 0
  fi
  echo "[install_pkgs] npm install in coop-shopping/..."
  if ! (cd "$dir" && npm install --no-audit --no-fund) 2>&1; then
    echo "[install_pkgs] npm install failed."
    echo "[install_pkgs] In the cloud sandbox this usually means cdn.playwright.dev is not on the"
    echo "[install_pkgs] custom network allowlist (postinstall downloads Chromium). See"
    echo "[install_pkgs] coop-shopping/NOTES.md for the required allowlist entries."
    return 0
  fi
}

install_coop_shopping

exit 0
