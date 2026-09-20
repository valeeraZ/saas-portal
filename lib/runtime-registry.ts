import { readJson } from "./security.ts";

// Default production ownership is Admin. Legacy projections require explicit opt-in.
export function registryMode() {
  const mode = process.env.PORTAL_REGISTRY_MODE ?? "admin";
  if (!["admin", "environment"].includes(mode))
    throw Error("Invalid registry mode");
  if (
    mode === "admin" &&
    [
      "PORTAL_ALLOWED_APP_ORIGINS",
      "PORTAL_NEXT_APP_ORIGINS",
      "PORTAL_APP_ASSETS",
    ].some((k) => process.env[k]?.trim())
  )
    throw Error("Admin registry cannot be mixed with environment projections");
  return mode;
}
export function infrastructureOrigin(value: string) {
  const u = new URL(value);
  const exact = (process.env.PORTAL_APP_EGRESS_ORIGINS ?? "").split(",");
  const domains = (process.env.PORTAL_APP_DNS_SUFFIXES ?? "")
    .split(",")
    .filter(Boolean);
  const domainAllowed =
    u.protocol === "https:" &&
    !u.port &&
    domains.some(
      (d) =>
        /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(d) && u.hostname.endsWith("." + d),
    );
  if (
    (!exact.includes(u.origin) && !domainAllowed) ||
    u.username ||
    u.password ||
    u.pathname !== "/" ||
    u.search ||
    u.hash ||
    (u.protocol !== "https:" &&
      !(
        process.env.PORTAL_ALLOW_LOCAL_HTTP === "true" &&
        u.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(u.hostname)
      ))
  )
    throw Error("Origin violates infrastructure egress policy");
  return u.origin;
}
export function adminURL(path: string) {
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
        ["localhost", "127.0.0.1"].includes(base.hostname)
      ))
  )
    throw Error("Invalid Admin URL");
  if (!process.env.PORTAL_ADMIN_KEY) throw Error("Missing Admin credential");
  return new URL(path, base);
}
export type RuntimeMetadata = {
  appId: string;
  deploymentId: string;
  suffix: string;
  targetOrigin: string;
  runtime: "http" | "nextjs";
  assetVersion: string | null;
  status: "ready" | "retired";
  assetsUntil: string | null;
  digest: string;
  reviewer: string;
  reviewedAt: string;
};
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function runtimeMetadata(
  value: unknown,
  mount: string,
  version?: string,
): RuntimeMetadata {
  if (!value || typeof value !== "object")
    throw Error("Invalid runtime record");
  const v = value as RuntimeMetadata;
  if (
    typeof v.appId !== "string" ||
    !uuid.test(v.appId) ||
    typeof v.deploymentId !== "string" ||
    !uuid.test(v.deploymentId) ||
    v.suffix !== "/" + mount ||
    !["http", "nextjs"].includes(v.runtime) ||
    (v.runtime === "http"
      ? v.assetVersion !== null
      : typeof v.assetVersion !== "string" ||
        !/^[a-zA-Z0-9-]{1,80}$/.test(v.assetVersion)) ||
    typeof v.digest !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(v.digest) ||
    typeof v.reviewer !== "string" ||
    !v.reviewer.trim() ||
    v.reviewer.length > 200 ||
    typeof v.reviewedAt !== "string" ||
    !Number.isFinite(Date.parse(v.reviewedAt)) ||
    (v.status !== "ready" &&
      !(
        version &&
        v.status === "retired" &&
        typeof v.assetsUntil === "string" &&
        Date.parse(v.assetsUntil) > Date.now()
      )) ||
    (v.status === "ready" && v.assetsUntil !== null) ||
    (version !== undefined &&
      (v.runtime !== "nextjs" || v.assetVersion !== version))
  )
    throw Error("Invalid or inactive runtime record");
  infrastructureOrigin(v.targetOrigin);
  return v;
}
export async function runtimeAsset(mount: string, version: string) {
  const url = adminURL("/v1/runtime/assets");
  url.searchParams.set("suffix", "/" + mount);
  url.searchParams.set("version", version);
  const r = await fetch(url, {
    headers: { "x-portal-key": process.env.PORTAL_ADMIN_KEY! },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok || !r.headers.get("content-type")?.startsWith("application/json"))
    throw Error("Runtime registry unavailable");
  return runtimeMetadata(await readJson(r, 16384), mount, version);
}
