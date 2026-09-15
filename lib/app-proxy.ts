import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { importPKCS8, SignJWT } from "jose";
import { session } from "./http.ts";
import { config } from "./config.ts";
import {
  appPath,
  resolveRoute,
  target,
  redirectLocation,
  ProxyError,
} from "./app-routing.ts";
let privateKey: ReturnType<typeof importPKCS8> | undefined;
async function bodyBytes(request: Request) {
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8 * 1024 * 1024) {
        await reader.cancel();
        throw new ProxyError(413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
export async function forward(
  request: Request,
  params: { tenantId: string; mount: string; path?: string[] },
) {
  try {
    const { base, upstream } = appPath(
      params.tenantId,
      params.mount,
      params.path,
    );
    if (request.headers.get("upgrade")) throw new ProxyError(501);
    const safe = ["GET", "HEAD"].includes(request.method);
    if (!safe && request.headers.get("origin") !== config().origin)
      throw new ProxyError(403);
    const s = await session();
    const route = await resolveRoute(params.tenantId, params.mount, s);
    const url = new URL(upstream, target(route.targetOrigin));
    url.search = new URL(request.url).search;
    const body = safe ? Buffer.alloc(0) : await bodyBytes(request);
    const headers = new Headers();
    for (const name of [
      "accept",
      "accept-language",
      "content-type",
      "range",
      "if-range",
      "if-none-match",
      "if-modified-since",
    ]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    headers.set("accept-encoding", "identity");
    privateKey ??= importPKCS8(
      readFileSync(process.env.PORTAL_APP_SIGNING_KEY_FILE!, "utf8"),
      "RS256",
    );
    const assertion = await new SignJWT({
      tenantId: route.tenantId,
      roles: route.roles,
      deploymentId: route.deploymentId,
      method: request.method,
      path: url.pathname + url.search,
      basePath: base,
      bodyHash: createHash("sha256").update(body).digest("hex"),
    })
      .setProtectedHeader({
        alg: "RS256",
        typ: "JWT",
        kid: process.env.PORTAL_APP_KEY_ID ?? "portal-1",
      })
      .setIssuer(config().origin)
      .setAudience(route.appId)
      .setSubject(route.userId)
      .setIssuedAt()
      .setExpirationTime("30s")
      .setJti(randomUUID())
      .sign(await privateKey);
    headers.set("x-saas-request", assertion);
    const result = await fetch(url, {
      method: request.method,
      headers,
      body: safe ? undefined : body,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(30000)]),
    });
    const outgoing = new Headers({
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    });
    for (const name of [
      "content-type",
      "content-disposition",
      "content-range",
      "accept-ranges",
      "etag",
      "last-modified",
      "retry-after",
    ]) {
      const value = result.headers.get(name);
      if (value) outgoing.set(name, value);
    }
    const location = result.headers.get("location");
    if (location)
      outgoing.set(
        "location",
        redirectLocation(location, url, base, route.suffix),
      );
    // No Set-Cookie, auth, hop-by-hop, internal routing or service-worker scope headers cross the boundary.
    return new Response(
      request.method === "HEAD" || [204, 205, 304].includes(result.status)
        ? null
        : result.body,
      { status: result.status, headers: outgoing },
    );
  } catch (error) {
    const status =
      error instanceof ProxyError
        ? error.status
        : error instanceof Error && error.message === "unauthorized"
          ? 401
          : 502;
    if (
      status === 401 &&
      request.method === "GET" &&
      request.headers.get("accept")?.includes("text/html")
    ) {
      const login = new URL("/api/auth/login", config().origin);
      const here = new URL(request.url);
      login.searchParams.set("returnTo", here.pathname + here.search);
      return Response.redirect(login, 303);
    }
    return Response.json(
      {
        error:
          status === 401
            ? "unauthorized"
            : status === 403
              ? "access_denied"
              : status === 404
                ? "application_unavailable"
                : status === 413
                  ? "request_too_large"
                  : status === 501
                    ? "upgrade_not_supported"
                    : "application_service_unavailable",
      },
      { status, headers: { "cache-control": "no-store" } },
    );
  }
}
