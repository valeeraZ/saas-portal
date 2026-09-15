import { NextResponse } from "next/server";
import { mutation, auth, failure, session } from "../../../lib/http.ts";
export async function POST(request: Request) {
  try {
    const { s, body } = await mutation(request);
    if (
      typeof body.name !== "string" ||
      typeof body.slug !== "string" ||
      Object.keys(body).some((k) => !["name", "slug"].includes(k))
    )
      throw new Error("bad_request");
    const key = request.headers.get("idempotency-key");
    if (!key || !/^[A-Za-z0-9_-]{16,128}$/.test(key))
      throw new Error("bad_request");
    return NextResponse.json(await auth("/v1/tenants", s, "POST", body, key), {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}

export async function GET(request: Request) {
  try {
    const cursor = new URL(request.url).searchParams.get("cursor");
    if (cursor && cursor.length > 4096) throw new Error("bad_request");
    return NextResponse.json(
      await auth(
        "/v1/tenants?limit=100" +
          (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""),
        await session(),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
