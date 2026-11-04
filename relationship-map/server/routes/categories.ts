import { Router } from "express";
import { z } from "zod";
import {
  categoryInUse,
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from "../repo.ts";

export const categoriesRouter = Router();

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must be #rrggbb");

const createSchema = z.object({
  name: z.string().trim().min(1),
  color: hexColor,
});

const updateSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    color: hexColor.optional(),
    sort_order: z.number().int().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "No fields to update");

categoriesRouter.get("/", (_req, res) => {
  res.json(listCategories());
});

categoriesRouter.post("/", (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message });
    return;
  }
  try {
    res.status(201).json(createCategory(parsed.data.name, parsed.data.color));
  } catch {
    res.status(409).json({ error: "A category with that name already exists" });
  }
});

categoriesRouter.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message });
    return;
  }
  const updated = updateCategory(id, parsed.data);
  if (!updated) {
    res.status(404).json({ error: "Category not found" });
    return;
  }
  res.json(updated);
});

categoriesRouter.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (categoryInUse(id)) {
    res.status(409).json({ error: "Category is in use by one or more people" });
    return;
  }
  deleteCategory(id);
  res.status(204).end();
});
