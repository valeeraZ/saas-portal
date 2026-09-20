# 新 session 交接

工作目录：`/Users/sylvain/Work/saas-portal`。
源仓库：`/Users/sylvain/Work/portal-multiapps`；固定基线 `8cdc9ae56381dcbde8b8d3c965a75a918897896c`，分支 `codex/saas-split-baseline`。
从基线读取源码，不能修改、删除或清理源仓库中的既有实现。采用复制抽取并记录路径映射，源 Git 历史保留在原私有仓库，通过 commit 链接追溯。

已确认：多租户 SaaS、独立登录、企业 SSO、四个独立仓库。职责以 README 和总体计划为准。四仓库仅初始化文档，没有产品实现，不能当作服务已交付。

先阅读 EXECUTION.md 和 GitHub Issues；从第一个未完成且依赖已满足的 Issue 开始。创建 codex/ 前缀工作分支，完成真实验证后提交。包名暂保留 @saas-platform/*；不要发布公共包或部署生产。不要重新设计其他仓库的事实所有权。

基线验证：Node 73 passed / 1 PostgreSQL integration skipped（未配置数据库）；Python 4 passed；所有 workspace typecheck passed。生产构建结果见 BASELINE.md。

当前需明确的后续决策：身份组件、会话/租户路由、私有包发布通道、首批客户与计费规则。SDK-01 的兼容抽取可以先执行，无需等待这些产品决策。

## 当前更新

SDK 已合并；用户已确认托管、开放注册、审核后外部应用同域接入以及 Keycloak。以 PLATFORM-DECISIONS.md 为当前产品约束，初始文档中的未实现状态仅适用于本仓库。Auth 候选契约已有本地提交，尚未实现真实服务。

## 租户模型约定

用户明确只保留 Tenant（租户）概念。租户直接拥有成员、邀请和租户角色，不增加公司、部门或其他中间层级。一个用户可加入多个租户；Membership 关联 user_id 与 tenant_id。当前 API/字段/事件均使用 tenant 命名。

## 2026-09-15 Portal 身份接入

已新增独立 Web/BFF，与真实 Auth/Keycloak 验证登录、租户创建和两个标签页切换、SMTP 邀请接受、越权拒绝以及会话退出。初始文档中“Portal 尚无实现”已被本更新替代，旧源仓库未改动。会话/租户方案见 ADR 0003，本地运行见 integration/README.md。本阶段不关闭 PORTAL-02 的 Admin、代理、SDK 与偏好抽取工作。

## 2026-09-15 — Admin application directory

Tenant pages now consume the real Admin catalog using server-only PORTAL_ADMIN_URL / PORTAL_ADMIN_KEY. The directory combines online Auth membership/application-role checks with Admin installation, entitlement and deployment facts. Empty and unavailable states are distinct; pagination supports empty role-filtered pages. Internal targets and service credentials never reach the browser. App cards intentionally have no launch link until the tenant-aware application proxy is implemented. See docs/ADMIN-CATALOG-VALIDATION.md for evidence.

## 2026-09-16 — tenant application HTTP proxy

Application cards now open `/tenants/{tenantId}/apps/{mount}/`. A Node route handler performs session validation and private Admin route authorization for each page/resource/API request; explicit target allowlist, filtered headers, tenant-preserving redirects and signed per-request app assertions protect the forwarding boundary. Real example backend validates the assertion and stores notes in a separate tenant-scoped database. See docs/TENANT-APP-PROXY.md and docs/PROXY-VALIDATION.md. HTTP and bounded SSE only; WebSockets and legacy Next application adapters remain future work.

## 2026-09-16 — native Proxy transport implemented

PR #6 now uses root proxy.ts and native external rewrite. The old route handler is a fail-closed 503 fallback, and server.ts is the required public response-protection entry. Session/real Admin authorization, body-bound RS256 assertions and tenant isolation remain enforced per request. Nine unit tests, type/format checks, production build and real Auth/Keycloak/Admin/report-backend integration passed, including multipart, exact-8-MiB replay and oversized Content-Length/chunked rejection. See [native validation](NATIVE-PROXY-VALIDATION.md). Full SDK-aware Next.js child-application RSC/Server Actions/assets and Upgrade compatibility remain unvalidated; no merge or production deployment occurred.

## 2026-09-20 — Runtime Application Registry

Based on merged main `e0e177f`, branch `codex/runtime-application-registry` makes Admin the default runtime source. Runtime/business and public asset lookups are online per request with no cached allow or stale fallback. The independent Portal egress policy supports approved DNS subdomains and exact exceptions. Mixed legacy ownership fails startup; legacy local/emergency use requires explicit environment mode. Native response protection now uses Proxy-generated origin/runtime context so dynamic deployments preserve redirect/Cookie boundaries. See APP-REGISTRY-RUNTIME-CONFIG.md and RUNTIME-REGISTRY-VALIDATION.md. Auth/SDK protocol changes are not required.
