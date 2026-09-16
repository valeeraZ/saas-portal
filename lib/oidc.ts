import * as oidc from "openid-client";
import { config } from "./config.ts";
let discovery: Promise<oidc.Configuration> | undefined;
export function provider() {
  const c = config();
  return (discovery ??= oidc
    .discovery(new URL(c.issuer), c.clientId, c.secret, undefined, {
      timeout: 10,
      ...(c.issuer.startsWith("http:")
        ? { execute: [oidc.allowInsecureRequests] }
        : {}),
    })
    .catch((error) => {
      discovery = undefined;
      throw error;
    }));
}
export { oidc };
