import { Router } from "express";
import { runImport } from "../../import/run.ts";

export const importRouter = Router();

// Runs the local-data import synchronously and returns a summary. Reading the
// source databases can fail (missing app, no Full Disk Access) — surface that
// as a 500 with the message rather than crashing the server.
importRouter.post("/", (_req, res) => {
  try {
    res.json(runImport());
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
