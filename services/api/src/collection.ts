import { createHash, randomBytes } from "node:crypto";
import type { Request, Response, RequestHandler } from "express";

const COOKIE_NAME = "footyiq_collection";

function tokenFromRequest(req: Request): string | undefined {
  const values = (req.headers.cookie ?? "").split(";").map((value) => value.trim());
  const tokens = values.filter((value) => value.startsWith(`${COOKIE_NAME}=`));
  if (tokens.length !== 1) return undefined;
  const token = tokens[0].slice(COOKIE_NAME.length + 1);
  return /^[a-f0-9]{64}$/.test(token) ? token : undefined;
}

function collectionId(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function openCollection(secure: boolean) {
  return (req: Request, res: Response) => {
    const token = tokenFromRequest(req) ?? randomBytes(32).toString("hex");
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true, secure, sameSite: "lax", path: "/api/v1", maxAge: 365 * 24 * 60 * 60 * 1000,
    });
    res.setHeader("Cache-Control", "no-store");
    res.vary("Cookie");
    // This hash is a public import identifier, never an authentication credential.
    return res.json({ collection_id: collectionId(token) });
  };
}

export const requireCollection: RequestHandler = (req, res, next) => {
  const token = tokenFromRequest(req);
  res.setHeader("Cache-Control", "no-store");
  res.vary("Cookie");
  if (!token) {
    res.status(401).json({ error: "Open a browser collection before accessing saved shots." });
    return;
  }
  res.locals.collectionId = collectionId(token);
  next();
};
