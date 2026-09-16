# Portal 身份接入验收

日期：2026-09-15。分支：codex/portal-auth-integration。实现与验收均在 saas-portal 隔离工作区完成，portal-multiapps 源码未修改。

## 已完成

- Next.js 16.3.5 / React 19.2.0 独立 Web/BFF 与锁文件；openid-client 6.8.8。
- OIDC 登录/注册入口、PKCE/state/nonce 回调、加密数据库会话、访问令牌刷新、真实 Auth sid 撤销及 Keycloak 退出。
- 租户创建、分页列表和 URL 选择，Auth 每请求验证成员与租户状态，两个标签页无全局可变租户 Cookie。
- 真实邮件邀请 fragment 清除、登录后恢复、BFF 接受，以及错误反馈。

## 执行证据

| 验证 | 结果 |
| --- | --- |
| npm test | 4 项通过，无跳过 |
| PostgreSQL 会话集成 | 7 项子测试通过：加密/哈希、登录事务单次消费、绝对/空闲过期、并发刷新、故障回滚、篡改拒绝、删除失效 |
| npm run typecheck | 通过 |
| npm run format:check | 通过 |
| npm run build | 生产构建通过 |
| 真实 OIDC | Keycloak code/PKCE 登录成功；Secure/HttpOnly/SameSite=Lax Cookie；访问和刷新令牌不出现在 HTML |
| 真实 Keycloak 刷新 | 人为到期的 BFF access-token 时间触发真实 refresh grant 并更新服务端存储 |
| 双租户 | 创建两个真实租户，两个浏览器标签页分别保持各自 URL/成员上下文 |
| CSRF | 伪造 Origin 的创建请求返回 403 |
| 真实邀请邮件 | Auth 私有任务 → 回环 SMTP 捕获 → fragment 清除 → 第二个用户登录 → 接受邀请 → member 租户页 |
| 拒绝链路 | 非成员无法进入另一个租户；无效邀请被拒绝 |
| 退出 | BFF 数据库会话删除，浏览器退出至 Portal；旧令牌 `/v1/me` 返回 401 |
| 浏览器 QA | 页面标题与入口正确、内容非空、无框架错误层、控制台零 error/warning、登录控件到达真实 Keycloak |
| 响应式 | 默认桌面 1280×720 与手机 390×844；手机无横向溢出，截图视觉检查通过 |

Browser 插件未提供，使用 Playwright 1.63.0 和已缓存 Chromium。截图在 `/private/tmp/portal-desktop.png` 与 `/private/tmp/portal-mobile.png`，不提交生成媒体或凭据。

联调使用固定摘要的 Keycloak 26.7.3、PostgreSQL 17 容器。Auth 实际运行源码与 `1e71386c8ac535135e3c721a2478c2328feb32a2` 的 Python 模块逐文件一致。测试用户、租户、邮件与数据库均为本阶段独立本地环境，未向外部邮箱投递、未发布公共包或生产部署。

首次邮件配置误用了 STARTTLS；已改为 Auth 支持的显式回环明文 SMTP 例外。复跑遇到投递超时，任务保留并重试成功，脚本增加轮询等待实际邮件匹配本次租户。UI QA 发现 favicon 404，已补 SVG 图标并复验控制台清洁。不能将这些本地结果写成生产 SMTP、MFA、注册完整流程或生产发布验收。

## 仍未完成的 PORTAL-02 范围

Admin 安装/权益/部署组合导航、应用代理与静态资源协议、固定 SDK 包消费、旧偏好用户/租户迁移、双副本完整浏览器与代理故障演练。数据库行锁集成验证不等于完整双副本部署验收。本阶段不关闭 PORTAL-02，也不引入模拟授权默认路径。
