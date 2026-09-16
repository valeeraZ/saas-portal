# Next.js 16 native Proxy — 2026-09-16

Portal PR #6 now uses root `proxy.ts` and `NextResponse.rewrite()` to the validated external deployment origin. The previous Route Handler/fetch forwarding implementation is removed; its route remains only as a fail-closed 503 fallback. The public route remains `/tenants/{tenantId}/apps/{mount}/…`, mapped to `/{mount}/…` upstream.

## Request and response boundaries

Proxy reads the session reference from `NextRequest.cookies` explicitly, refreshes the existing encrypted PostgreSQL session and calls Admin's live route authorization for every application request. The existing RS256 assertion, body hash, replay identifier and 30-second expiry remain unchanged. Browser credentials and identity headers are removed before the upstream request; Proxy overrides Host to the allowlisted target. Next's native HTTP transport adds `X-Forwarded-Host` using that trusted upstream Host, not the browser's value.

The matcher only covers tenant application paths, including assets under the application prefix. Portal's own auth, APIs and `/_next` resources remain platform routes. `skipProxyUrlNormalize` preserves protocol paths. RSC, router-state, prefetch and Server Action request headers are included in the approved header set; Origin remains subject to exact-origin write validation.

Request bodies are read from a clone for hashing and then transferred by Next's native body replay. The application limit remains 8 MiB. `proxyClientMaxBodySize` is set to 9 MiB so that Next's truncation threshold does not conceal an oversized body from the explicit 8 MiB rejection. Content-Length is checked early; streamed/chunked bodies are also counted. Cancellation of the tee clone is not awaited, preventing size rejection from waiting on its unread sibling.

External rewrite does not provide an upstream-response hook in `proxy.ts`. **Run `npm start` (`node server.ts`) or `npm run dev`**, which installs the public response boundary in `lib/app-response.ts`. It removes Set-Cookie and internal response headers, confines Location and Next action redirect headers to the current tenant/application prefix, preserves streaming and enforces a 30-second absolute response lifetime. The guard uses the authorized request's overridden headers rather than shared Proxy/render process globals. Running bare `next start` bypasses this response boundary and is not the supported deployment entry.

The custom server accepts `PORT`, `PORTAL_BIND_HOST` (default loopback), and optional `PORTAL_TLS_KEY_FILE` / `PORTAL_TLS_CERT_FILE`; behind a trusted ingress, bind to the container interface and terminate TLS at that ingress. Keep the public `PORTAL_ORIGIN` unchanged. Upgrades are explicitly rejected with 501 until their separate authorization and connection lifecycle are verified.

## Verification

- `npm test`: 9 passing unit tests, including an actual Node HTTP response test covering forged request assertions, Cookie/header removal, streaming, same-tenant HTTP/action redirects and external redirect rejection.
- `npm run typecheck`, `npm run format:check`, `npm run build`: passed. Build output includes the native Proxy entry.
- Real Keycloak/Auth, Admin, PostgreSQL, HTTPS Portal and separately authenticated tenant report backend: `integration/proxy.test.ts` passed after migration. Covers login, HTML/JS/CSS/SVG, persisted POST, two-tenant/two-tab data isolation, independent signature/replay/method/path/body/expiry checks, spoofed headers, CSRF, sanitized redirects, Cookie filtering, SSE, anonymous denial, live role revocation and installation disable.
- Added native transport checks: repeated and encoded query parameters, RSC/router-state header transfer, multipart bytes/hash, complete exact-8-MiB transfer, oversized Content-Length and oversized chunked upload rejection.

Reproduce using the existing setup in `TENANT-APP-PROXY.md`, with Portal launched through `integration/run.py portal` (now the same protected custom server entry). Use the existing `ADMIN_SOURCE`, trusted local TLS certificate and `PORTAL_CHROMIUM` settings. No credentials or assertions are committed.

## Remaining compatibility work

These are local HTTP/native-transport results, not a full Next.js child-application or production certification. The report backend is not a Next.js application. Preserving protocol headers alone does not validate RSC routing, Server Actions, dynamic asset namespaces, image optimization, application Cookie support or two Next.js child applications sharing one origin. SDK configuration, routes, verified server context and navigation helpers remain the next integration increment. Existing apps must derive URLs from the verified public basePath and independently verify the assertion and tenant data scope. No public package, production deployment or PR merge occurred.

## Subsequent SDK / Next.js verification

The later packed-SDK integration now validates two real Next.js child applications, RSC navigation, hydrated Server Actions, resource namespaces/public-file image optimization and same-build dual-tenant persistence. See [Tenant Next validation](TENANT-NEXT-VALIDATION.md) for the exact coverage and remaining limits; the earlier report-backend-only statement above describes the first migration increment.
