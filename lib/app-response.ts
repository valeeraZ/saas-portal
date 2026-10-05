import { registryMode } from "./runtime-registry.ts";
import type { IncomingMessage, ServerResponse } from "node:http";
import { appPath, redirectLocation, target } from "./app-routing.ts";

// External rewrite streams upstream responses directly. This public entry point
// applies the response boundary before Node commits any upstream headers.
export function protectAppResponse(req: IncomingMessage, res: ServerResponse) {
  const original = new URL(req.url ?? "/", "http://portal");
  const match = /^\/apps\/([^/]+)(?:\/(.*))?$/.exec(original.pathname);
  const asset = original.pathname.startsWith("/app-assets/");
  if (!match && !asset) return;
  delete req.headers["x-saas-request"];
  delete req.headers["x-saas-route-origin"];
  delete req.headers["x-saas-route-runtime"];
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
    if (asset || req.headers["x-saas-request"]) {
      const location = res.getHeader("location");
      try {
        if (asset) {
          if (
            location ||
            res.getHeader("x-action-redirect") ||
            res.getHeader("x-nextjs-redirect")
          )
            throw new Error("Build assets cannot redirect");
        } else if (match) {
          const { base, upstream } = appPath(
            decodeURIComponent(match[1]),
            match[2] ? match[2].split("/").map(decodeURIComponent) : [],
          );
          // Proxy overrides Host from the validated deployment target before rewrite.
          // No state is shared between Proxy and the render/server processes.
          const host = req.headers.host;
          const origins = (process.env.PORTAL_ALLOWED_APP_ORIGINS ?? "").split(
            ",",
          );
          const origin =
            registryMode() === "admin"
              ? target(String(req.headers["x-saas-route-origin"] ?? ""))
              : origins.find((value) => value && new URL(value).host === host);
          if (!origin) throw new Error("missing trusted response origin");
          if (new URL(origin).host !== host)
            throw new Error("response origin mismatch");
          const runtime = req.headers["x-saas-route-runtime"];
          if (
            registryMode() === "admin" &&
            !["http", "nextjs"].includes(String(runtime))
          )
            throw new Error("missing trusted runtime");
          const dynamic =
            registryMode() === "admin"
              ? runtime === "nextjs"
              : (process.env.PORTAL_NEXT_APP_ORIGINS ?? "")
                  .split(",")
                  .includes(origin);
          const suffix = dynamic ? base : "/" + match[1];
          const upstreamUrl = new URL(
            (dynamic ? original.pathname : upstream) + original.search,
            origin,
          );
          for (const name of ["x-action-redirect", "x-nextjs-redirect"]) {
            const value = res.getHeader(name);
            if (!value) continue;
            const text = String(value);
            const action =
              name === "x-action-redirect"
                ? /;(push|replace)$/.exec(text)
                : null;
            const path = action ? text.slice(0, action.index) : text;
            res.setHeader(
              name,
              redirectLocation(path, upstreamUrl, base, suffix) +
                (action?.[0] ?? ""),
            );
          }
          if (location)
            res.setHeader(
              "location",
              redirectLocation(String(location), upstreamUrl, base, suffix),
            );
        }
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
