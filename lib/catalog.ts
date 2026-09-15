import { readJson } from "./security.ts";
import type { Session } from "./store.ts";
export type CatalogItem = {
  id: string;
  name: string;
  description: string;
  suffix: string;
  roles: string[];
};
export type Catalog = {
  tenantId: string;
  items: CatalogItem[];
  nextCursor: string | null;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function record(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
export function parseCatalog(value: unknown, tenant: string): Catalog {
  if (
    !record(value) ||
    value.tenantId !== tenant ||
    !Array.isArray(value.items) ||
    value.items.length > 50 ||
    (value.nextCursor !== null &&
      (typeof value.nextCursor !== "string" || !uuid.test(value.nextCursor)))
  )
    throw Error("Invalid catalog");
  const seen = new Set<string>();
  for (const item of value.items) {
    if (
      !record(item) ||
      Object.keys(item).some(
        (k) => !["id", "name", "description", "suffix", "roles"].includes(k),
      ) ||
      typeof item.id !== "string" ||
      !uuid.test(item.id) ||
      seen.has(item.id) ||
      typeof item.name !== "string" ||
      !item.name.length ||
      item.name.length > 200 ||
      typeof item.description !== "string" ||
      item.description.length > 1000 ||
      typeof item.suffix !== "string" ||
      !/^\/[a-z][a-z0-9-]{0,62}$/.test(item.suffix) ||
      [
        "api",
        "auth",
        "admin",
        "settings",
        "tenants",
        "invitations",
        "health",
      ].includes(item.suffix.slice(1)) ||
      !Array.isArray(item.roles) ||
      !item.roles.length ||
      !item.roles.every((r) => typeof r === "string" && r.length > 0)
    )
      throw Error("Invalid catalog item");
    seen.add(item.id);
  }
  return value as Catalog;
}
export async function loadCatalog(
  tenant: string,
  s: Session,
  cursor?: string,
): Promise<Catalog> {
  if (!uuid.test(tenant) || (cursor && !uuid.test(cursor)))
    throw Error("Invalid tenant cursor");
  const base = new URL(process.env.PORTAL_ADMIN_URL ?? "");
  if (
    base.pathname !== "/" ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    (base.protocol !== "https:" &&
      !(
        process.env.PORTAL_ALLOW_LOCAL_HTTP === "true" &&
        base.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(base.hostname)
      ))
  )
    throw Error("Invalid Admin origin");
  const key = process.env.PORTAL_ADMIN_KEY;
  if (!key) throw Error("Missing Admin credential");
  const url = new URL(`/v1/tenants/${tenant}/catalog`, base);
  if (cursor) url.searchParams.set("cursor", cursor);
  const r = await fetch(url, {
    headers: {
      authorization: `Bearer ${s.accessToken}`,
      "x-portal-key": key,
      accept: "application/json",
    },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw Error("Catalog unavailable");
  return parseCatalog(await readJson(r, 262144), tenant);
}
