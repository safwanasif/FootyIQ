import { isIP } from "node:net";

// Server-only entry point, imported only by route handlers. Never export secrets to the browser.
export async function proxyBackend(request: Request) {
  const incoming = new URL(request.url);
  const allowed = new Set(["/health", "/api/v1/session", "/api/v1/predict-proxy", "/api/v1/shots", "/api/v1/shots/export"]);
  if (!allowed.has(incoming.pathname)) return Response.json({error:"Not found"}, {status:404});
  const target = process.env.BACKEND_ORIGIN;
  const secret = process.env.DEPLOYMENT_PROXY_SECRET;
  if (!target || !secret || secret.length < 32) return Response.json({error:"Backend setup is incomplete"}, {status:503});
  const origin = new URL(target);
  if (origin.protocol !== "https:" || origin.origin !== target) return Response.json({error:"Invalid backend configuration"}, {status:503});
  const clientIP = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim() : "127.0.0.1";
  if (!clientIP || !isIP(clientIP)) return Response.json({error:"Client address unavailable"}, {status:503});
  const headers = new Headers({"x-footyiq-proxy-secret":secret,"x-footyiq-client-ip":clientIP});
  for (const name of ["content-type", "cookie", "origin"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name,value);
  }
  try {
    const body = request.method === "POST" ? await request.text() : undefined;
    if (body && Buffer.byteLength(body) > 16384) return Response.json({error:"Request too large"}, {status:413});
    const result = await fetch(`${target}${incoming.pathname}${incoming.search}`, {
      method:request.method, headers, body, redirect:"manual", cache:"no-store", signal:AbortSignal.timeout(65000),
    });
    const outgoing = new Headers({"Cache-Control":"no-store"});
    for (const name of ["content-type", "content-disposition", "retry-after", "set-cookie"]) {
      const value = result.headers.get(name);
      if (value) outgoing.set(name,value);
    }
    if (result.status >= 300 && result.status < 400) return Response.json({error:"Unexpected backend redirect"},{status:502});
    return new Response(result.body,{status:result.status,headers:outgoing});
  } catch {
    return Response.json({error:"The free demo backend is waking up or temporarily unavailable. Please retry in about a minute."},{status:503,headers:{"Cache-Control":"no-store"}});
  }
}
