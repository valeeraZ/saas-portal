import {
  registryMode,
  infrastructureOrigin,
  runtimeMetadata,
  type RuntimeMetadata,
} from "./runtime-registry.ts";
import { readJson } from "./security.ts";
import type { Session } from "./store.ts";
export class ProxyError extends Error {
  status: number;
  constructor(status: number) {
    super("Application request rejected");
    this.status = status;
  }
}
export type Route = {
  user: { id: string; displayName: string; email: string };
  userId: string;
  appId: string;
  deploymentId: string;
  suffix: string;
  targetOrigin: string;
  roles: string[];
  runtime?: RuntimeMetadata["runtime"];
};
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function appPath(mount: string, parts: string[] = []) {
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(mount)) throw new ProxyError(400);
  for (const part of parts)
    if (
      !part ||
      part === "." ||
      part === ".." ||
      /[\\/\u0000-\u001f\u007f%]/.test(part)
    )
      throw new ProxyError(400);
  return {
    base: `/apps/${mount}`,
    upstream: `/${mount}/` + parts.map(encodeURIComponent).join("/"),
  };
}
export function target(value: string) {
  if (registryMode() === "admin") return infrastructureOrigin(value);
  const u = new URL(value);
  const allowed = (process.env.PORTAL_ALLOWED_APP_ORIGINS ?? "")
    .split(",")
    .filter(Boolean);
  if (
    !allowed.includes(u.origin) ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    u.pathname !== "/" ||
    (!["https:"].includes(u.protocol) &&
      !(
        process.env.PORTAL_ALLOW_LOCAL_HTTP === "true" &&
        u.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(u.hostname)
      ))
  )
    throw new ProxyError(502);
  return u.origin;
}
export async function resolveRoute(mount: string, s: Session): Promise<Route> {
  appPath(mount);
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
    throw new ProxyError(503);
  const key = process.env.PORTAL_ADMIN_KEY;
  if (!key) throw new ProxyError(503);
  const url = new URL(
    `/v1/${registryMode() === "admin" ? "runtime-route" : "route"}`,
    base,
  );
  url.searchParams.set("suffix", "/" + mount);
  const r = await fetch(url, {
    headers: { authorization: `Bearer ${s.accessToken}`, "x-portal-key": key },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok)
    throw new ProxyError([401, 403, 404].includes(r.status) ? r.status : 503);
  if (!r.headers.get("content-type")?.startsWith("application/json"))
    throw new ProxyError(503);
  const v = (await readJson(r, 16384)) as Route;
  if (
    !v ||
    !v.user ||
    v.user.id !== v.userId ||
    typeof v.user.displayName !== "string" ||
    typeof v.user.email !== "string" ||
    v.suffix !== "/" + mount ||
    !uuid.test(v.userId) ||
    !uuid.test(v.appId) ||
    !uuid.test(v.deploymentId) ||
    !Array.isArray(v.roles) ||
    !v.roles.length ||
    v.roles.length > 100 ||
    !v.roles.every(
      (role) =>
        typeof role === "string" && role.length > 0 && role.length <= 100,
    )
  )
    throw new ProxyError(502);
  if (registryMode() === "admin") runtimeMetadata(v, mount);
  target(v.targetOrigin);
  return v;
}
export function redirectLocation(
  location: string,
  upstream: URL,
  base: string,
  suffix: string,
) {
  const dest = new URL(location, upstream);
  if (
    dest.origin !== upstream.origin ||
    !(dest.pathname === suffix || dest.pathname.startsWith(suffix + "/")) ||
    dest.username ||
    dest.password
  )
    throw new ProxyError(502);
  return base + dest.pathname.slice(suffix.length) + dest.search + dest.hash;
}
