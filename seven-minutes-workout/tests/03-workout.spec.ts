import { expect, test } from "@playwright/test";
import { freshPage, gotoApp, readProgress, skipToSummary } from "./helpers";

test.beforeEach(async ({ page }) => {
  await freshPage(page);
});

test("starting the workout shows the countdown and a ticking timer", async ({ page }) => {
  await gotoApp(page);
  await page.getByRole("button", { name: /Workout starten/ }).click();

  // Countdown phase: "Bereit machen" + station label "Start".
  await expect(page.getByText("Bereit machen")).toBeVisible();

  const seconds = page.locator(".ring__seconds");
  const before = Number(await seconds.textContent());
  expect(before).toBeGreaterThan(0);

  // Wait past one tick and confirm the timer decremented.
  await expect.poll(async () => Number(await seconds.textContent()), {
    timeout: 4_000,
  }).toBeLessThan(before);
});

test("pause then resume toggles the control label", async ({ page }) => {
  await gotoApp(page);
  await page.getByRole("button", { name: /Workout starten/ }).click();

  const pause = page.getByRole("button", { name: /Pause/ });
  await pause.click();
  const resume = page.getByRole("button", { name: /Weiter/ });
  await expect(resume).toBeVisible();
  await resume.click();
  await expect(page.getByRole("button", { name: /Pause/ })).toBeVisible();
});

test("completing the circuit records a finished session and updates the streak", async ({
  page,
}) => {
  await gotoApp(page);
  await page.getByRole("button", { name: /Workout starten/ }).click();

  await skipToSummary(page);

  // Finishing the whole circuit → success summary.
  await expect(page.getByRole("heading", { name: "Geschafft!" })).toBeVisible();
  await expect(page.getByText(/12\/12/)).toBeVisible();

  // A finished session is persisted.
  const progress = await readProgress(page);
  expect(progress.sessions.length).toBe(1);
  expect(progress.sessions[0].finished).toBe(true);
  expect(progress.sessions[0].stationsCompleted).toBe(12);

  // Back to home → stats reflect 1 workout and a 1-day streak.
  await page.getByRole("button", { name: /Zur Übersicht/ }).click();
  await expect(page.getByRole("heading", { name: "7-Minuten Workout" })).toBeVisible();
  await expect(page.getByText("1🔥")).toBeVisible();
});

test("quitting early shows the partial summary", async ({ page }) => {
  await gotoApp(page);
  await page.getByRole("button", { name: /Workout starten/ }).click();

  // Abort via the ✕ button.
  await page.getByRole("button", { name: "Abbrechen" }).click();
  await expect(page.getByRole("heading", { name: "Gut gemacht!" })).toBeVisible();
});
