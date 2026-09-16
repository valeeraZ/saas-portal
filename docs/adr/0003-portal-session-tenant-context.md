# Portal BFF 会话与每请求租户上下文

状态：本阶段实现；2026-09-15。

Portal 采用 OIDC authorization code + PKCE，通过 openid-client 校验 issuer、state、nonce 与 token response。登录事务为 10 分钟、一次性消费，Cookie 绑定浏览器。成功登录后验证真实 Auth `/v1/me`，轮换 Portal 会话引用，避免沿用旧会话。访问与刷新令牌以 AES-256-GCM 加密保留在 Portal PostgreSQL；Cookie 仅含随机 256 位引用，数据库存引用哈希。HTTPS Cookie 为 `__Host-portal-session`、Secure、HttpOnly、SameSite=Lax。

Portal 会话绝对期限 8 小时、空闲期限 30 分钟；刷新令牌不延长绝对期限。刷新通过 PostgreSQL 行锁在副本与标签页间串行，故障回滚并拒绝当前操作。权限事实由 Auth 在线读取，Portal 会话缓存不替代成员或租户状态校验。

租户地址 `/tenants/{tenantId}`，不写全局“当前租户” Cookie。每次加载向 Auth `/v1/tenant-context` 提交 URL 选择，由 Auth 检查成员与租户状态。两个标签页可分别访问不同租户。应用 suffix 与租户无关，后续代理和应用后端仍必须逐请求鉴权。

创建租户和接受邀请由 BFF 转发 Auth；浏览器不直接取得访问令牌。写操作要求精确配置 Origin 与会话 CSRF token，JSON 大小受限；幂等键在失败重试时保留。退出使用稳定幂等键先撤销 Auth sid，再删除 BFF 会话并清 Cookie，随后标准 Keycloak end-session 跳转。该标准跳转带 ID token hint；访问和刷新令牌不进入浏览器。Auth 撤销失败不报告成功，保留重试入口；上游撤销任务归 Auth。

邀请令牌仅由邮件 URL fragment 进入页面，客户端读取后立即通过 history.replaceState 清除。为保留跨登录回调的邀请，令牌暂存当前标签页 sessionStorage，10 分钟后不再恢复；成功接受后清除。提交经过 BFF，Auth 校验已验证邮箱、邀请期限及租户/成员状态。不得把该暂存理解为同域应用之间的安全隔离，获准的同域应用共享浏览器信任。

本阶段不迁入旧 DSP token、旧管理业务或假权限。Admin 导航组合、业务应用代理、SDK 固定包消费、偏好迁移与双副本代理故障验收仍属后续 PORTAL-02；身份页面完成不意味着 PORTAL-02 全部完成。
