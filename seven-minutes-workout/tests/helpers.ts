import { expect, type Page } from "@playwright/test";

export const APP_PATH = "/seven-minutes-workout/";

/**
 * Clears localStorage once before the first render of each test, so a previous
 * test's saved progress never leaks in. Uses a sessionStorage sentinel so the
 * clear only happens on the first navigation of the page lifecycle.
 */
export async function freshPage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      const SENTINEL = "__workout_test_cleared__";
      if (window.sessionStorage.getItem(SENTINEL) !== "1") {
        window.localStorage.clear();
        window.sessionStorage.setItem(SENTINEL, "1");
      }
    } catch {
      /* ignore */
    }
  });
}

/** Open the app home screen. */
export async function gotoApp(page: Page): Promise<void> {
  await page.goto(APP_PATH);
  await expect(page.getByRole("heading", { name: "7-Minuten Workout" })).toBeVisible();
}

/**
 * Fast-forward an in-progress workout to the summary by repeatedly pressing
 * "Überspringen" (skip). Avoids waiting the real ~7 minutes. Returns once the
 * summary heading is visible.
 */
export async function skipToSummary(page: Page): Promise<void> {
  const summary = page.getByRole("heading", { name: /Geschafft!|Gut gemacht!/ });
  const skip = page.getByRole("button", { name: /Überspringen/ });
  for (let i = 0; i < 30; i++) {
    if (await summary.isVisible().catch(() => false)) return;
    await skip.click({ timeout: 2_000 }).catch(() => {});
  }
  await expect(summary).toBeVisible();
}

/** Read the persisted progress object from localStorage. */
export async function readProgress(page: Page): Promise<{
  settings: { gender: string; reminderTime: string; remindersEnabled: boolean; soundEnabled: boolean };
  sessions: Array<{ finished: boolean; stationsCompleted: number; date: string }>;
}> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem("workout:v1:progress");
    // Coalesce to defaults so callers (e.g. expect.poll) never dereference null
    // before the first save has happened.
    const fallback = {
      settings: { gender: "male", reminderTime: "18:00", remindersEnabled: false, soundEnabled: true },
      sessions: [],
    };
    return raw ? JSON.parse(raw) : fallback;
  });
}
