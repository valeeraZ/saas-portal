# saas-portal

客户入口与应用数据入口：导航、租户切换、偏好、会话 BFF、代理。只拥有偏好等 Portal 数据；Auth/Registry/计费事实通过服务 API 获取。

状态：执行准备完成，产品代码尚未迁入。

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

生产配置通过环境注入；`.env.example` 不包含可用凭据。所有在线写入都由 Auth 校验权限和持久化租户事实。Admin 导航、代理及旧偏好/SDK 的抽取尚未完成，PORTAL-02 继续开放。
