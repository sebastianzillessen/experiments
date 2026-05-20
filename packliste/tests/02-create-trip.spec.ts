import { expect, test } from "@playwright/test";
import { createTrip, freshPage, setupNewFamily, tripItemRow } from "./helpers";

test.beforeEach(async ({ page }) => {
  await freshPage(page);
});

test("Neuer Trip via Modal → Detail-Seite mit berechneten Mengen", async ({
  page,
}) => {
  await setupNewFamily(page, {
    familyName: "Familie Strand",
    persons: ["Anna"],
    preset: "Strand-Wochenende",
  });

  await createTrip(page, {
    name: "Sommer Sardinien",
    days: 5,
    conditions: ["Sonne", "Schwimmen"],
    hasWasher: true,
    washInterval: 3,
  });

  // Trip-Detail
  await expect(
    page.getByRole("heading", { name: "Sommer Sardinien" }),
  ).toBeVisible();
  await expect(page.getByText(/5 Tage/).first()).toBeVisible();
  // Washer-Badge
  await expect(page.getByText(/🧺.*alle 3 Tage/)).toBeVisible();

  // Mengen-Berechnung: Unterhose (1 pro Tag, washable=true).
  // 5 Tage + has_washer + Intervall 3 → effectiveDays = min(5, 4) = 4
  // → quantity = 4 (nicht 5)
  const unterhose = tripItemRow(page, "Unterhose");
  await expect(unterhose).toBeVisible();
  await expect(unterhose.getByText("0/4")).toBeVisible();

  // T-Shirt — gleiche Berechnung (1 pro Tag, washable=true) → 4
  const tshirt = tripItemRow(page, "T-Shirt");
  await expect(tshirt.getByText("0/4")).toBeVisible();

  // Sonnencreme (per_trip) → 1 Stück unabhängig von Dauer
  const sonnencreme = tripItemRow(page, "Sonnencreme");
  await expect(sonnencreme.getByText("0/1")).toBeVisible();

  // Initialer Gesamt-Progress: 0 / total > 0 gepackt
  await expect(page.getByText(/^0 \/ \d+ gepackt$/)).toBeVisible();
});
