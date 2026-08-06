import assert from "node:assert/strict";
import { test } from "node:test";
import type { MapPerson } from "../types.ts";
import { applyFilters, NO_FILTERS } from "./filter.ts";

const p = (id: number, category_id: number, rating: number): MapPerson => ({
  id,
  name: `p${id}`,
  category_id,
  contact_frequency: "weekly",
  rating,
  archived: false,
});

const people = [p(1, 10, 9), p(2, 10, 3), p(3, 20, 7), p(4, 20, 1)];

test("no filters returns everyone", () => {
  assert.equal(applyFilters(people, NO_FILTERS).length, 4);
});

test("hidden groups are removed", () => {
  const r = applyFilters(people, { ...NO_FILTERS, hiddenGroups: [20] });
  assert.deepEqual(r.map((x) => x.id).sort(), [1, 2]);
});

test("minRating drops people below the threshold", () => {
  const r = applyFilters(people, { ...NO_FILTERS, minRating: 7 });
  assert.deepEqual(r.map((x) => x.id).sort(), [1, 3]);
});

test("topN keeps only the closest after other filters", () => {
  const r = applyFilters(people, { ...NO_FILTERS, topN: 2 });
  assert.deepEqual(r.map((x) => x.rating), [9, 7]);
});

test("filters combine (group + minRating + topN)", () => {
  const r = applyFilters(people, { hiddenGroups: [20], minRating: 2, topN: 1 });
  assert.deepEqual(r.map((x) => x.id), [1]);
});
