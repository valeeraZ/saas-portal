# Runtime application registry

## Status and priority

Automated runtime application registration is a **required production onboarding feature**. The environment-backed lists in Portal PR #6 are a reviewed integration baseline, not the final onboarding control plane. Production self-service onboarding is not complete while adding an application or publishing a Next.js build requires changing Portal environment variables or restarting Portal.

The current implementation reads these server-only values at runtime:

- `PORTAL_ALLOWED_APP_ORIGINS`: the complete egress origin allowlist;
- `PORTAL_NEXT_APP_ORIGINS`: the subset that receives full-path Next.js routing;
- `PORTAL_APP_ASSETS`: reviewed `mount`, `assetVersion` and `origin` projections for immutable `/_next/static/` resources.

They are not browser configuration and are not `NEXT_PUBLIC_*` build inputs. A changed value takes effect after restarting the Portal process; a new Portal build is not inherently required. This is intentionally fail-closed, but it makes Portal deployment part of application onboarding and every Next.js release.

## Required behavior

Admin must become the source of reviewed runtime deployment metadata. A deployment record must expose, at minimum:

| Field             | Purpose                                        |
| ----------------- | ---------------------------------------------- |
| application ID    | Assertion audience and ownership               |
| deployment ID     | Immutable reviewed deployment identity         |
| mount             | Public application path segment                |
| origin            | Authorized upstream origin                     |
| runtime           | Routing contract, initially `http` or `nextjs` |
| asset version     | Immutable Next.js build namespace              |
| status            | Review/readiness/revocation state              |
| reviewed metadata | Reviewer, time and deployable artifact digest  |

Onboarding a new application must create or approve these records through the Admin operator boundary. Publishing a new Next.js build must create a new reviewed deployment/asset version. Neither operation may require rebuilding or restarting Portal.

Portal must resolve the active record from Admin at request time and may cache it for a short, bounded period. Revocation and replacement semantics must be explicit: cache invalidation or TTL must place a documented upper bound on how long a revoked origin or asset version remains routable. An unavailable or malformed registry response must fail closed; Portal must not fall back to an origin supplied by the browser or to stale configuration beyond the allowed window.

## Security boundary

Moving routing metadata into Admin does not turn it into unvalidated browser input. The production design must retain independent Portal enforcement:

- accept only reviewed, ready and active deployments;
- validate origin scheme, normalized host and port before an external rewrite;
- restrict plain HTTP to an explicit loopback development exception;
- bind application ID, deployment ID, tenant, method, exact path/query and body hash into the signed assertion;
- admit only versioned JS, CSS and font paths through the public asset namespace;
- prevent an application from claiming another application's mount or asset namespace;
- preserve the existing response header, redirect, Cookie and timeout boundary;
- audit onboarding, deployment replacement and revocation.

Platform-level network policy should remain static infrastructure configuration. For example, production can constrain deployments to an internal DNS suffix or approved egress network even when individual origins are stored in Admin. The dynamic Registry record and the infrastructure egress policy must both allow the destination.

## Transition

Until the runtime registry is implemented, operators must update all applicable Portal variables and restart every Portal instance. A normal HTTP application on an already allowed origin does not need another entry. A Next.js application needs its origin in both origin lists and needs one `PORTAL_APP_ASSETS` entry for every active `mount + assetVersion`. Old asset versions may remain temporarily for open browser sessions and should be removed after their defined compatibility window.

After migration, keep the environment-backed mode only as an explicit local-development or emergency configuration. Production startup should reject ambiguous mixed ownership between environment projections and Admin records.

## Acceptance criteria

The feature is complete when all of the following are demonstrated:

1. An operator onboards a new HTTP application and a new Next.js application without changing or restarting Portal.
2. A Next.js release publishes a new asset version, serves old and new browser sessions during the compatibility window, and retires the old version without a Portal deployment.
3. A revoked deployment stops new business requests and public asset resolution within the documented bound across multiple Portal instances.
4. Unknown origins, duplicate mounts, version collisions, malformed Registry data and unavailable Admin fail closed.
5. Direct upstream access, forged identity/routing headers, cross-application assets and redirect/Cookie escapes remain denied.
6. Audit records identify who approved, replaced or revoked each deployment and artifact version.
7. Integration tests cover multiple applications, two tenants, rolling deployment, cache invalidation and Registry outage behavior.
