# User/application platform

The platform owns user identity and user-to-application grants. Each application owns its business data and sharing policy. There is no active tenant model, tenant selector, membership requirement or tenant-scoped URL. Auth supplies `/v1/me` and `/v1/apps/{appId}/permissions`; Admin supplies the live eligible catalog and reviewed deployment routes. A publication makes a deployment available globally but never grants user access.

Portal and integrated SDK applications render `SaasPlatformShell` from the same packed shadcn/Tailwind packages. The complete sidebar loads every `/api/navigation` page under the Portal browser session, refreshes on focus and clears on failure. Child servers receive a short-lived, request-bound assertion with verified user/profile, roles and presentation. They never receive Portal login cookies. Application routes are `/apps/{mount}/…`; immutable public build files keep `/app-assets/{mount}/{version}/…`.

Upgrade Auth migration 003 and Admin migration 005, then publish reviewed deployments and explicit user grants through Admin. Historical tenant tables/installations remain in private `legacy_tenancy` schemas for operator-controlled export, not active authorization. No automatic privilege widening or business-data merging occurs. Existing child apps must migrate to SDK 0.2 and remove tenant identifiers. Keep legacy application databases unchanged until their owners decide how to migrate business records.

Run `integration/local-rollout.py --auth ../saas-auth --admin ../saas-admin --consumer <SDK artifacts/app-next-consumer.json directory> --chromium <executable>` with Auth's virtualenv Python. The runner creates isolated configuration, containers, databases and service ports, builds two packed SDK applications, exercises real OIDC and browser behavior, and cleans services afterward. Existing local databases are not reset. Results and logs are private temporary files.

Older tenant validation documents and integration scripts describe historical releases and are superseded by this contract and `integration/app-next.test.ts`.
