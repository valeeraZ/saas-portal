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
  items: CatalogItem[];
  nextCursor: string | null;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function record(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
export function parseCatalog(value: unknown): Catalog {
  if (
    !record(value) ||
    Object.keys(value).some((k) => !["items", "nextCursor"].includes(k)) ||
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
export async function loadCatalog<T = Catalog>(
  s: Session,
  cursor?: string,
  resource: "catalog" | "discovery" = "catalog",
  parse: (value: unknown) => T = parseCatalog as (value: unknown) => T,
): Promise<T> {
  if (cursor && !uuid.test(cursor)) throw Error("Invalid catalog cursor");
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
  const url = new URL("/v1/" + resource, base);
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
  return parse(await readJson(r, 262144));
}

export async function loadAllApps(s: Session) {
  const items = new Map<string, CatalogItem>(),
    seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await loadCatalog(s, cursor);
    for (const app of page.items) items.set(app.id, app);
    cursor = page.nextCursor ?? undefined;
    if (cursor) {
      if (seen.has(cursor)) throw Error("Invalid catalog cursor cycle");
      seen.add(cursor);
    }
  } while (cursor);
  return [...items.values()];
}
