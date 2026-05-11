#!/usr/bin/env bash
set -euo pipefail

# Build script for Cloudflare Pages.
# Cloudflare Pages settings:
#   Build command:        bash build.sh
#   Build output dir:     _site
#   Root directory:       (leave empty)
#   Production branch:    main
#
# Optional env vars (set in Cloudflare Pages project settings):
#   SUPABASE_URL                Supabase project URL
#   SUPABASE_PUBLISHABLE_KEY    Supabase publishable (anon) key
# If unset, falls back to the hardcoded production values below and emits a warning.

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

rm -rf _site
mkdir -p _site/palermo _site/kinderbetreuung-lohn

cp -r palermo-travel-plan/. _site/palermo/

# Whitelist the deployed assets only — the subfolder also holds tests, package.json,
# supabase/, node_modules/ etc. that must not ship to Cloudflare Pages.
cp kinderbetreuung-lohn/index.html \
   kinderbetreuung-lohn/app.js \
   kinderbetreuung-lohn/styles.css \
   _site/kinderbetreuung-lohn/

# Generate config.js with env-var values (JSON-escaped via Python, present on Cloudflare builders).
cat > _site/kinderbetreuung-lohn/config.js <<EOF
window.__APP_CONFIG = {
  url: $(printf '%s' "$SUPABASE_URL" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),
  key: $(printf '%s' "$SUPABASE_PUBLISHABLE_KEY" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')
};
EOF

cat > _site/index.html <<'HTML'
<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"><title>Experiments</title>
<style>body{font-family:system-ui,sans-serif;max-width:560px;margin:60px auto;padding:0 20px;color:#1f2933;line-height:1.6}
h1{color:#1a3a5c}a{color:#2e6ea6;text-decoration:none;font-weight:600}a:hover{text-decoration:underline}
ul{list-style:none;padding:0}li{padding:10px 0;border-bottom:1px solid #e1e6eb}.muted{color:#6b7480;font-size:14px}</style>
</head><body>
<h1>Experiments</h1>
<ul>
  <li><a href="palermo/">Palermo Urlaubshandbuch</a><div class="muted">Reisefuehrer Palermo (April 2026)</div></li>
  <li><a href="kinderbetreuung-lohn/">Lohnabrechnung Kinderbetreuung</a><div class="muted">Vereinfachte Abrechnung Kanton Zuerich</div></li>
</ul>
</body></html>
HTML

echo "Built _site/ (palermo, kinderbetreuung-lohn, index)"
