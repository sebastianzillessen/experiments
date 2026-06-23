import express from "express";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { categoriesRouter } from "./routes/categories.ts";
import { importRouter } from "./routes/import.ts";
import { mapRouter } from "./routes/map.ts";
import { peopleRouter } from "./routes/people.ts";
import { settingsRouter } from "./routes/settings.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.API_PORT ?? 8787);

const app = express();
app.use(express.json());

// --- API routes (registered before the SPA fallback) ---
const api = express.Router();
api.use("/settings", settingsRouter);
api.use("/categories", categoriesRouter);
api.use("/people", peopleRouter);
api.use("/import", importRouter);
api.use("/", mapRouter);
app.use("/api", api);

// Unknown API paths return JSON 404 (never the SPA HTML).
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// --- Static SPA + fallback (production) ---
if (process.env.NODE_ENV === "production") {
  const distDir = resolve(__dirname, "..", "dist");
  if (existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(join(distDir, "index.html"));
    });
  }
}

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`relationship-map API listening on http://localhost:${PORT}`);
});
