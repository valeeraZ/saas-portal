# More apps and access requests

The homepage and shared SDK sidebar show apps the current user may access. `/more-apps` lists all active, published and eligible apps, including unauthorized ones. Users select multiple business-defined roles and optionally explain their request. Existing granted roles are checked and disabled. An app without declared active roles cannot be requested.

Pending, approved and rejected states and review comments appear on the app card. One pending request per user/app prevents duplicates. A rejected request can be resubmitted; an approved user may request additional roles. Auth rejects undeclared or retired roles, and the Portal BFF independently checks current publication eligibility. Reviewer and requester identity cannot be supplied in the browser payload.

UI uses packed `@saas-platform/ui` 0.1.2 and `@saas-platform/shell` 0.2.1; shared checkbox and textarea components support the forms. Portal and child apps share More apps navigation, bilingual messages, theme and responsive styles. Admin retains its own UI.

Pending requests refresh every 10 seconds while visible. A changed grant refreshes the local navigation and server-rendered directory. Shared sidebars also refresh every 15 seconds while visible and when focused. Protected app requests still authorize on the server each time, so display refresh never grants access.

Admin defines roles in its app editor and reviews requests under `/en/requests` or `/zh/requests`. Approval creates/merges the user grant transactionally in Auth and records the verified operator plus required comments. Rejection records the decision without granting access. Each child app implements the business meaning of the approved role keys.

Deploy Auth migration 004 and its APIs, then Admin discovery/console and the updated Portal/SDK packages, after SAA-11. Existing published apps with explicit grants have their role keys imported by the migration. Configure roles for newly published apps before accepting requests.

Run `Auth/.venv/bin/python integration/local-rollout.py --auth ../saas-auth --admin ../saas-admin --consumer <SDK packed app-next consumer directory> --chromium <path>` for disposable real Keycloak/Postgres/browser validation. It covers multi-role requests, verified operator approval/rejection, comments, sidebar updates, protected SDK app entry, responsive UI and the existing SSR/RSC/Server Action authorization checks. The runner cleans only its own disposable containers and volumes.
