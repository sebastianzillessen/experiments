# Coop-Shopping Automatisierung — Stand & nächste Schritte

Notizen für die Wiederaufnahme in einer neuen Session.

## Was bisher gebaut wurde

`coop-shopping/shop.js` — Playwright-Skript mit zwei Modi:

- **Normal** (`npm start -- "Milch:2" "Brot"`): Füllt den Warenkorb auf coop.ch, braucht Login. Nutzt `chromium.launchPersistentContext('./coop-profile')` damit die Session (inkl. 2FA) zwischen Läufen erhalten bleibt. Stoppt am Warenkorb, kein automatischer Checkout.
- **Dry-Run** (`npm start -- --dry-run "Milch"`): Listet pro Suchbegriff die Top N Treffer (Name, Preis, URL) aus der Suchergebnis-Seite. Kein Login nötig. Dient als Selektor-Validation.

Flags: `--dry-run`, `--headless`, `--max=N`.

## Warum es hier in der Cloud-Sandbox nicht testbar ist

1. **Netzwerk-Allowlist blockiert relevante Hosts.** Aktueller Status ("Trusted"):
   - `cdn.playwright.dev` → 403 "Host not in allowlist" → Chromium-Download schlägt fehl
   - `www.coop.ch` → 403 "Host not in allowlist"
2. **Kein System-Chromium installiert.**
3. **Kein Display** → interaktiver Login mit 2FA unmöglich.
4. **Ephemerer Container** → `coop-profile/` (persistente Session) überlebt Inaktivität nicht.

## Option A: Sandbox erweitern (für Dry-Run-Tests hier)

Im Cloud-Environment auf **Custom** umstellen (UI: Cloud-Icon → Environment editieren), "Also include default list" anhaken, plus folgende Hosts eintragen:

```
cdn.playwright.dev
www.coop.ch
*.coop.ch
*.scene7.com
```

Optional als **Setup script** im Environment:

```bash
#!/bin/bash
cd "$CLAUDE_PROJECT_DIR"/coop-shopping && npm install
npx --yes playwright install-deps chromium
```

Damit funktioniert in der Sandbox:
- ✅ Dry-Run (`--dry-run --headless`) → echte Produkt-Liste von coop.ch
- ❌ Echtes Cart-Füllen mit Login (kein Display, kein 2FA, Session ephemer, Bot-Detection auf Cloud-IPs härter)

## Option B: Lokal beim Nutzer (für echtes Cart-Füllen)

Praktikabler Weg für die richtige Anwendung. Voraussetzung: Node ≥ 18.

```bash
git checkout claude/automate-coop-shopping-QMiiL
cd coop-shopping
npm install                                            # lädt Chromium ~150 MB
npm start -- --dry-run "Milch" "Brot"                  # Selektor-Check
npm start -- "Milch:2" "Brot" "Bananen:3"              # echter Lauf, Browser öffnet sich
```

Beim ersten Lauf manuell einloggen (inkl. 2FA), dann im Terminal ENTER. Ab dann läuft Login automatisch via `./coop-profile`.

## Bekannte Risiken / offene Punkte

- **Selektoren sind ungetestet** gegen die echte coop.ch. Mehrere Locator-Strategien als Fallback eingebaut (`button:has-text(...)`, `[aria-label*=...]`, `[data-testid*=...]`), aber wenn die Seite umstrukturiert wurde, muss angepasst werden in:
  - `acceptCookies()` — Cookie-Banner
  - `isLoggedIn()` — Login-Marker
  - `addOneToCart()` — Add-to-Cart-Button auf Suchergebnis-Seite
  - `extractProducts()` — DOM-Walking für Produkt-Tiles
- **Erstes Suchergebnis wird genommen** → bei mehrdeutigen Begriffen evtl. falsches Produkt. Dry-Run vorher nutzen.
- **Cloudflare/Bot-Detection** möglich. Headless = riskanter. Bei Problemen: ohne `--headless` laufen lassen, Profil "warmlaufen" lassen.

## Frage an den Nutzer (offen)

Wurde gestellt am Ende des letzten Turns, noch nicht beantwortet:

> Soll ich parallel ein `scripts/install_pkgs.sh` + `.claude/settings.json` SessionStart-Hook ins Repo committen, damit beim nächsten Sandbox-Start Playwright automatisch bereit ist?

Wenn ja: Hook anlegen, der `CLAUDE_CODE_REMOTE=true` prüft und dann `npm install` + `playwright install-deps chromium` läuft. Setzt voraus, dass Custom-Allowlist konfiguriert ist (sonst scheitert der Download).

## Weitere mögliche Erweiterungen (nicht angefangen)

- **YAML-Einkaufsliste** als Alternative zu CLI-Args (`shopping-list.yaml` mit Marken/Kategorien).
- **GitHub Action mit `workflow_dispatch`**: setzt voraus, dass Login-State (`storageState.json`) vorher lokal erzeugt und als Secret hinterlegt wird. Headless im CI, Screenshot des Warenkorbs als Artifact, manueller Checkout danach via Browser (Cart persistiert server-seitig im Coop-Konto). Riskant wegen Bot-Detection auf GitHub-IPs.
- **Produktauswahl mit Confirmation**: erst Dry-Run-Liste zeigen, Nutzer wählt aus, dann Add-to-Cart — statt blind erstes Ergebnis.

## Referenzen

- Sandbox-Docs: https://code.claude.com/docs/en/claude-code-on-the-web#network-access
- Branch: `claude/automate-coop-shopping-QMiiL`
- Commits: 3 (Initial Skript, Dry-Run-Modus, package-lock.json)
