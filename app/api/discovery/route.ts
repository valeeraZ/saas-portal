import { NextResponse } from "next/server";
import { session, failure } from "../../../lib/http.ts";
import { loadDiscovery } from "../../../lib/discovery.ts";
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    if ([...url.searchParams.keys()].some((k) => k !== "cursor"))
      throw Error("bad_request");
    return NextResponse.json(
      await loadDiscovery(
        await session(),
        url.searchParams.get("cursor") ?? undefined,
      ),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
