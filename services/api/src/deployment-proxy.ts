import { timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import type { RequestHandler } from "express";

export function deploymentProxy(secret?: string): RequestHandler {
  if (secret && secret.length < 32) throw new Error("DEPLOYMENT_PROXY_SECRET must contain at least 32 characters");
  return (req, res, next) => {
    if (!secret || req.path === "/health") return next();
    const supplied = req.get("x-footyiq-proxy-secret") ?? "";
    const left = Buffer.from(supplied), right = Buffer.from(secret);
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      res.status(403).json({ error: "Use the public FootyIQ website." });
      return;
    }
    const address = req.get("x-footyiq-client-ip") ?? "";
    if (!isIP(address)) {
      res.status(400).json({ error: "Invalid proxy client address" });
      return;
    }
    res.locals.clientIP = address;
    next();
  };
}
