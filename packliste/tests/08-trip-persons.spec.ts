import { expect, test } from "@playwright/test";
import { freshPage, setupNewFamily } from "./helpers";

test.beforeEach(async ({ page }) => {
  await freshPage(page);
});

test("Trip-Anlegen: nur mitreisende Personen kommen auf die Liste", async ({
  page,
}) => {
  await setupNewFamily(page, {
    familyName: "Familie Reise",
    persons: ["Anna", "Bob"],
    preset: "Leer starten",
  });

  // --- Vorlage: je ein Item pro Person anlegen ---
  await page.goto("/packliste/#/vorlage");
  await expect(page.getByRole("heading", { name: "Familie Reise" })).toBeVisible();

  // Annas Buch → nur Anna zugewiesen
  await page.getByLabel("Name").fill("Annas Buch");
  await page.getByLabel("Kategorie").fill("Bücher");
  await page.getByRole("button", { name: /^Anna/ }).first().click();
  await page.getByRole("button", { name: "Hinzufügen" }).click();
  await expect(page.getByText("Annas Buch")).toBeVisible();

  // Bobs Ball → nur Bob zugewiesen
  await page.getByLabel("Name").fill("Bobs Ball");
  await page.getByLabel("Kategorie").fill("Spielzeug");
  await page.getByRole("button", { name: /^Bob/ }).first().click();
  await page.getByRole("button", { name: "Hinzufügen" }).click();
  await expect(page.getByText("Bobs Ball")).toBeVisible();

  // --- Trip anlegen, dabei Bob abwählen ---
  await page.goto("/packliste/");
  await page.getByRole("button", { name: "Neuer Trip" }).click();

  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();
  await modal.getByLabel("Trip-Name").fill("Anna fährt allein");

  // "Wer reist mit?" — Bob ist standardmäßig gewählt, wieder abwählen.
  await expect(modal.getByText("Wer reist mit?")).toBeVisible();
  await modal.getByRole("button", { name: /^Bob$/ }).click();

  await modal.getByRole("button", { name: "Trip anlegen" }).click();
  await page.waitForURL(/\/#\/trip\//);

  // --- Trip-Detail: Annas Item da, Bobs Item nicht ---
  await expect(page.getByText("Annas Buch")).toBeVisible();
  await expect(page.getByText("Bobs Ball")).toHaveCount(0);

  // Personen-Filter zeigt nur Anna (du), kein Bob.
  await expect(page.getByRole("button", { name: /^Anna/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Bob/ })).toHaveCount(0);
});
