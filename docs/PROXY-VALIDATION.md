# Tenant proxy validation — 2026-09-16

Local real services: Keycloak/Auth, PostgreSQL, Admin and HTTPS Portal, plus an independently authenticated report backend with its own PostgreSQL database/login. Test entry: integration/proxy.test.ts.

Passed:
- Portal 8 unit tests, typecheck, production build; Admin 4 contract tests and typecheck.
- Real login → tenant directory → Open App → report HTML, JS, CSS/SVG and backend API.
- Two tabs in two tenants save different notes; reload retrieves only the current tenant's records.
- Backend signature validation rejects missing/forged/expired assertions, replay, wrong method/path/body hash and mismatched tenant/base path.
- Forged browser Authorization, forwarding/identity headers are not trusted or passed through. Exact-origin write enforcement rejects foreign-origin POST.
- Internal application redirect translates to the same tenant URL. External redirect is rejected; upstream Set-Cookie and internal header are stripped.
- SSE response completes through the proxy. Responses are no-store.
- Anonymous API access returns 401. Auth role revocation returns 403 on the next direct App API request while the other tenant remains accessible. Disabled installation returns 404.
- Desktop/mobile screenshots show functional report pages; mobile has no horizontal overflow; no browser page errors. Images are outside source at /private/tmp/portal-proxy-desktop.png and /private/tmp/portal-proxy-mobile.png.

These are local validation results, not production deployment or full compatibility certification. No public SDK package was released. The example verifies request authentication independently; deploying another application requires it to implement the same verified context and tenant isolation contract. WebSocket, legacy Next RSC/Server Actions and long-lived stream support are not included. See TENANT-APP-PROXY.md for protocol, limits and reproduction.
