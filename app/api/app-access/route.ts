import { NextResponse } from "next/server";
import { auth, session, mutation, failure } from "../../../lib/http.ts";
import { discoverable } from "../../../lib/discovery.ts";
import { loadAppAccess } from "../../../lib/app-access.ts";
export async function GET(request: Request) {
  try {
    const url = new URL(request.url),
      appId = url.searchParams.get("appId") ?? "";
    if ([...url.searchParams.keys()].some((k) => k !== "appId"))
      throw Error("bad_request");
    const s = await session();
    await discoverable(s, appId);
    return NextResponse.json(await loadAppAccess(s, appId), {
      headers: { "cache-control": "no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const { s, body } = await mutation(request, true, 16384);
    if (
      Object.keys(body).some(
        (k) => !["appId", "roles", "reason"].includes(k),
      ) ||
      typeof body.appId !== "string" ||
      !Array.isArray(body.roles) ||
      !body.roles.length ||
      body.roles.length > 100 ||
      !body.roles.every(
        (r) => typeof r === "string" && /^[a-z][a-z0-9_.-]{0,63}$/.test(r),
      ) ||
      typeof body.reason !== "string" ||
      body.reason.length > 2000
    )
      throw Error("bad_request");
    const key = request.headers.get("idempotency-key") ?? "";
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw Error("bad_request");
    await discoverable(s, body.appId);
    return NextResponse.json(
      await auth(
        `/v1/apps/${body.appId}/requests`,
        s,
        "POST",
        { roles: body.roles, reason: body.reason },
        key,
      ),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
