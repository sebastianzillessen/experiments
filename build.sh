#!/usr/bin/env bash
set -euo pipefail

# Build script for Cloudflare Pages.
# Cloudflare Pages settings:
#   Build command:        npm ci && npm run build
#   Build output dir:     _site
#   Root directory:       (leave empty)
#   Production branch:    main
#   NODE_VERSION:         22
#
# Usage:
#   bash build.sh                      # build all experiments (production)
#   bash build.sh kinderbetreuung-lohn # build a single experiment (used by the
#                                        kinderbetreuung-lohn E2E global-setup so
#                                        the test doesn't depend on the packliste
#                                        React build)
#
# Optional env vars (set in Cloudflare Pages project settings):
#   SUPABASE_URL                Supabase project URL
#   SUPABASE_PUBLISHABLE_KEY    Supabase publishable (anon) key
# If unset, falls back to the hardcoded production values below and emits a warning.

TARGET="${1:-all}"

DEFAULT_SUPABASE_URL='https://tbknudbcgaarqixweizj.supabase.co'
DEFAULT_SUPABASE_PUBLISHABLE_KEY='sb_publishable_YHSXK9ryn8RQQe__e3aB2Q_lQo13XaP'

if [ -z "${SUPABASE_URL:-}" ]; then
  echo "WARN: SUPABASE_URL not set, falling back to hardcoded default. Set it in Cloudflare Pages env settings." >&2
  SUPABASE_URL="$DEFAULT_SUPABASE_URL"
fi
if [ -z "${SUPABASE_PUBLISHABLE_KEY:-}" ]; then
  echo "WARN: SUPABASE_PUBLISHABLE_KEY not set, falling back to hardcoded default. Set it in Cloudflare Pages env settings." >&2
  SUPABASE_PUBLISHABLE_KEY="$DEFAULT_SUPABASE_PUBLISHABLE_KEY"
fi

build_palermo() {
  mkdir -p _site/palermo
  cp -r palermo-travel-plan/. _site/palermo/
}

build_hoko() {
  mkdir -p _site/hoko
  cp -r hoko-guest/. _site/hoko/
}

build_kinderbetreuung() {
  mkdir -p _site/kinderbetreuung-lohn
  # Build the React app (npm ci is expected to have run at repo root already).
  npm -w kinderbetreuung-lohn run build
  cp -r kinderbetreuung-lohn/dist/. _site/kinderbetreuung-lohn/
  # Build version for the footer: short commit hash + UTC build time. Prefer
  # git; fall back to the Cloudflare Workers CI commit env var, then "unknown".
  local commit build_time branch app_env
  commit="$(git rev-parse --short HEAD 2>/dev/null || true)"
  if [ -z "$commit" ]; then commit="${WORKERS_CI_COMMIT_SHA:-${CF_PAGES_COMMIT_SHA:-unknown}}"; commit="${commit:0:7}"; fi
  build_time="$(date -u +'%Y-%m-%d %H:%M UTC')"

  # Environment flag for the in-app developer menu: 'production' only on the main
  # branch, 'preview' for every other (branch/commit preview) deploy. Prefer the
  # Cloudflare CI branch env vars, fall back to the local git branch.
  branch="${WORKERS_CI_BRANCH:-${CF_PAGES_BRANCH:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)}}"
  if [ "$branch" = "main" ]; then app_env="production"; else app_env="preview"; fi

  # Generate config.js with env-var values (JSON-escaped via Python).
  cat > _site/kinderbetreuung-lohn/config.js <<EOF
window.__APP_CONFIG = {
  url: $(printf '%s' "$SUPABASE_URL" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),
  key: $(printf '%s' "$SUPABASE_PUBLISHABLE_KEY" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')
};
window.__APP_VERSION = { commit: $(printf '%s' "$commit" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'), builtAt: $(printf '%s' "$build_time" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))') };
window.__APP_ENV = $(printf '%s' "$app_env" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))');
EOF
}

build_packliste() {
  mkdir -p _site/packliste
  # Build the React app (npm ci is expected to have run at repo root already).
  npm -w packliste run build
  cp -r packliste/dist/. _site/packliste/
}

write_root_index() {
  cat > _site/index.html <<'HTML'
<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"><title>Experiments</title>
<style>body{font-family:system-ui,sans-serif;max-width:560px;margin:60px auto;padding:0 20px;color:#1f2933;line-height:1.6}
h1{color:#1a3a5c}a{color:#2e6ea6;text-decoration:none;font-weight:600}a:hover{text-decoration:underline}
ul{list-style:none;padding:0}li{padding:10px 0;border-bottom:1px solid #e1e6eb}.muted{color:#6b7480;font-size:14px}</style>
</head><body>
<h1>Experiments</h1>
<ul>
  <li><a href="packliste/">Packliste</a><div class="muted">Familien-Packliste mit Bedingungen und Waschmaschinen-Logik</div></li>
  <li><a href="palermo/">Palermo Urlaubshandbuch</a><div class="muted">Reisefuehrer Palermo (April 2026)</div></li>
  <li><a href="kinderbetreuung-lohn/">Lohnabrechnung Kinderbetreuung</a><div class="muted">Vereinfachte Abrechnung Kanton Zuerich</div></li>
</ul>
</body></html>
HTML
}

rm -rf _site
mkdir -p _site

case "$TARGET" in
  kinderbetreuung-lohn) build_kinderbetreuung ;;
  palermo)              build_palermo ;;
  hoko)                 build_hoko ;;
  packliste)            build_packliste ;;
  all)
    build_palermo
    build_hoko
    build_kinderbetreuung
    build_packliste
    write_root_index
    ;;
  *)
    echo "Unknown build target: $TARGET (expected: all | kinderbetreuung-lohn | palermo | hoko | packliste)" >&2
    exit 1
    ;;
esac

echo "Built _site/ (target=$TARGET)"
