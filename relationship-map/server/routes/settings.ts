import { Router } from "express";
import { z } from "zod";
import { getSettings, setSettings } from "../repo.ts";

export const settingsRouter = Router();

settingsRouter.get("/", (_req, res) => {
  res.json(getSettings());
});

const updateSchema = z.record(z.string(), z.string());

settingsRouter.put("/", (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Settings must be a string→string map" });
    return;
  }
  res.json(setSettings(parsed.data));
});
