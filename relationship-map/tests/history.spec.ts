import { expect, test } from "@playwright/test";
import type { Category, MapResponse, Person } from "../src/types.ts";

// Runs after app.spec.ts (alphabetical). Exercises the change-log + time travel
// directly against the API so the assertions aren't subject to UI timing.
test.describe("history & time travel", () => {
  test("reconstructs a past rating from the change log", async ({ request }) => {
    const categories = (await (
      await request.get("/api/categories")
    ).json()) as Category[];

    const person = (await (
      await request.post("/api/people", {
        data: {
          name: "TimeTravel Tom",
          category_id: categories[0].id,
          contact_frequency: "monthly",
          rating: 3,
        },
      })
    ).json()) as Person;

    const afterCreate = new Date().toISOString();
    await new Promise((r) => setTimeout(r, 1100)); // ensure a distinct timestamp

    const changed = await request.patch(`/api/people/${person.id}/rating`, {
      data: { rating: 8, note: "Got much closer" },
    });
    expect(changed.ok()).toBeTruthy();

    // Live map shows the new rating.
    const live = (await (await request.get("/api/map")).json()) as MapResponse;
    expect(live.people.find((p) => p.id === person.id)?.rating).toBe(8);

    // Map reconstructed at the earlier time shows the original rating.
    const past = (await (
      await request.get(`/api/map?at=${encodeURIComponent(afterCreate)}`)
    ).json()) as MapResponse;
    expect(past.people.find((p) => p.id === person.id)?.rating).toBe(3);

    // The change carried a note into the log.
    const history = await (
      await request.get(`/api/people/${person.id}/history`)
    ).json();
    expect(history).toHaveLength(2);
    expect(history[1].note).toBe("Got much closer");
  });

  test("rejects out-of-range ratings", async ({ request }) => {
    const categories = (await (
      await request.get("/api/categories")
    ).json()) as Category[];
    const person = (await (
      await request.post("/api/people", {
        data: {
          name: "Range Rita",
          category_id: categories[0].id,
          contact_frequency: "rarely",
          rating: 5,
        },
      })
    ).json()) as Person;

    const bad = await request.patch(`/api/people/${person.id}/rating`, {
      data: { rating: 11 },
    });
    expect(bad.status()).toBe(400);
  });
});
