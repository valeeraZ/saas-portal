import type { IncomingMessage, ServerResponse } from "node:http";
import { appPath, redirectLocation } from "./app-routing.ts";

// External rewrite streams upstream responses directly. This public entry point
// applies the response boundary before Node commits any upstream headers.
export function protectAppResponse(req: IncomingMessage, res: ServerResponse) {
  const original = new URL(req.url ?? "/", "http://portal");
  const match = /^\/tenants\/([^/]+)\/apps\/([^/]+)(?:\/(.*))?$/.exec(
    original.pathname,
  );
  if (!match) return;
  delete req.headers["x-saas-request"];
  const writeHead = res.writeHead.bind(res);
  const write = res.write.bind(res);
  const end = res.end.bind(res);
  let rejected = false;
  res.writeHead = ((status: number, ...args: unknown[]) => {
    const statusMessage =
      typeof args[0] === "string" ? (args.shift() as string) : undefined;
    const supplied = args[0] as
      Record<string, string | string[]> | string[] | undefined;
    if (Array.isArray(supplied)) {
      for (let i = 0; i < supplied.length; i += 2)
        res.setHeader(supplied[i], supplied[i + 1]);
    } else if (supplied) {
      for (const [name, value] of Object.entries(supplied))
        res.setHeader(name, value);
    }
    if (req.headers["x-saas-request"]) {
      const location = res.getHeader("location");
      try {
        const { base, upstream } = appPath(
          decodeURIComponent(match[1]),
          decodeURIComponent(match[2]),
          match[3] ? match[3].split("/").map(decodeURIComponent) : [],
        );
        // Proxy overrides Host from the validated deployment target before rewrite.
        // No state is shared between Proxy and the render/server processes.
        const host = req.headers.host;
        const origins = (process.env.PORTAL_ALLOWED_APP_ORIGINS ?? "").split(
          ",",
        );
        const origin = origins.find(
          (value) => value && new URL(value).host === host,
        );
        if (!origin) throw new Error("missing trusted response origin");
        const upstreamUrl = new URL(upstream + original.search, origin);
        for (const name of ["x-action-redirect", "x-nextjs-redirect"]) {
          const value = res.getHeader(name);
          if (!value) continue;
          const text = String(value);
          const action =
            name === "x-action-redirect" ? /;(push|replace)$/.exec(text) : null;
          const path = action ? text.slice(0, action.index) : text;
          res.setHeader(
            name,
            redirectLocation(path, upstreamUrl, base, "/" + match[2]) +
              (action?.[0] ?? ""),
          );
        }
        if (location)
          res.setHeader(
            "location",
            redirectLocation(
              String(location),
              new URL(upstream + original.search, origin),
              base,
              "/" + match[2],
            ),
          );
      } catch {
        rejected = true;
        status = 502;
      }
      const allowed = new Set([
        "content-type",
        "content-length",
        "content-encoding",
        "content-disposition",
        "content-range",
        "accept-ranges",
        "etag",
        "last-modified",
        "retry-after",
        "location",
        "vary",
        "x-action-redirect",
        "x-action-revalidated",
        "x-nextjs-redirect",
        "x-nextjs-stale-time",
        "x-nextjs-postponed",
      ]);
      for (const name of res.getHeaderNames())
        if (!allowed.has(name)) res.removeHeader(name);
      res.setHeader("cache-control", "no-store");
      res.setHeader("x-content-type-options", "nosniff");
      res.setHeader("referrer-policy", "no-referrer");
      res.setHeader("x-frame-options", "DENY");
      if (rejected) {
        for (const name of res.getHeaderNames()) res.removeHeader(name);
        res.setHeader("content-type", "application/json");
        res.setHeader("cache-control", "no-store");
      }
    }
    return statusMessage && !rejected
      ? writeHead(status, statusMessage)
      : writeHead(status);
  }) as typeof res.writeHead;
  res.write = ((...args: Parameters<typeof res.write>) => {
    if (!res.headersSent) res.writeHead(res.statusCode);
    if (rejected) {
      const callback = args.find((arg) => typeof arg === "function");
      if (typeof callback === "function") callback();
      return true;
    }
    return write(...args);
  }) as typeof res.write;
  res.end = ((...args: Parameters<typeof res.end>) => {
    if (!res.headersSent) res.writeHead(res.statusCode);
    return rejected
      ? end('{"error":"application_service_unavailable"}')
      : end(...args);
  }) as typeof res.end;
  const timeout = setTimeout(() => res.destroy(), 30000);
  timeout.unref();
  res.once("finish", () => clearTimeout(timeout));
}
