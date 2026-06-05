import { expect, test } from "@playwright/test";
import { createTrip, freshPage, setupNewFamily, tripItemRow } from "./helpers";

test.beforeEach(async ({ page }) => {
  await freshPage(page);
});

test("Item-Packen: Plus, Minus, Alle, Sortier-Toggle, Person-Filter", async ({
  page,
}) => {
  await setupNewFamily(page, {
    familyName: "Familie Pack",
    persons: ["Anna"],
    preset: "Strand-Wochenende",
  });
  await createTrip(page, {
    name: "Pack-Trip",
    days: 5,
    conditions: ["Sonne", "Schwimmen"],
    // Kein Washer — qty = 4 (5 Tage = 4 Nächte) für per_day-Items.
  });

  // --- Plus auf Sonnencreme (per_trip, 0/1 → 1/1) ---
  const sonnencreme = tripItemRow(page, "Sonnencreme");
  await expect(sonnencreme.getByText("0/1")).toBeVisible();
  await sonnencreme.getByRole("button", { name: "Mehr", exact: true }).click();
  await expect(sonnencreme.getByText("1/1")).toBeVisible();

  // --- Minus → zurück auf 0/1 ---
  await sonnencreme
    .getByRole("button", { name: "Weniger", exact: true })
    .click();
  await expect(sonnencreme.getByText("0/1")).toBeVisible();

  // --- "Alle"-Klick aufs Qty-Feld bei T-Shirt (5 Tage = 4 Nächte, no washer → 0/4) ---
  const tshirt = tripItemRow(page, "T-Shirt");
  await expect(tshirt.getByText("0/4")).toBeVisible();
  await tshirt.getByRole("button", { name: /Alle 4 einpacken/ }).click();
  await expect(tshirt.getByText("4/4")).toBeVisible();

  // --- T-Shirt ist nun komplett gepackt → "Erledigt"-Sektion sichtbar ---
  // Sortier-Toggle Standard = "Offene zuerst" (laut TripDetail.tsx).
  await expect(page.getByText(/✓ Erledigt · \d+ Item/)).toBeVisible();

  // --- Wechsel auf "Nach Kategorie" → Erledigt-Sektion ausgeblendet ---
  await page.getByRole("button", { name: "Nach Kategorie" }).click();
  await expect(page.getByText("✓ Erledigt")).toBeHidden();

  // Zurück zu "Offene zuerst"
  await page.getByRole("button", { name: "Offene zuerst" }).click();
  await expect(page.getByText(/✓ Erledigt · \d+ Item/)).toBeVisible();

  // --- Person-Filter-Chips ---
  // "Anna"-Chip sichtbar
  const annaChip = page.getByRole("button", { name: /^Anna/ });
  await expect(annaChip).toBeVisible();
  await annaChip.click();
  // Anna hat keine ihr zugewiesenen Items im Strand-Preset (alle items
  // sind "gemeinsam" via personIds=[]). Folglich verschwinden Sonnencreme
  // & T-Shirt aus der gefilterten Sicht:
  await expect(page.getByText("Sonnencreme")).toHaveCount(0);

  // Zurück auf "Alle" — Sonnencreme wieder sichtbar.
  await page.getByRole("button", { name: /^Alle\b/ }).click();
  await expect(tripItemRow(page, "Sonnencreme")).toBeVisible();
});
