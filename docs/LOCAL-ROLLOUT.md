# Local Runtime Registry rollout drill

SAA-7 currently targets a local deployment drill, as requested. This runner starts a fresh real Keycloak/PostgreSQL stack and production Node processes; it does not deploy to a remote environment. The Portal source currently includes SAA-6's review candidate. Review/merge that candidate before selecting a production release baseline.

## Prerequisites

- Node 24.10+, npm, Docker Compose and a running local Docker engine.
- A local Docker context using a Unix socket. Remote Docker endpoints are rejected before resources are created.
- Auth checkout with `uv sync --frozen` completed, including its Python test dependencies.
- Installed locked Node dependencies in Portal and Admin (`npm ci`).
- A packed-SDK Next.js tenant consumer containing `next-reports` and `next-metrics`, including package lockfiles and resolvable local tarballs. Generate it in SDK with `npm run pack` then `npm run test:tenant-next`; its directory is recorded in `artifacts/tenant-next-consumer.json`.
- Playwright's matching Chromium, or an explicit existing executable passed with `--chromium`.

## Run

From the Portal checkout:

```sh
/absolute/path/to/saas-auth/.venv/bin/python integration/local-rollout.py \
  --auth /absolute/path/to/saas-auth \
  --admin /absolute/path/to/saas-admin \
  --consumer /absolute/path/to/packed-tenant-consumer \
  --chromium /absolute/path/to/chromium
```

The runner copies Portal/Admin source and installed dependencies into a private temporary directory. It excludes Git, environment files, existing local configuration and build output. Fresh random credentials, signing/session keys and a short-lived test certificate are generated there. Auth uses the selected checkout and virtualenv with a separate generated configuration/database; the runner does not read the source checkout's credentials.

Platform listeners use dynamically selected loopback ports. The shared UI regression additionally requires free loopback ports 59300 and 59301; the runner checks these before starting. Docker project `saas-saa7-<random>` and its database volume belong exclusively to this run. Existing application processes, containers, local `.env.local` files and databases are not reused. Port allocation fails visibly if a concurrent process takes a selected port.

## Sequence and acceptance

1. Start the pinned real Keycloak/PostgreSQL images and wait for identity discovery.
2. Migrate Portal sessions and Auth; migrate Admin before publishing its API. Repeat the Admin migration to verify safe retry.
3. Start Auth, Admin, local SMTP capture and the signed tenant HTTP backend. Build Portal once.
4. Start Portal in legacy `environment` mode. Log in through the real Keycloak browser UI, create two real tenants, grant application access and write tenant data.
5. Register a fresh runtime identity. Confirm pending installations are denied, attest readiness after the live backend is available, then move the installation. Verify the legacy Portal still works with the additive Admin changes.
6. Stop the legacy Portal once and start the same build in Admin mode with all old projections removed. Verify the existing encrypted session and tenant data survive.
7. Build three actual packed-SDK Next.js deployments: two versions of Reports and one Metrics app. Each application receives its own build-time Server Action key; retained versions of Reports share that key. Grant real Auth roles to both tenants.
8. Verify SSR, streaming, hydrated RSC navigation, SDK fetch, Server Action writes/redirects, tenant isolation and unsigned direct-access rejection. Replace Reports while an old browser tab stays open; verify its action succeeds, both asset versions coexist, then the old resource becomes unavailable after the 15-second test retention window.
9. Confirm Portal's process ID and build ID remain unchanged throughout onboarding and application releases. Exercise an explicit Portal rollback to environment mode for the existing HTTP application, then forward again to Admin mode, without deleting database history or replacing session keys.
10. Run `npm run test:keycloak-registry` after rollout, including login/refresh/invitation/logout and role/installation/deployment revocation. Test temporary Admin loss, unreachable Auth, and pause/unpause only this run's real Keycloak container.

11. Run the two packed tenant applications through Portal. Verify shared typography/button styling, signed SSR dark theme, English/Chinese switching across documents, keyboard/mobile navigation and tenant-isolated forms.

The rollback exercise demonstrates the existing HTTP projection. A real deployment must prepare complete legacy projections for every application/build it intends to serve after rollback; environment mode is not an automatic outage fallback. Retaining static assets only supports compatible API/Server Action releases; arbitrary breaking changes remain outside this guarantee.

Admin rejects a resolution if its deployment changes while Auth permissions are being checked. An in-flight browser prefetch can therefore receive 403 during replacement; a fresh request resolves the new deployment. The positive browser release test drains automatic Link prefetches before replacement while keeping the old page loaded for its post-release action. It continues to reject unexpected browser HTTP failures and JavaScript errors. The shared UI scaffold loads packaged Manrope and JetBrains Mono fonts; the shared UI browser suite checks all warning/error diagnostics.

## Evidence and cleanup

The command prints its private temporary directory. `execution.log` contains service/test output; `result.json` records status, ports, image digests, source revisions, completed stages and cleanup status. Source revisions identify checkout commits; uncommitted local changes are also copied, so use clean reviewed checkouts for release evidence. Do not publish the generated configuration, realm or private log without checking for secrets.

Desktop/mobile Next.js screenshots are saved to `/private/tmp/runtime-registry-next-desktop.png` and `/private/tmp/runtime-registry-next-mobile.png`; identity/application screenshots use the existing integration paths under `/private/tmp`. The existing Playwright harness is used because the Browser plugin is unavailable.

Success, test failure and interruption all terminate this run's process groups and execute Compose `down --volumes` for its unique project. `cleanupSucceeded` must be true. Private temporary source/configuration/log files are retained for inspection; remove that exact printed directory when no longer needed. Never remove unrelated projects or volumes.

## Deployment boundary

This is a local native-Node deployment drill with containerized identity/database dependencies. It does not certify a remote server, Kubernetes rollout, production database permissions, ingress/TLS/DNS, backups, secret rotation, capacity or production MFA. Target-environment deployment remains a separate follow-up requiring a named environment and release versions. No production deployment or public package publication is performed by this script.

## Executed on 2026-10-04

The complete drill passed with Node 24.10, Keycloak 26.7.3, PostgreSQL 17 and actual Chromium. It used real OIDC/PKCE login and real Auth roles for the HTTP baseline and three independently compiled packed-SDK Next.js deployments. The post-rollout identity/Registry suite also passed, including invitation email and real Keycloak outage/recovery. No identity protocol stub was used for these runs.

Confirmed Portal session/data preservation during cutover, unchanged Portal process/build during Next.js onboarding and version replacement, successful old-tab Server Action after replacement, old asset expiry, and explicit rollback/forward rollout. Desktop 1280×720 and mobile 390×844 screenshots were inspected. All test containers, volumes and native processes were cleaned up; the result recorded `status: passed` and `cleanupSucceeded: true`.

An initial attempt omitted the HTTP origin from the test operator allowlist and was rejected before cutover. Repeated runs also exposed the intentional concurrent-resolution denial during browser prefetch; the harness now waits for those prefetches before testing a successful replacement. Failed attempts cleaned up their isolated resources. Portal unit, type, formatting and Python lint checks passed. Production rollout remains outside this local acceptance.
