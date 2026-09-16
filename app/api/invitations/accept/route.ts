import { NextResponse } from "next/server";
import { mutation, auth, failure } from "../../../../lib/http.ts";
export async function POST(request: Request) {
  try {
    const { s, body } = await mutation(request);
    const key = request.headers.get("idempotency-key");
    if (
      typeof body.token !== "string" ||
      body.token.length < 32 ||
      body.token.length > 2048 ||
      Object.keys(body).length !== 1 ||
      !key ||
      !/^[A-Za-z0-9_-]{16,128}$/.test(key)
    )
      throw new Error("bad_request");
    return NextResponse.json(
      await auth("/v1/invitations/accept", s, "POST", body, key),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
