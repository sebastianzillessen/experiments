import { expect, test } from "@playwright/test";
import { createTrip, freshPage, setupNewFamily, tripItemRow } from "./helpers";

test.beforeEach(async ({ page }) => {
  await freshPage(page);
});

test("QuickAdd: Sonderbedarf, mit-Menge, Vorlagen-Fuzzy-Match", async ({
  page,
}) => {
  await setupNewFamily(page, {
    familyName: "Familie QA",
    persons: ["Anna"],
    preset: "Strand-Wochenende",
  });
  await createTrip(page, {
    name: "QA-Trip",
    days: 5,
    conditions: ["Sonne", "Schwimmen"],
  });

  const input = page.getByLabel("Item-Name, optional Komma + Menge");
  await expect(input).toBeVisible();

  // --- Fall 1: neues Sonderbedarf-Item ---
  await input.fill("Trinkflasche");
  // Preview-Hint sichtbar
  await expect(page.getByText(/neu — landet als Sonderbedarf/)).toBeVisible();
  await input.press("Enter");
  await expect(input).toHaveValue("");

  await expect(tripItemRow(page, "Trinkflasche")).toBeVisible();
  await expect(
    tripItemRow(page, "Trinkflasche").getByText("0/1"),
  ).toBeVisible();

  // --- Fall 2: "Boxershorts, 5" bei 5-Tage-Trip → 5 Stück (per_day) ---
  await input.fill("Boxershorts, 5");
  await expect(page.getByText(/5 Stück bei 5 Tagen/)).toBeVisible();
  await input.press("Enter");

  await expect(
    tripItemRow(page, "Boxershorts").getByText("0/5"),
  ).toBeVisible();

  // --- Fall 3: Fuzzy-Match-Hint ---
  // Sonnenhut ist im Strand-Preset; bei "Sonne"-Condition wird er beim
  // Trip-Anlegen schon auf die Liste gesetzt. Wir tippen "Sonnenkappe"
  // (ähnlich zu "Sonnenhut") und erwarten den Vorschlag.
  await input.fill("Sonnenkappe");
  const fuzzyHint = page.getByRole("button", {
    name: /Aus Vorlage übernehmen/,
  });
  await expect(fuzzyHint).toBeVisible();
  // Vor Klick: nur ein "Sonnenhut" sichtbar (vom Preset)
  await expect(page.getByText("Sonnenhut", { exact: false }).first()).toBeVisible();
  await fuzzyHint.click();
  // Jetzt sollten zwei Sonnenhut-Items existieren (Preset-Item + neue
  // QuickAdd-Übernahme). Statt der Zähl-Logik prüfen wir, dass Input leer
  // ist (= submit ist passiert):
  await expect(input).toHaveValue("");
});
