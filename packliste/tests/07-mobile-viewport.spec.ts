import { expect, test } from "@playwright/test";
import { createTrip, freshPage, setupNewFamily } from "./helpers";

// Wir setzen das mobile Viewport für ALLE Tests in dieser Datei. Bottom-
// Nav ist erst < 600px sichtbar, also reicht 390 (iPhone-Standardbreite).
test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await freshPage(page);
});

test("Mobile: BottomNav statt TopTab, Touch-Targets, Stepper-Overflow", async ({
  page,
}) => {
  await setupNewFamily(page, {
    familyName: "Familie Mobile",
    persons: ["Anna", "Bob"],
    preset: "Strand-Wochenende",
  });

  // --- BottomNav sichtbar, TopTabBar versteckt ---
  // BottomNav: 4 Tabs als NavLinks (Backpack/ClipboardList/Users/Info).
  // Wir nutzen den Text-Content der Tabs.
  const bottomTrips = page.getByRole("link", { name: /Trips/ });
  await expect(bottomTrips.last()).toBeVisible();
  // Die TopTabBar wird per @media (max-width: 600px) display:none gesetzt.
  // Auf der mobilen Viewport ist sie nicht "visible".
  // Anstatt das fragil per CSS-Compute zu testen, prüfen wir, dass
  // BottomNav am unteren Rand der Viewport sitzt.
  const navBox = await bottomTrips.last().boundingBox();
  expect(navBox).not.toBeNull();
  // BottomNav y-Position sollte im unteren Drittel sein (> 600).
  expect(navBox!.y).toBeGreaterThan(600);

  // --- Trip anlegen, dann mobile-spezifische Checks ---
  await createTrip(page, {
    name: "Mobile-Trip",
    days: 5,
    conditions: ["Sonne", "Schwimmen"],
  });

  // --- Person-Chips horizontal scrollbar ---
  // ChipsScrollable hat overflow-x:auto. Wir prüfen, dass mind. 2 Chips
  // im DOM sind. "Alle"-Chip enthält "Alle 0/N" — wir nutzen "Alle " mit
  // Slash-Zahl, um den QtyStepper-Button "Alle N einpacken" abzugrenzen.
  const allChip = page.getByRole("button", { name: /^Alle\s+\d+\/\d+$/ });
  await expect(allChip).toBeVisible();
  const annaChip = page.getByRole("button", { name: /^Anna/ });
  await expect(annaChip).toBeVisible();

  // --- Touch-Targets: Stepper-Buttons mind. 44×44 ---
  // QtyStepper-Button "Mehr" — wir nehmen den ersten sichtbaren.
  const mehrBtn = page.getByRole("button", { name: "Mehr", exact: true }).first();
  await expect(mehrBtn).toBeVisible();
  const box = await mehrBtn.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);

  // --- Vorlage: "Alle X Tage"-Stepper funktioniert + overflowed nicht ---
  await page.goto("/packliste/#/vorlage");
  await page.getByLabel("Name").fill("Pflaster");
  await page.getByLabel("Kategorie").fill("Medikamente");
  await page.getByRole("button", { name: "Alle X Tage" }).click();
  // Tages-Intervall-Stepper sichtbar
  const interval = page.getByRole("spinbutton", { name: "Tages-Intervall" });
  await expect(interval).toBeVisible();
  // Bounding-Box ≤ Viewport-Width (kein Overflow)
  const intervalBox = await interval.boundingBox();
  expect(intervalBox).not.toBeNull();
  expect(intervalBox!.x + intervalBox!.width).toBeLessThanOrEqual(390 + 1);
  // Funktional: + Button drücken → Wert sollte hochgehen
  await interval.fill("3");
  await interval.blur();
  await expect(interval).toHaveValue("3");
  // "Alle X Tage"-Field ist ein <label> — wir greifen den "mehr"-Button
  // innerhalb dieses Labels.
  await page
    .locator("label")
    .filter({ hasText: "Alle X Tage" })
    .getByRole("button", { name: "mehr", exact: true })
    .click();
  await expect(interval).toHaveValue("4");
});
