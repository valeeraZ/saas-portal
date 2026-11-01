import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { config } from "./config.ts";
import { refreshed, remove, get, type Session } from "./store.ts";
import { provider, oidc } from "./oidc.ts";
import { assertOrigin, readJson } from "./security.ts";
export function cookieName(kind = "session") {
  return `${config().secure ? "__Host-" : ""}portal-${kind}`;
}
export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: config().secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
export async function session(sessionId?: string): Promise<Session> {
  const id = sessionId ?? (await cookies()).get(cookieName())?.value;
  const value = id
    ? await refreshed(id, async (s) => {
        if (!s.refreshToken) throw new Error("unauthorized");
        try {
          const tokens = await oidc.refreshTokenGrant(
            await provider(),
            s.refreshToken,
          );
          if (!tokens.expires_in) throw new Error("unauthorized");
          return {
            ...s,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token ?? s.refreshToken,
            idToken: tokens.id_token ?? s.idToken,
            tokenExpires: Date.now() + tokens.expires_in * 1000,
          };
        } catch (e) {
          if (
            e instanceof oidc.ResponseBodyError &&
            e.error === "invalid_grant"
          ) {
            throw new Error("unauthorized");
          }
          throw e;
        }
      })
    : null;
  if (!value || value.tokenExpires <= Date.now()) {
    if (id) await remove(id);
    throw new Error("unauthorized");
  }
  return value;
}
export async function mutation(
  request: Request,
  refresh = true,
  bodyLimit = 4096,
) {
  assertOrigin(request, config().origin);
  const id = (await cookies()).get(cookieName())?.value;
  const s = refresh ? await session() : id ? await get(id) : null;
  if (!s) throw new Error("unauthorized");
  if (request.headers.get("x-csrf-token") !== s.csrf) throw new Error("csrf");
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new Error("bad_request");
  const body = await readJson(request, bodyLimit);
  if (typeof body !== "object" || body === null || Array.isArray(body))
    throw new Error("bad_request");
  return { s, body: body as Record<string, unknown> };
}
export class AuthError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
export async function auth<T = unknown>(
  path: string,
  s: Session,
  method = "GET",
  body?: unknown,
  idempotency?: string,
): Promise<T> {
  const r = await fetch(new URL(path, config().auth), {
    method,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${s.accessToken}`,
      ...(body ? { "content-type": "application/json" } : {}),
      ...(idempotency ? { "Idempotency-Key": idempotency } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new AuthError(
      r.status,
      typeof data.code === "string" ? data.code : "auth_rejected",
    );
  }
  return (r.status === 204 ? null : await readJson(r, 1048576)) as T;
}
export function failure(error: unknown) {
  const status =
    error instanceof AuthError
      ? error.status
      : error instanceof Error && error.message === "unauthorized"
        ? 401
        : error instanceof Error && error.message === "csrf"
          ? 403
          : error instanceof SyntaxError ||
              (error instanceof Error && error.message === "bad_request")
            ? 400
            : 503;
  return NextResponse.json(
    {
      error:
        error instanceof AuthError
          ? error.code
          : status === 401
            ? "unauthorized"
            : status === 403
              ? "csrf"
              : status === 400
                ? "bad_request"
                : "service_unavailable",
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
