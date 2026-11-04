import { Router } from "express";
import { z } from "zod";
import {
  changeRating,
  createPerson,
  getHistory,
  getPerson,
  listPeople,
  updatePerson,
} from "../repo.ts";
import { CONTACT_FREQUENCIES } from "../types.ts";

export const peopleRouter = Router();

const rating = z.number().int().min(1).max(10);
const frequency = z.enum(CONTACT_FREQUENCIES);

const createSchema = z.object({
  name: z.string().trim().min(1),
  category_id: z.number().int(),
  contact_frequency: frequency,
  rating,
});

const updateSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    category_id: z.number().int().optional(),
    contact_frequency: frequency.optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "No fields to update");

const ratingSchema = z.object({
  rating,
  note: z.string().trim().min(1).nullable().optional(),
});

peopleRouter.get("/", (req, res) => {
  const includeArchived = req.query.includeArchived === "true";
  res.json(listPeople(includeArchived));
});

peopleRouter.post("/", (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message });
    return;
  }
  res.status(201).json(createPerson(parsed.data));
});

peopleRouter.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message });
    return;
  }
  const updated = updatePerson(id, parsed.data);
  if (!updated) {
    res.status(404).json({ error: "Person not found" });
    return;
  }
  res.json(updated);
});

peopleRouter.patch("/:id/rating", (req, res) => {
  const id = Number(req.params.id);
  const parsed = ratingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message });
    return;
  }
  const updated = changeRating(id, parsed.data.rating, parsed.data.note ?? null);
  if (!updated) {
    res.status(404).json({ error: "Person not found" });
    return;
  }
  res.json(updated);
});

peopleRouter.get("/:id/history", (req, res) => {
  const id = Number(req.params.id);
  if (!getPerson(id)) {
    res.status(404).json({ error: "Person not found" });
    return;
  }
  res.json(getHistory(id));
});
