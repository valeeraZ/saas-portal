import { loadCatalog } from "./catalog.ts";
import type { Session } from "./store.ts";
import { parseDiscovery, type DiscoveryPage } from "./discovery-contract.ts";
export {
  parseDiscovery,
  type DiscoveryPage,
  type DiscoveredApp,
} from "./discovery-contract.ts";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function loadDiscovery(
  s: Session,
  cursor?: string,
): Promise<DiscoveryPage> {
  if (cursor && !uuid.test(cursor)) throw Error("bad_request");
  // Reuse the catalog's origin validation before sending the private credential.
  return loadCatalog(s, cursor, "discovery", parseDiscovery);
}
export async function discoverable(s: Session, appId: string) {
  if (!uuid.test(appId)) throw Error("bad_request");
  // UUID-ordered discovery paging; never expose unpublished applications via this BFF.
  const before = BigInt("0x" + appId.replaceAll("-", "")) - 1n;
  const hex = before.toString(16).padStart(32, "0");
  const cursor =
    before >= 0n
      ? `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
      : undefined;
  const page = await loadDiscovery(s, cursor);
  if (page.items[0]?.id !== appId) throw Error("bad_request");
}
