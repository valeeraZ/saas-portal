function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
function origin(name: string) {
  const url = new URL(required(name));
  if (url.username || url.password || url.search || url.hash)
    throw new Error(`Invalid ${name}`);
  if (url.protocol !== "https:") {
    if (
      process.env.PORTAL_ALLOW_LOCAL_HTTP !== "true" ||
      url.protocol !== "http:" ||
      !["localhost", "127.0.0.1"].includes(url.hostname)
    )
      throw new Error(`HTTPS required: ${name}`);
  }
  return url;
}
export function config() {
  const portal = origin("PORTAL_ORIGIN");
  if (portal.pathname !== "/")
    throw new Error("PORTAL_ORIGIN must be an origin");
  return {
    origin: portal.origin,
    issuer: origin("PORTAL_OIDC_ISSUER").href.replace(/\/$/, ""),
    auth: origin("PORTAL_AUTH_URL").origin,
    clientId: required("PORTAL_OIDC_CLIENT_ID"),
    secret: required("PORTAL_OIDC_CLIENT_SECRET"),
    secure: portal.protocol === "https:",
  };
}
