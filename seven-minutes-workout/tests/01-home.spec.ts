import { expect, test } from "@playwright/test";
import { freshPage, gotoApp } from "./helpers";

test.beforeEach(async ({ page }) => {
  await freshPage(page);
});

test("home screen shows the workout intro, stats and all 12 exercises", async ({ page }) => {
  await gotoApp(page);

  // Header + subtitle.
  await expect(page.getByText("12 Übungen · 30 s Belastung / 10 s Pause")).toBeVisible();

  // Fresh install → zero streak / zero workouts.
  await expect(page.getByText("Serie (Tage)")).toBeVisible();
  await expect(page.getByText("Workouts")).toBeVisible();

  // Start CTA.
  await expect(page.getByRole("button", { name: /Workout starten/ })).toBeVisible();

  // All 12 exercises are listed in the preview.
  const items = page.locator(".preview__item");
  await expect(items).toHaveCount(12);
  await expect(page.getByText("Hampelmann")).toBeVisible();
  await expect(page.getByText("Seitstütz")).toBeVisible();
});

test("settings is reachable from the home screen", async ({ page }) => {
  await gotoApp(page);
  await page.getByRole("button", { name: "Einstellungen" }).click();
  await expect(page.getByRole("heading", { name: "Einstellungen" })).toBeVisible();
});
