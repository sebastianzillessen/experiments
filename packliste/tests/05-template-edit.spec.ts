import { expect, test } from "@playwright/test";
import { createTrip, freshPage, setupNewFamily } from "./helpers";

test.beforeEach(async ({ page }) => {
  await freshPage(page);
});

test("Vorlage: Item anlegen + bearbeiten + löschen + Kategorie-Icon", async ({
  page,
}) => {
  await setupNewFamily(page, {
    familyName: "Familie Vorlage",
    persons: ["Anna", "Bob"],
    preset: "Leer starten",
  });

  // Vorlage-Tab öffnen
  await page.goto("/packliste/#/vorlage");
  await expect(page.getByRole("heading", { name: "Familie Vorlage" })).toBeVisible();

  // --- 1) Neues Item anlegen via ItemForm ---
  await page.getByLabel("Name").fill("Skihandschuh");
  await page.getByLabel("Kategorie").fill("Accessoires");
  // Default-Frequenz ist "Pro Trip" → wir wechseln auf "Alle X Tage"
  await page.getByRole("button", { name: "Alle X Tage" }).click();
  // Tages-Intervall auf 3
  const interval = page.getByRole("spinbutton", { name: "Tages-Intervall" });
  await interval.fill("3");
  await interval.blur();
  // Conditions: "Kälte" toggeln
  await page.getByRole("button", { name: /Kälte/ }).click();
  // Multi-Person: Anna + Bob
  await page.getByRole("button", { name: /^Anna/ }).first().click();
  await page.getByRole("button", { name: /^Bob/ }).first().click();
  await page.getByRole("button", { name: "Hinzufügen" }).click();

  // --- 2) Item in der Liste sichtbar (mit "alle 3 Tage"-Badge) ---
  await expect(page.getByText("Skihandschuh")).toBeVisible();
  await expect(page.getByText("alle 3 Tage").first()).toBeVisible();

  // --- 3) Edit-Modal: Waschbar-Flag toggeln ---
  // Es können mehrere "Bearbeiten"-Buttons existieren (pro Item). Wir
  // greifen den nächst-liegenden über das Item-Card.
  const itemCard = page.locator("div").filter({ hasText: "Skihandschuh" }).filter({ has: page.getByText("alle 3 Tage") }).first();
  await itemCard.getByRole("button", { name: "Bearbeiten" }).first().click();
  const editModal = page.getByRole("dialog");
  await expect(editModal).toBeVisible();
  await expect(editModal.getByRole("heading", { name: "Item bearbeiten" })).toBeVisible();
  // Waschbar-Checkbox toggeln. Der Label-Text ist "🧺 Waschbar".
  await editModal.getByText("Waschbar", { exact: false }).first().click();
  await editModal.getByRole("button", { name: "Speichern" }).click();
  await expect(editModal).toBeHidden();
  // Nach Save: 🧺-Icon sichtbar in der Item-Card
  await expect(
    page.locator("div").filter({ hasText: "Skihandschuh" }).getByTitle("Waschbar").first(),
  ).toBeVisible();

  // --- 4) Kategorien-Card aufklappen + Icon ändern ---
  // Card ist eingeklappt by-default → Toggle "Aufklappen"
  await page.getByRole("button", { name: "Aufklappen" }).click();
  // Bearbeiten-Button der Accessoires-Kategorie. CategoryRow enthält
  // einen <span> mit Text "Accessoires" und einen Bearbeiten-Button.
  // Wir gehen vom span hoch zur Row.
  const catRow = page
    .locator("span", { hasText: /^Accessoires$/ })
    .locator("xpath=ancestor::*[1]");
  await catRow.getByRole("button", { name: "Bearbeiten" }).click();
  const catModal = page.getByRole("dialog");
  await expect(catModal.getByRole("heading", { name: "Kategorie bearbeiten" })).toBeVisible();
  // Icon-Input mit "🧳" überschreiben (manuell, weil das Grid in Webkit
  // ggf. langsamer reagiert).
  const iconInput = catModal.getByLabel("Aktuelles Icon (frei eingeben)");
  await iconInput.fill("🧳");
  await catModal.getByRole("button", { name: "Speichern" }).click();
  await expect(catModal).toBeHidden();

  // --- 5) Icon-Verifikation im Trip-Detail ---
  // Trip anlegen mit "Kälte"-Condition, damit das Skihandschuh-Item rein
  // kommt. Anschließend prüfen wir, dass die Category-Chip den neuen
  // Emoji enthält.
  await page.goto("/packliste/");
  await createTrip(page, {
    name: "Ski-Trip",
    days: 5,
    conditions: ["Kälte"],
  });
  // Skihandschuh ist 1x pro Person × 2 = 2 Rows. CategoryChip rendert
  // Icon (aria-hidden) und Label in zwei Spans — wir prüfen direkt das
  // Icon-Vorkommen im Trip-Detail. Auf mobilen Viewports versteckt der
  // Label-Span sich per @media, das Icon-Span bleibt aber sichtbar.
  await expect(page.getByText("🧳").first()).toBeVisible();

  // --- 6) Item löschen via Vorlage-Tab ---
  await page.goto("/packliste/#/vorlage");
  // Confirm-Dialog umgehen mit page.once("dialog")
  page.once("dialog", (d) => d.accept());
  await page
    .locator("div")
    .filter({ hasText: "Skihandschuh" })
    .filter({ has: page.getByText("alle 3 Tage") })
    .first()
    .getByRole("button", { name: "Löschen" })
    .first()
    .click();
  await expect(page.getByText("Skihandschuh")).toHaveCount(0);
});
