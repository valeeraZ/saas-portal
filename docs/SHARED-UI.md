# Portal and SDK shared UI

Portal consumes `@saas-platform/ui`, `@saas-platform/theme` and `@saas-platform/shell`. Child applications consume the same packages through the SDK. Admin owns its independent shadcn UI and does not import these packages.

## Installation and updates

The SDK packages are private and currently delivered as npm tarballs. `vendor/sdk` contains the three compiled packages, not copied application components. `manifest.json` records their version, source revision, npm integrity and SHA-256. `npm ci` needs no sibling checkout or workspace links; the lockfile pins the installed package graph.

To update from a reviewed SDK checkout:

```sh
# In saas-sdk
npm ci
npm run pack
# In saas-portal
node scripts/sync-sdk.mjs /absolute/path/to/saas-sdk
npm install
npm test
npm run typecheck
npm run build
```

Commit the tarballs, manifest and lockfile together. Merge the SDK change before the corresponding Portal change. Private registry publication can replace this delivery mechanism later without changing component imports.

## Styles and layout

Import `@saas-platform/ui/globals.css` once in the root layout and configure `@tailwindcss/postcss`. It contains Tailwind v4, shared semantic tokens, Manrope and JetBrains Mono fonts, shadcn styles, and explicit sources for the compiled UI and Shell packages. Consumer application utilities are also scanned by Tailwind. Fonts and generated CSS travel through each child's existing versioned asset namespace.

Use direct exports such as `@saas-platform/ui/components/button`, `@saas-platform/shell/page-header` and `@saas-platform/shell/presentation-controls`. A tenant application's document contains one `SaasShell`; Portal's proxy preserves native Next.js navigation, streaming and Server Actions instead of nesting the child in another Shell.

## Language and presentation

Portal and tenant scaffolds use next-intl with centralized `messages/en.json` and `messages/zh.json`. Shared Shell captions live in the SDK; applications supply `getSaasShellMessages(locale)`. Locale selection does not prepend a path segment, so tenant mounts, login return targets and asset paths retain their existing contracts.

Theme, collapsed sidebar and locale are browser preferences (`saas-theme`, `saas-sidebar-collapsed`, `saas-locale`). This release uses local preference mode; these preferences are not synchronized to user accounts across devices. The SDK applies the same local storage state and cookies in both documents.

Portal normalizes presentation values and signs them into the request-bound assertion. The SDK verifies signature, request path/method/body, audience, replay and live access as before, then exposes only normalized presentation through the verified tenant context. The child uses it for initial SSR theme and language. Browser identity headers cannot override it, Portal login cookies are not forwarded, and presentation never grants permissions.

## Verification

SDK `npm run verify` checks package declarations, installed exports, example builds, ordinary scaffolds, the legacy Portal fixture, and two independently installed tenant scaffolds. Portal's isolated local rollout drill additionally exercises real Keycloak login, tenant creation/invitations, authorization failures, SDK fetch, RSC and Server Actions, typography/component parity, signed dark SSR, both languages and mobile navigation.

Run the drill described in `docs/LOCAL-ROLLOUT.md` with the packed consumer path from `saas-sdk/artifacts/tenant-next-consumer.json`. It creates and cleans up its own disposable services and database volumes.
