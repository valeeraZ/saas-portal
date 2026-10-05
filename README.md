# Current platform

See [User/application contract](docs/USER-APP-PLATFORM.md). Historical tenant instructions below are superseded.

# saas-portal

客户入口与应用数据入口：导航、租户切换、偏好、会话 BFF、代理。只拥有偏好等 Portal 数据；Auth/Registry/计费事实通过服务 API 获取。

状态：已实现身份/租户入口、应用目录、Next.js Proxy 和 Runtime Application Registry；详情以当前交接文档为准。

- [执行清单](docs/EXECUTION.md)
- [新 session 交接](docs/HANDOFF.md)
- [四仓库总体计划](docs/saas-platform-plan.md)（初始化快照；后续跨仓库决策以 saas-admin 为协调入口）

源代码基线：[8cdc9ae](https://github.com/valeeraZ/portal-multiapps/tree/8cdc9ae56381dcbde8b8d3c965a75a918897896c)。

- [当前平台约束与本仓库下一步](docs/PLATFORM-DECISIONS.md)

## 当前可运行阶段：Portal 身份与租户入口

独立 Next.js Web/BFF 已接入真实 Auth 用户 API 与 Keycloak，支持登录/注册入口、会话刷新与退出、租户创建/分页列表/按 URL 切换，以及邮件邀请接受。源 portal-multiapps 保留不变。运行与真实联调步骤见 [integration/README.md](integration/README.md)，协议见 [会话与租户 ADR](docs/adr/0003-portal-session-tenant-context.md)。

```sh
npm ci
npm test
npm run typecheck
npm run build
```

Portal 与子应用现在通过 SDK 共享 shadcn、Tailwind CSS、主题和导航框架，支持中文/英文切换。安装、打包更新与展示偏好边界见 [共享 UI 说明](docs/SHARED-UI.md)。

生产配置通过环境注入；`.env.example` 不包含可用凭据。所有在线写入都由 Auth 校验权限和持久化租户事实。Admin UI 保持独立；当前展示偏好仅在本地浏览器保存。

## Next.js 16 原生 Proxy

应用请求由 `proxy.ts` 完成会话和实时授权后使用 external rewrite 转发。运行 `npm start` / `npm run dev`，通过 `server.ts` 保留响应 Cookie 过滤、租户内重定向和流式超时边界；不要使用裸 `next start` 作为部署入口。验证与完整 SDK/Next.js 子应用兼容性的剩余工作见 [原生迁移记录](docs/NATIVE-PROXY-VALIDATION.md)。

## Runtime Application Registry

默认 `PORTAL_REGISTRY_MODE=admin`：应用目标、运行时类型和版本资源由 Admin 动态解析，不缓存授权或旧路由。先部署 Admin migration 003 并审核部署记录，再按 [迁移说明](docs/APP-REGISTRY-RUNTIME-CONFIG.md) 配置独立网络边界并删除旧环境投影。迁移后新增应用和发布版本无需重启 Portal。[验证步骤与范围](docs/RUNTIME-REGISTRY-VALIDATION.md)。
