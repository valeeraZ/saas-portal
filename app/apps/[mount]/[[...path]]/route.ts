export async function GET() {
  return Response.json({ error: "protected_proxy_required" }, { status: 503 });
}
export const POST = GET;
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
export const HEAD = GET;
export const OPTIONS = GET;
