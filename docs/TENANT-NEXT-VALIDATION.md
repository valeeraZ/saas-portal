# Packed SDK / real Next.js child applications — 2026-09-16

Portal supports two reviewed routing modes. Existing HTTP applications map the public tenant prefix to their fixed suffix. Origins in `PORTAL_NEXT_APP_ORIGINS` preserve the full `/tenants/{tenantId}/apps/{mount}/…` path and use the SDK's independent Node assertion verifier, async Next context getter, Link/router/fetch utilities and configuration wrapper.

Immutable public build JS/CSS/fonts are routed only through `/app-assets/{mount}/{assetVersion}/_next/static/…`. `PORTAL_APP_ASSETS` contains the reviewed mount/version/origin projection; each target must also be in the existing egress allowlist and Next-origin list. No tenant-independent API, image optimization, public file, source map or redirect is admitted through this exception. All tenant application requests still call live Admin/Auth authorization. The protected `server.ts` response boundary also covers public assets and rejects their redirects/Cookies. Use a new assetVersion per published build.

## Reproduce

1. In saas-sdk, run `npm ci`, `npm run pack`, `npm run test:tenant-next`. The packed scaffold bin generates two isolated applications consuming SDK tarballs, builds Next.js 16.3.5 and type-checks both. Read the directory from ignored `artifacts/tenant-next-consumer.json`.
2. Reuse the existing real local Auth/Keycloak/Admin/PostgreSQL setup from integration/README.md and TENANT-APP-PROXY.md. The app test uses the separate report database account/public verification key from `.local/example.env`; it creates its own SDK notes/replay tables and scopes notes by app plus tenant.
3. Add loopback ports 59300 and 59301 to Admin's and Portal's reviewed target allowlists. Set `PORTAL_NEXT_APP_ORIGINS=http://127.0.0.1:59300,http://127.0.0.1:59301`, and `PORTAL_APP_ASSETS` to the JSON below. Restart Admin with its updated operator config, rebuild Portal and launch the protected entry through integration/run.py portal.

```json
[
  {
    "mount": "next-reports",
    "version": "demo1",
    "origin": "http://127.0.0.1:59300"
  },
  {
    "mount": "next-metrics",
    "version": "demo1",
    "origin": "http://127.0.0.1:59301"
  }
]
```

```sh
ADMIN_SOURCE=/absolute/path/to/saas-admin \
SAAS_TENANT_CONSUMER=/absolute/path/from/sdk/artifacts/tenant-next-consumer.json \
NODE_EXTRA_CA_CERTS="$PWD/.local/auth-config/.local/tls.crt" \
PORTAL_CHROMIUM=/absolute/path/to/chromium \
node integration/tenant-next.test.ts
```

The test provisions two real tenants, reviewed deployments, installations and real Auth role grants through the existing operator/Auth APIs. It reuses reviewed application IDs by suffix so repeated local runs do not collide, creates fresh deployment/tenant identifiers, starts the two packed consumers, and stops its child servers afterward. Private environment/configuration is loaded without printing credentials. Operator source imports are setup-only; production Portal continues to use Admin HTTP APIs.

## Results

- SDK: 42 Node tests, 4 Python tests, whole-workspace type checking, package build/pack and isolated legacy packed export/build/basePath consumer checks passed. Both new consumers installed packed SDKs within their own directories, built and type-checked.
- Portal: 10 unit tests, type/format checks and production build passed.
- Real Next.js integration passed: SSR and nonblank pages, streaming/Suspense, Next RSC Link navigation and browser back/forward, **hydrated** Server Action POST (Next-Action header observed), persisted note writes and same-tenant action redirects, SDK fetch, JS/CSS/local fonts, authenticated public files and public-file image optimization.
- Two independent Next applications used separate build namespaces. One application build served two tenant tabs; each saved via a real Server Action and reload returned only its own notes.
- Anonymous tenant APIs and direct upstream business access returned 401. Anonymous public build JS returned 200; an API disguised under the asset namespace returned 404 and asset POST returned 405. Browser-forged identity/Authorization headers did not change the verified tenant. Real role revocation denied the next direct API request (403), while the other tenant remained accessible.
- The existing independent HTTP/report-backend suite was rerun and passed, including multipart, exact 8 MiB body hashes, oversized Content-Length/chunked rejection, signature expiry/replay/request binding, Cookie/redirect boundaries, SSE and installation disable.
- Playwright Chromium at desktop and 390×844 mobile: intended title/heading, no blank page/framework overlay, functional navigation/forms/fetch, no horizontal overflow, loaded stylesheet/local font/images and zero browser error/warning. Screenshots were visually inspected outside source at `/private/tmp/sdk-tenant-next-desktop.png` and `/private/tmp/sdk-tenant-next-mobile.png`. Browser plugin not available; regular Playwright was used.

## Limits and deployment

These are local real-service results; no production deployment, HA/load or browser-engine matrix certification occurred. Image optimization is restricted to application public files, not remote or protected tenant data. WebSocket and application Cookies remain separate work. Run the protected Portal entry and the SDK application adapter; bare next start does not establish these response/request boundaries. Public packages were not released.

The current environment-backed origin and asset projections are an integration baseline. Requiring a Portal configuration change and restart for a new origin or every Next.js asset version is not an acceptable final onboarding workflow. The [runtime application registry](APP-REGISTRY-RUNTIME-CONFIG.md) is a required production feature and defines the Admin metadata, independent Portal checks, transition and acceptance criteria. Production self-service onboarding remains incomplete until that feature is delivered.

SDK protocol and template guidance: saas-sdk/docs/TENANT-NEXT-SDK.md. Existing native transport verification remains in NATIVE-PROXY-VALIDATION.md; its earlier full-Next compatibility limitations are superseded for the flows explicitly tested above.
