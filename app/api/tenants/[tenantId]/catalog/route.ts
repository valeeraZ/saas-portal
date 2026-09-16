import { NextResponse } from "next/server";
import { session, failure } from "../../../../../lib/http.ts";
import { loadCatalog } from "../../../../../lib/catalog.ts";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  try {
    const { tenantId } = await params;
    const cursor = new URL(request.url).searchParams.get("cursor");
    return NextResponse.json(
      await loadCatalog(tenantId, await session(), cursor ?? undefined),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
