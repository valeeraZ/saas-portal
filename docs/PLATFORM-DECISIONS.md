# 已确认的平台约束

状态：用户已确认；身份契约候选以 saas-auth 的 codex/auth-01-contracts 分支为准（本地提交 0df81f6，尚未发布）。不复制 Auth OpenAPI 作为独立事实源。

- 平台托管，交付 Helm 与 CI/CD；开放注册。
- 采用平台托管 Keycloak，接受 Kubernetes Operator 运维；Auth 拥有稳定用户映射、租户、成员、邀请和业务角色，供应商拥有认证凭据。
- 允许外部开发者提交应用，平台审核并控制上线；每次版本更新均重新审核。
- 业务应用前端共用域名，以可自定义 suffix 挂载。路径不是浏览器隔离边界，获准应用共享同源信任。
- 后端逐请求验证用户、租户、角色和应用开通/权益。禁止仅凭浏览器 tenant_id 或隐藏导航授权。
- SDK 已合并，统一 @saas-platform/* 与通用 SaaS 命名。源仓库不改动，公共包不发布。

身份服务尚未实现。首发 SAML、部署地区和邮件供应商未明确；这些不能被写成已交付能力。

## 本仓库下一步

PORTAL-01 固定 BFF 会话与每请求租户上下文；不要用一个全局可变 Cookie 表示当前租户。两个标签页不同租户必须能并存。suffix 是应用挂载点，不能当租户标识或权限证明。

BFF 使用标准 OIDC code + PKCE，随机 HttpOnly/Secure 会话 Cookie，令牌保留服务端。不同同域应用可发起同源请求，CSRF/Cookie 属性不构成应用间隔离。导航组合 Auth 权限与 Admin 开通/权益/部署状态。

租户 URL/header 编码方案尚未冻结；保留平台路径 /api、/auth、/admin、/_next、/settings、/tenants。不得为了维持旧代理路径而省略服务端租户验证。真实 IdP、退出/撤销、浏览器和双租户测试属于后续实现验收。
