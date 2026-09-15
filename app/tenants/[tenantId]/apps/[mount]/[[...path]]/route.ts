import { forward } from "../../../../../../lib/app-proxy.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = {
  params: Promise<{ tenantId: string; mount: string; path?: string[] }>;
};
async function handle(request: Request, context: Context) {
  return forward(request, await context.params);
}
export {
  handle as GET,
  handle as HEAD,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
  handle as OPTIONS,
};
