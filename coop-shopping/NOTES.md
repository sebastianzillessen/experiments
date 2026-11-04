# Coop-Shopping Automatisierung — Stand & nächste Schritte

Notizen für die Wiederaufnahme in einer neuen Session.

## Was bisher gebaut wurde

`coop-shopping/shop.js` — Playwright-Skript mit drei Modi:

- **Interaktiv** (Standard, `npm start -- "Milch:2" "Brot"`): pro Artikel werden die Top N Suchtreffer angezeigt und der Nutzer wählt. Danach Bestätigung, dann werden die ausgewählten Produkte über ihre Produkt-Detailseite in den Warenkorb gelegt. Login per persistentem Profil (`./coop-profile`).
- **Non-interaktiv** (`--no-interactive` / `--yes`): immer erstes Suchergebnis, kein Prompt.
- **Dry-Run** (`--dry-run`): listet pro Suchbegriff die Top N Treffer (Name, Preis, URL). Kein Login nötig, dient als Selektor-Validation.

Flags: `--dry-run`, `--no-interactive` (alias `--yes`), `--headless`, `--max=N`.

Auto-Install: `.claude/settings.json` + `scripts/install_pkgs.sh` (Repo-Root) installieren die Abhängigkeiten beim Session-Start automatisch, sofern noch nicht vorhanden.

## Stand der Sandbox-Tests (May 2026)

- **`cdn.playwright.dev` / `playwright.azureedge.net`**: ✅ erreichbar, Chromium-Download (~290 MB) funktioniert.
- **`www.coop.ch`**: erreichbar, aber **DataDome blockt die Cloud-IP** mit HTTP 403 + CAPTCHA-Seite ("Der Zugriff ist vorübergehend eingeschränkt … es befindet sich ein Roboter im selben Netzwerk (IP 34.72.174.153) wie Sie").
  - Block ist IP-basiert am Edge, *bevor* JS läuft → playwright-stealth / UA-Spoofing hilft nicht.
  - Auch JSON-API-Routen (`/api/...`, `/de/search/suggest`) liefern die CAPTCHA-JSON-Antwort.
  - Konsequenz: Dry-Run, Selektor-Validation und Cart-Füllen sind aus dieser Sandbox **nicht** testbar.
- **`ignoreHTTPSErrors: true`** ist im Skript gesetzt, weil der Sandbox-MITM sonst `ERR_CERT_AUTHORITY_INVALID` wirft.

## Wie es lokal funktioniert

```bash
git checkout claude/automate-coop-shopping-QMiiL
cd coop-shopping
npm install                                            # lädt Chromium ~290 MB
npm start -- --dry-run "Milch" "Brot"                  # Selektor-Check (von Heim-IP, nicht von der Sandbox)
npm start -- "Milch:3" "Mineral:2" "Hackfleisch"       # interaktive Auswahl, dann Cart
npm start -- --no-interactive "Milch:3"                # ohne Prompt, immer erstes Ergebnis
```

Beim ersten Lauf manuell einloggen (inkl. 2FA), dann im Terminal ENTER. Ab dann läuft Login automatisch via `./coop-profile`.

## Bekannte Risiken / offene Punkte

- **Selektoren sind weiterhin ungetestet** gegen das echte coop.ch (siehe oben — DataDome). Mehrere Locator-Strategien als Fallback eingebaut in:
  - `acceptCookies()` — Cookie-Banner
  - `isLoggedIn()` — Login-Marker
  - `addToCartFromProductPage()` — Add-to-Cart-Button auf Produktseite
  - `extractProducts()` — DOM-Walking für Produkt-Tiles
- **Add-to-Cart geht über die Produkt-Detailseite** (nicht mehr über den Such-Tile). Das ist robuster gegen unterschiedliche Tile-Layouts, klickt aber `qty` mal denselben Button — falls coop.ch ein Mengen-Selektor-Widget hat, ist das eine offene Optimierung.
- **Bot-Detection / Cloudflare / DataDome**: auch lokal möglich, wenn coop.ch automatisierten Traffic identifiziert. Bei Problemen: ohne `--headless` laufen lassen, Profil "warmlaufen" lassen.

## Auto-Install Hook

- `.claude/settings.json` → `SessionStart` Hook ruft `bash scripts/install_pkgs.sh` auf.
- `scripts/install_pkgs.sh` ist idempotent: prüft `node_modules` und führt nur dann `npm install --no-audit --no-fund` aus.
- Fehlschläge sind non-fatal (Skript exitet 0), damit die Session nicht abbricht falls die Allowlist eingeschränkt ist.

## Weitere mögliche Erweiterungen (nicht angefangen)

- **BIO-Filter**: vor der Auswahl-Anzeige Treffer mit BIO-Tag bevorzugen (z. B. nach `Naturaplan`/`bio` im Namen sortieren). Erfordert Treffer-Daten — also blockiert durch DataDome aus der Sandbox.
- **Mengen-/Größen-Parsing**: aus dem Such-Query "400g Hackfleisch" Größe extrahieren und im Treffer-Tile passend matchen, ansonsten nächst-höhere Größe wählen.
- **YAML-Einkaufsliste** als Alternative zu CLI-Args (`shopping-list.yaml` mit Marken/Kategorien).
- **GitHub Action mit `workflow_dispatch`**: setzt voraus, dass Login-State (`storageState.json`) vorher lokal erzeugt und als Secret hinterlegt wird. Headless im CI, Screenshot des Warenkorbs als Artifact, manueller Checkout danach via Browser (Cart persistiert server-seitig im Coop-Konto). Riskant wegen Bot-Detection auf GitHub-IPs.

## Referenzen

- Sandbox-Docs: https://code.claude.com/docs/en/claude-code-on-the-web#network-access
- Branch: `claude/automate-coop-shopping-QMiiL`
