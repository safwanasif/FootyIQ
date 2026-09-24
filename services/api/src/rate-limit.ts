import type { RequestHandler } from "express";

// Single-process demo guard. A multi-replica deployment needs a shared store.
export function requestLimit(limit: number, windowMs = 60000, now = Date.now): RequestHandler {
  const buckets = new Map<string, { count: number; reset: number }>();
  let nextSweep = 0;
  return (req, res, next) => {
    const time = now();
    if (time >= nextSweep) {
      for (const [key, value] of buckets) if (value.reset <= time) buckets.delete(key);
      nextSweep = time + windowMs;
    }
    // Express leaves trust proxy disabled: untrusted forwarded headers cannot rotate keys.
    const key = res.locals.clientIP ?? req.ip ?? req.socket.remoteAddress ?? "unknown";
    let bucket = buckets.get(key);
    if (!bucket || bucket.reset <= time) {
      if (!bucket && buckets.size >= 10000) {
        res.setHeader("Retry-After", "60");
        res.status(503).json({ error: "Request capacity reached. Please retry shortly." });
        return;
      }
      bucket = { count: 0, reset: time + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count++;
    if (bucket.count > limit) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((bucket.reset - time) / 1000))));
      res.setHeader("Cache-Control", "no-store");
      res.status(429).json({ error: "Too many requests. Please retry shortly." });
      return;
    }
    next();
  };
}
