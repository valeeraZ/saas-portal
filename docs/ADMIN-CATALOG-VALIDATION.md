# Real Admin catalog validation

Validated locally 2026-09-15/16 on codex/admin-catalog with Portal codex/portal-admin-catalog. Auth source: 1e71386c8ac535135e3c721a2478c2328feb32a2. Real Keycloak 26.7.3 and PostgreSQL 17 from the isolated Portal integration environment; no Auth/catalog fixtures.

## Results

- Admin: 3 contract tests, typecheck, format check and Docker build passed. Docker runs Node 24.10.0 with a pinned base-image digest.
- Portal: 5 tests, typecheck, format check and Next.js production build passed.
- Real browser login, Auth tenant/role creation, Admin operator writes and Portal catalog rendering passed.
- A role-less owner sees no App; assigning the Auth application role makes the App visible only in the installed tenant. A second tenant has an empty catalog.
- Missing Portal service credential and unknown tenant rejected. Suspended tenant rejected using current Auth context.
- App inactive, deployment unready, installation disabled, entitlement revoked or expired all remove the App on the next request. Auth role revocation removes it from the reloaded Portal page.
- Concurrent identical operations produce one durable operation; conflicting reuse fails. Invalid installation rolls back its operation record. Reviewed deployment identity/digest/reviewer cannot be overwritten.
- New Admin processes read the same persisted catalog after restart. An Admin process configured with an unreachable Auth returns 503 without partial or stale catalog data.
- A page of 50 role-filtered candidates returns an empty list with a cursor; Portal loads the subsequent authorized App correctly.
- Desktop 1280×720 and mobile 390×844 rendered meaningful content; title correct, no framework overlay, console/page-error checks clean, no mobile horizontal overflow. Screenshots visually inspected outside repositories: /private/tmp/portal-admin-catalog.png and /private/tmp/portal-admin-mobile.png.

Reproduce with integration/README.md. The test harness retains isolated test records and never prints tokens or service credentials. Browser plugin was unavailable; Playwright used the installed Chromium runtime. CI configuration checks contracts, types and image build; these local real-service results are not claims of remote CI execution.

## Boundaries

This increment delivers a private Portal-to-Admin catalog and operator-managed facts. Readiness is an operator attestation after external verification, not an automated deployment check. Entitlement is a manually maintained grant with expiry, not billing. Application targets and launch URLs are intentionally absent pending the tenant-aware proxy; directory visibility does not enforce application backend access.

Full management UI/API, worker/SSRF checks, outbox/event reconciliation, billing, production secret distribution and full deployment failure/HA exercises remain outside this increment. No production deployment or public package release. ADMIN-01/02/03 remain open for their broader acceptance criteria.
