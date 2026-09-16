import { target, ProxyError } from "./app-routing.ts";
// Only immutable, public build artifacts have a tenant-independent namespace.
export function publicAppAsset(url: URL) {
  const match =
    /^\/app-assets\/([a-z][a-z0-9-]{0,62})\/([a-zA-Z0-9-]{1,80})(\/_next\/static\/[a-zA-Z0-9_./-]+)$/.exec(
      url.pathname,
    );
  if (
    !match ||
    url.search ||
    !/\.(js|css|woff2?|ttf|otf)$/.test(match[3]) ||
    match[3]
      .split("/")
      .slice(1)
      .some((part) => !part || part === "." || part === "..")
  )
    throw new ProxyError(404);
  const entries = JSON.parse(process.env.PORTAL_APP_ASSETS ?? "[]") as Array<{
    mount: string;
    version: string;
    origin: string;
  }>;
  if (!Array.isArray(entries)) throw new ProxyError(503);
  const entry = entries.find(
    (value) => value.mount === match[1] && value.version === match[2],
  );
  if (!entry) throw new ProxyError(404);
  const origin = target(entry.origin);
  if (!(process.env.PORTAL_NEXT_APP_ORIGINS ?? "").split(",").includes(origin))
    throw new ProxyError(503);
  return new URL(url.pathname, origin);
}
