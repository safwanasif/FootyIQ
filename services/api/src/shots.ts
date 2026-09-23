import { Router } from "express";
import { z } from "zod";
import { getXGPrediction, MLServiceError, type XGResponse } from "./services/ml.client";
import { requireCollection } from "./collection";

export const SaveShotSchema = z.object({
  id: z.uuid(), x: z.number().min(60).max(119.9), y: z.number().min(0).max(80),
}).strict();
export type ShotPosition = z.infer<typeof SaveShotSchema>;
export interface SavedShot extends ShotPosition, XGResponse {
  angle_degrees: number;
  created_at: string;
}
export interface ShotStore {
  find(collectionId: string, id: string): Promise<SavedShot | undefined>;
  save(collectionId: string, shot: Omit<SavedShot, "created_at">): Promise<SavedShot>;
  list(collectionId: string, limit: number, offset: number): Promise<SavedShot[]>;
}
export function shotGeometry(x: number, y: number) {
  const distance_yards = Math.hypot(120 - x, 40 - y);
  let angle = Math.abs(Math.atan2(36 - y, 120 - x) - Math.atan2(44 - y, 120 - x));
  if (angle > Math.PI) angle = 2 * Math.PI - angle;
  return { distance_yards, distance_meters: distance_yards / 1.09361, angle_degrees: angle * 180 / Math.PI };
}
export function createShotsRouter(store: ShotStore, predict = getXGPrediction) {
  const router = Router();
  router.use("/shots", requireCollection);
  router.get("/shots/export", async (req, res) => {
    const query = z.object({ offset: z.coerce.number().int().min(0).max(100000).default(0) }).safeParse(req.query);
    if (!query.success) return res.status(422).json({ error: "Invalid pagination" });
    try {
      const rows = await store.list(res.locals.collectionId, 10, query.data.offset);
      const header = ["id", "saved_at", "x", "y", "distance_yards", "angle_degrees", "xg_probability", "model_id"];
      const csv = [header, ...rows.map((row) => [row.id, new Date(row.created_at).toISOString(), row.x, row.y, row.distance_yards, row.angle_degrees, row.xg_probability, row.model_id])]
        .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\r\n");
      res.setHeader("Cache-Control", "no-store");
      res.attachment(`footyiq-shots-page-${query.data.offset / 10 + 1}.csv`);
      return res.type("text/csv").send(csv + "\r\n");
    } catch {
      return res.status(503).json({ error: "Unable to export shot history. Please retry." });
    }
  });
  router.get("/shots", async (req, res) => {
    const query = z.object({
      limit: z.coerce.number().int().min(1).max(50).default(10),
      offset: z.coerce.number().int().min(0).max(100000).default(0),
    }).safeParse(req.query);
    if (!query.success) return res.status(422).json({ error: "Invalid pagination" });
    try {
      const { limit, offset } = query.data;
      const rows = await store.list(res.locals.collectionId, limit + 1, offset);
      return res.json({ shots: rows.slice(0, limit), has_more: rows.length > limit });
    } catch {
      return res.status(503).json({ error: "Shot history is temporarily unavailable. Please retry." });
    }
  });
  router.post("/shots", async (req, res) => {
    const parsed = SaveShotSchema.safeParse(req.body);
    if (!parsed.success) return res.status(422).json({ error: "Invalid shot", details: parsed.error.flatten().fieldErrors });
    const { id, x, y } = parsed.data;
    try {
      const existing = await store.find(res.locals.collectionId, id);
      if (existing) {
        if (existing.x !== x || existing.y !== y) return res.status(409).json({ error: "This save ID belongs to a different shot." });
        return res.json(existing);
      }
      const geometry = shotGeometry(x, y);
      const prediction = await predict({ distance_meters: geometry.distance_meters, angle_degrees: geometry.angle_degrees });
      const saved = await store.save(res.locals.collectionId, { id, x, y, ...prediction, distance_yards: geometry.distance_yards, angle_degrees: geometry.angle_degrees });
      if (saved.x !== x || saved.y !== y) return res.status(409).json({ error: "This save ID belongs to a different shot." });
      return res.status(201).json(saved);
    } catch (error) {
      if (error instanceof MLServiceError) return res.status(error.statusCode).json({ error: "Prediction unavailable. Your shot has not been saved." });
      return res.status(503).json({ error: "Unable to confirm the save. Please retry; retries will not duplicate your shot." });
    }
  });
  return router;
}
