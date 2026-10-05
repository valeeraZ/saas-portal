import {
  createSaasPresentation,
  SAAS_THEME_COOKIE,
  SAAS_SIDEBAR_COOKIE,
  SAAS_LOCALE_COOKIE,
} from "@saas-platform/theme";
import { registryMode } from "./runtime-registry.ts";
import { NextResponse, type NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { importPKCS8, SignJWT } from "jose";
import { session, cookieName } from "./http.ts";
import { config } from "./config.ts";
import { appPath, resolveRoute, target, ProxyError } from "./app-routing.ts";
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
        // A tee clone waits for its unread sibling on cancellation.
        // Do not await that promise before returning the size rejection.
        void reader.cancel().catch(() => {});
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
  request: NextRequest,
  params: { mount: string; path?: string[] },
) {
  try {
    const { base, upstream } = appPath(params.mount, params.path);
    if (request.headers.get("upgrade")) throw new ProxyError(501);
    const safe = ["GET", "HEAD"].includes(request.method);
    if (!safe && request.headers.get("origin") !== config().origin)
      throw new ProxyError(403);
    const length = request.headers.get("content-length");
    if (length && Number(length) > 8 * 1024 * 1024) throw new ProxyError(413);
    const s = await session(request.cookies.get(cookieName())?.value ?? "");
    const route = await resolveRoute(params.mount, s);
    const nextApp =
      registryMode() === "admin"
        ? route.runtime === "nextjs"
        : (process.env.PORTAL_NEXT_APP_ORIGINS ?? "")
            .split(",")
            .includes(route.targetOrigin);
    const url = new URL(
      nextApp ? request.nextUrl.pathname : upstream,
      target(route.targetOrigin),
    );
    url.search = new URL(request.url).search;
    const body = safe ? Buffer.alloc(0) : await bodyBytes(request.clone());
    const headers = new Headers();
    for (const name of [
      "accept",
      "accept-language",
      "content-type",
      "range",
      "if-range",
      "if-none-match",
      "if-modified-since",
      "rsc",
      "next-router-state-tree",
      "next-router-prefetch",
      "next-router-segment-prefetch",
      "next-url",
      "next-action",
      "origin",
    ]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    headers.set("accept-encoding", "identity");
    headers.set("host", url.host);
    // These are set only after online authorization; ingress strips client copies.
    headers.set("x-saas-route-origin", url.origin);
    headers.set("x-saas-route-runtime", nextApp ? "nextjs" : "http");
    privateKey ??= importPKCS8(
      readFileSync(process.env.PORTAL_APP_SIGNING_KEY_FILE!, "utf8"),
      "RS256",
    );
    const assertion = await new SignJWT({
      presentation: createSaasPresentation({
        theme: request.cookies.get(SAAS_THEME_COOKIE)?.value,
        sidebarCollapsed:
          request.cookies.get(SAAS_SIDEBAR_COOKIE)?.value === "true",
        locale: request.cookies.get(SAAS_LOCALE_COOKIE)?.value,
      }),
      user: route.user,
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
    return NextResponse.rewrite(url, {
      request: { headers },
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
      },
    });
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
