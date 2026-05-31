import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Räumt LocalStorage einmalig vor dem allerersten Page-Render auf. Wir
 * setzen den State vor der ersten React-Render-Hook-Ausführung weg —
 * sonst persistiert ggf. das vorherige Testpaar (oder eine vorherige
 * Worker-Session).
 *
 * WICHTIG: das addInitScript wird einmalig pro Page registriert; es würde
 * sonst bei jedem `page.goto()` erneut clearen — wir verhindern das per
 * Sentinel-Key im sessionStorage (lebt nur in der Page, gewichts­los).
 *
 * Verwendung: in jedem Spec im `beforeEach`-Hook: `await freshPage(page)`.
 */
export async function freshPage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      // Sentinel im sessionStorage — wird auch über goto/navigation
      // beibehalten, aber pro neuem Page-Lebenszyklus (= pro Test) reset.
      const SENTINEL = "__packliste_test_cleared__";
      if (window.sessionStorage.getItem(SENTINEL) !== "1") {
        window.localStorage.clear();
        window.sessionStorage.setItem(SENTINEL, "1");
      }
    } catch {
      /* ignore */
    }
  });
}

export interface SetupNewFamilyOptions {
  /** Login-Name. Default "Sebastian". */
  userName?: string;
  /** Login-Email. Default "test@example.com". */
  email?: string;
  /** Familienname. Default "Familie Test". */
  familyName?: string;
  /** Personen-Liste. Default ["Anna", "Bob"]. */
  persons?: string[];
  /**
   * Preset-Key (sichtbarer Label-Text):
   * "Leer starten" | "Strand-Wochenende" | "Skiferien" | "Städtetrip".
   * Default "Leer starten" — schnellster Pfad ohne Seed-Items.
   */
  preset?:
    | "Leer starten"
    | "Strand-Wochenende"
    | "Skiferien"
    | "Städtetrip";
}

/**
 * Durchläuft AuthGate → CreateFamilyScreen → landet im Trips-Tab.
 *
 * Erwartet, dass freshPage(page) bereits gelaufen ist (LocalStorage leer).
 */
export async function setupNewFamily(
  page: Page,
  opts: SetupNewFamilyOptions = {},
): Promise<void> {
  const {
    userName = "Sebastian",
    email = "test@example.com",
    familyName = "Familie Test",
    persons = ["Anna", "Bob"],
    preset = "Leer starten",
  } = opts;

  await page.goto("/packliste/");

  // --- AuthGate ---
  await page.getByRole("button", { name: "Neu anlegen" }).click();
  await page.getByLabel("Dein Name").fill(userName);
  await page.getByLabel("E-Mail").fill(email);
  await page.getByRole("button", { name: "Anmelden" }).click();

  // --- Schritt 1 ---
  await expect(page.getByText("Schritt 1 von 3")).toBeVisible();
  await page.getByLabel("Familienname").fill(familyName);
  await page.getByRole("button", { name: "Weiter" }).click();

  // --- Schritt 2 ---
  await expect(page.getByText("Schritt 2 von 3")).toBeVisible();
  await page.getByLabel("Personen").fill(persons.join("\n"));
  await page.getByRole("button", { name: "Weiter" }).click();

  // --- Schritt 3 ---
  await expect(page.getByText("Schritt 3 von 3")).toBeVisible();
  await page.getByText(preset, { exact: true }).click();
  await page.getByRole("button", { name: "Familie anlegen" }).click();

  await expect(
    page.getByRole("button", { name: "Neuer Trip" }),
  ).toBeVisible();
}

export interface CreateTripOptions {
  name: string;
  days: number;
  /** Conditions zusätzlich zum default-vorgewählten "Standard". */
  conditions?: string[];
  hasWasher?: boolean;
  washInterval?: number;
}

/**
 * Öffnet das TripCreateModal, füllt die Felder und submitted. Erwartet,
 * dass danach die Trip-Detail-Seite sichtbar ist.
 */
export async function createTrip(
  page: Page,
  opts: CreateTripOptions,
): Promise<void> {
  const {
    name,
    days,
    conditions = [],
    hasWasher = false,
    washInterval,
  } = opts;

  await page.getByRole("button", { name: "Neuer Trip" }).click();

  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();

  await modal.getByLabel("Trip-Name").fill(name);

  // Tage via Stepper-Input
  const daysInput = modal.getByRole("spinbutton", { name: "Anzahl Tage" });
  await daysInput.fill(String(days));
  await daysInput.blur();

  for (const cond of conditions) {
    // Condition-Chips zeigen "Emoji Label" — wir matchen per Substring.
    await modal.getByRole("button", { name: new RegExp(cond, "i") }).click();
  }

  if (hasWasher) {
    // Checkbox-Label klicken (Radix-Checkbox-Wrapper). Label-Text ist
    // "🧺 Waschmaschine verfügbar".
    await modal.getByText("Waschmaschine verfügbar").click();
    if (washInterval !== undefined) {
      const w = modal.getByRole("spinbutton", {
        name: "Waschintervall in Tagen",
      });
      await w.fill(String(washInterval));
      await w.blur();
    }
  }

  await modal.getByRole("button", { name: "Trip anlegen" }).click();
  await page.waitForURL(/\/#\/trip\//);
}

/**
 * Findet die ItemRow (innerster Container) zu einem Item-Namen. Strategie:
 * der QtyStepper-Wrap ist DOM-Sibling des Item-Namens innerhalb der
 * ItemRow. Wir gehen vom "Mehr"-Button (eindeutig pro Row) 2 Levels hoch
 * (Stepper → Wrap → ItemRow), filtern dann auf "enthält $itemName".
 *
 * Locator-Strategie via XPath-ähnliche `..`-Navigation ist robust gegen
 * styled-components-Klassen-Namen.
 */
export function tripItemRow(page: Page, itemName: string): Locator {
  // Beobachtung: in der ItemRow stehen sowohl:
  //  - QtyStepper (mit Button aria-label "Mehr")
  //  - Stack > Row > ItemName ($packed)
  // Wir nutzen page.locator(".. > ..") nicht direkt — Playwright kann via
  // `filter({has, hasText})` auf den engsten Wrapper schließen. Trick:
  // wir nehmen die Box, deren Text minimal ist, indem wir den Namen
  // möglichst spezifisch matchen. Beste Lösung: matchen über den
  // QtyStepper-Wrap-Sibling.
  // Implementation: alle Buttons mit aria-label "Mehr" finden → 2 ebenen
  // hoch zur ItemRow, dann filter auf den Item-Namen.
  return page
    .getByRole("button", { name: "Mehr", exact: true })
    .locator("xpath=ancestor::*[2]")
    .filter({ hasText: itemName });
}

/**
 * Konvenienz-Locator für den "X/Y"-Text-Block innerhalb einer Item-Row.
 */
export function qtyText(row: Locator, packed: number, total: number): Locator {
  return row.getByText(`${packed}/${total}`, { exact: true });
}
