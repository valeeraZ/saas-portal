export type DiscoveredApp = {
  id: string;
  name: string;
  description: string;
  suffix: string;
};
export type DiscoveryPage = {
  items: DiscoveredApp[];
  nextCursor: string | null;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseDiscovery(value: unknown): DiscoveryPage {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid discovery");
  const data = value as Record<string, unknown>;
  if (
    Object.keys(data).some((k) => !["items", "nextCursor"].includes(k)) ||
    !Array.isArray(data.items) ||
    data.items.length > 50 ||
    (data.nextCursor !== null &&
      (typeof data.nextCursor !== "string" || !uuid.test(data.nextCursor)))
  )
    throw Error("Invalid discovery");
  const seen = new Set<string>();
  for (const raw of data.items) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw Error("Invalid discovery item");
    const r = raw as Record<string, unknown>;
    if (
      Object.keys(r).some(
        (k) => !["id", "name", "description", "suffix"].includes(k),
      ) ||
      typeof r.id !== "string" ||
      !uuid.test(r.id) ||
      seen.has(r.id) ||
      typeof r.name !== "string" ||
      !r.name.length ||
      r.name.length > 200 ||
      typeof r.description !== "string" ||
      r.description.length > 1000 ||
      typeof r.suffix !== "string" ||
      !/^\/[a-z][a-z0-9-]{0,62}$/.test(r.suffix)
    )
      throw Error("Invalid discovery item");
    seen.add(r.id);
  }
  return data as DiscoveryPage;
}
