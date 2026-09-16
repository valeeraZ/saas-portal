# Tenant application proxy

> Updated to Next.js 16 native `proxy.ts` / external rewrite. Run the protected custom server entry (`npm start`); the Route Handler is now only a fail-closed fallback. See [native migration and validation](NATIVE-PROXY-VALIDATION.md). Full SDK-aware Next.js child-application compatibility remains a separate integration increment.

Implemented 2026-09-16. Entry URL: `/tenants/{tenantId}/apps/{mount}/...`. For example `/tenants/UUID/apps/reports/` maps to `/reports/` at the authorized deployment origin. Tenant identity is part of every URL, including assets and API calls, so separate tabs do not share a mutable tenant selection cookie.

## Request boundary

1. Portal resolves and refreshes its existing encrypted server session.
2. The private Admin route API checks live Auth membership/application roles and Admin deployment/installation/entitlement state. No cached allow or fallback route is used.
3. Portal independently validates the tenant, suffix, response and deployment origin against `PORTAL_ALLOWED_APP_ORIGINS`. Only explicit origins are accepted; HTTP is restricted to the existing explicit loopback development exception. Operator-reviewed DNS and deployment egress restrictions are part of the trusted infrastructure, not supplied by browser parameters.
4. Portal signs a short request assertion and forwards only approved request headers. App responses stream back with `Cache-Control: no-store` and a restricted response header set.

The application receives `X-Saas-Request`, an RS256 JWT issued by `PORTAL_ORIGIN` with the application UUID as audience, the stable Auth user ID as subject, `iat`, `exp` (30 seconds), `jti`, `tenantId`, `roles`, `deploymentId`, `method`, `path` (upstream path including query), `basePath` (full public tenant/application prefix) and SHA-256 `bodyHash`. Configure the private signing key only on Portal and the public verification key on each app. Pin issuer/audience/algorithm and bind all request fields before handling business data. The example rejects replay using its own PostgreSQL table shared by backend replicas. Use a coordinated key rotation plan; the current example loads one configured public key.

Auth access/refresh tokens, Portal cookies, Admin service key, browser-provided identity and forwarding headers are never trusted upstream. Next adds X-Forwarded-Host from the authorized target Host. App `Set-Cookie`, internal headers and hop-by-hop headers are not returned. App state should use its tenant-scoped API; this proxy does not support application cookies or forwarding end-user Authorization headers.

Writes require an exact Origin match to the configured Portal origin; body size is capped at 8 MiB. Bodies are buffered to sign their hash; HTTP responses are streamed. Requests/streams are bounded to 30 seconds and honor client cancellation. GET/HEAD must be read-only at the application. Successful route resolution covers that request, not a perpetual grant for a long-lived connection.

Redirects may only remain on the same upstream origin and within the same application suffix; Portal translates them back into the same tenant mount. External and sibling-application redirects are rejected. Encoded/decoded traversal and separator ambiguity in application path segments are rejected.

## Application compatibility

Apps must build resource links and fetch URLs from the **verified** `basePath` claim (or use equivalent relative paths). The proxy does not rewrite HTML/JavaScript bodies or infer tenant context from Referer. A legacy Next.js build with globally rooted `/_next` or a fixed single-tenant basePath needs a tenant-aware adapter or deployment strategy before it can use this route. This increment validates a real independently authenticated example backend, not all legacy SDK/Next.js apps.

The example in integration/example-app.ts renders a report UI, serves JS/CSS/SVG, accepts note writes, verifies the signed request independently, and always scopes business SQL by tenant. It has its own database/login and no Portal/Auth database access. It is a working integration example, not a production application or a released SDK package.

HTTP page/resource/API forwarding and bounded SSE are implemented. WebSocket upgrades, long-lived streams, arbitrary legacy Next Server Actions/RSC support and application cookie compatibility are not implemented. Approved apps share the Portal browser origin and its trust; paths are not an isolation boundary against malicious approved JavaScript.

## Local run

Start the existing real Portal/Auth/Keycloak and Admin catalog environment, then:

```sh
# Portal checkout
/absolute/path/to/saas-auth/.venv/bin/python integration/prepare-proxy.py
node --env-file=.local/example.env integration/example-app.ts
```

Preparation creates a separate proxy_example database/account and local RSA keys; it refuses to overwrite existing proxy configuration. It updates the ignored Portal environment with `PORTAL_APP_SIGNING_KEY_FILE`, `PORTAL_APP_KEY_ID` and `PORTAL_ALLOWED_APP_ORIGINS`.

```sh
# Admin checkout, after applying new source
node --env-file=.env.local src/cli.ts migrate
node --env-file=.env.local src/server.ts
# Portal checkout: rebuild and restart its HTTPS test process
npm run build
python3 integration/run.py portal
```

The integration test uses the trusted operator API to create reviewed deployment metadata, bind the allowlisted example origin, grant real Auth roles and install the application for two real tenants:

```sh
ADMIN_SOURCE=/absolute/path/to/saas-admin \
NODE_EXTRA_CA_CERTS="$PWD/.local/auth-config/.local/tls.crt" \
PORTAL_CHROMIUM=/absolute/path/to/chromium \
node integration/proxy.test.ts
```

The test harness imports Admin's operator implementation only for setup. Production Portal only calls Admin over HTTP and does not import Admin source or access its database.
