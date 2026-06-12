import { expect, test } from "@playwright/test";
import { createTrip, freshPage, setupNewFamily, tripItemRow } from "./helpers";

test.beforeEach(async ({ page }) => {
  await freshPage(page);
});

test("Soll-Menge eines Trip-Items via Edit-Sheet anpassen", async ({ page }) => {
  await setupNewFamily(page, {
    familyName: "Familie Menge",
    persons: ["Anna"],
    preset: "Strand-Wochenende",
  });

  // 5 Tage = 4 Nächte, kein Washer → T-Shirt (1 pro Tag) startet bei 0/4.
  await createTrip(page, {
    name: "Mengen-Trip",
    days: 5,
    conditions: ["Sonne", "Schwimmen"],
  });

  const tshirt = tripItemRow(page, "T-Shirt");
  await expect(tshirt.getByText("0/4")).toBeVisible();

  // Alles einpacken → 4/4, um später den packedQty-Clamp zu prüfen.
  await tshirt.getByRole("button", { name: /Alle 4 einpacken/ }).click();
  await expect(tshirt.getByText("4/4")).toBeVisible();

  // --- Edit-Sheet öffnen (Tippen auf den Item-Namen) ---
  await tshirt.getByText("T-Shirt").click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  const qtyInput = sheet.getByRole("spinbutton", { name: "Anzahl" });
  await expect(qtyInput).toHaveValue("4");

  // --- Auf 2 senken → "Empfohlen: 4 · Zurücksetzen" erscheint ---
  await qtyInput.fill("2");
  await qtyInput.blur();
  await expect(sheet.getByText("Empfohlen: 4")).toBeVisible();

  // --- Zurücksetzen stellt den empfohlenen Wert (4) wieder her ---
  await sheet.getByRole("button", { name: /Zurücksetzen/ }).click();
  await expect(qtyInput).toHaveValue("4");

  // --- Erneut auf 2 senken und speichern ---
  await qtyInput.fill("2");
  await qtyInput.blur();
  await sheet.getByRole("button", { name: "Speichern" }).click();
  await expect(sheet).toBeHidden();

  // Soll-Menge ist 2; gepackter Stand wurde von 4 auf 2 gekappt → "2/2".
  await expect(tshirt.getByText("2/2")).toBeVisible();

  // --- Erhöhen auf 6 → gepackter Stand bleibt 2 → "2/6" ---
  await tshirt.getByText("T-Shirt").click();
  const sheet2 = page.getByRole("dialog");
  const qtyInput2 = sheet2.getByRole("spinbutton", { name: "Anzahl" });
  await qtyInput2.fill("6");
  await qtyInput2.blur();
  await sheet2.getByRole("button", { name: "Speichern" }).click();
  await expect(sheet2).toBeHidden();
  await expect(tshirt.getByText("2/6")).toBeVisible();
});
