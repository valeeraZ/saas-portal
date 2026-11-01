import { session, auth, failure } from "../../../lib/http.ts";
import { loadCatalog } from "../../../lib/catalog.ts";
export async function GET(request: Request) {
  try {
    const s = await session();
    await auth("/v1/me", s);
    const url = new URL(request.url);
    if (
      [...url.searchParams.keys()].some((k) => k !== "cursor") ||
      url.searchParams.getAll("cursor").length > 1
    )
      return Response.json({ error: "invalid_input" }, { status: 400 });
    return Response.json(
      await loadCatalog(s, url.searchParams.get("cursor") ?? undefined),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
