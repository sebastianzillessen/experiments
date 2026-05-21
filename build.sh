#!/usr/bin/env bash
set -euo pipefail

# Build script for Cloudflare Pages.
# Cloudflare Pages settings:
#   Build command:        npm ci && npm run build
#   Build output dir:     _site
#   Root directory:       (leave empty)
#   Production branch:    main
#   NODE_VERSION:         22

rm -rf _site
mkdir -p _site/palermo _site/kinderbetreuung-lohn _site/packliste

cp -r palermo-travel-plan/. _site/palermo/
cp -r kinderbetreuung-lohn/. _site/kinderbetreuung-lohn/

# Build the React app (npm ci is expected to have run at repo root already)
npm -w packliste run build
cp -r packliste/dist/. _site/packliste/

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

echo "Built _site/ (palermo, kinderbetreuung-lohn, packliste, index)"
