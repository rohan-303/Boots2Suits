import express from "express";
import { z } from "zod";

const envSchema = z.object({
  API_PORT: z.coerce.number().int().positive().default(4000)
});

const env = envSchema.parse(process.env);
const app = express();

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "api" });
});

app.listen(env.API_PORT, () => {
  // Startup log is intentionally simple for Phase 0.
  console.log(`API listening on http://localhost:${env.API_PORT}`);
});

