import { Router } from "express";
import { exportAll, getSettings, liveMap, mapAt, timeline } from "../repo.ts";
import type { MapResponse } from "../types.ts";

export const mapRouter = Router();

mapRouter.get("/map", (req, res) => {
  const at = typeof req.query.at === "string" ? req.query.at : null;
  const self_name = getSettings().self_name ?? "Me";
  const people = at ? mapAt(at) : liveMap();
  const body: MapResponse = { at, self_name, people };
  res.json(body);
});

mapRouter.get("/timeline", (_req, res) => {
  res.json(timeline());
});

mapRouter.get("/export", (_req, res) => {
  res.json(exportAll());
});
