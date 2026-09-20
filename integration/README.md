# Portal / Auth / Keycloak 本地真实联调

此环境独立于其他 Auth 开发容器；创建专用数据库、两个已验证用户和随机凭据，不清空现有业务库。Auth 仍拥有用户、成员、邀请和会话事实。需要 Node >=24.10、Docker Compose、Python >=3.11，以及完成 `uv sync --frozen` 的 Auth 源码目录。本次验证 Auth 源码对应 `1e71386c8ac535135e3c721a2478c2328feb32a2`。

```sh
npm ci
export AUTH_SOURCE=/absolute/path/to/saas-auth
"$AUTH_SOURCE/.venv/bin/python" integration/prepare.py
docker compose --env-file .local/auth-config/.env -f integration/compose.yaml up -d
python3 integration/run.py migrate
npm run build
```

Keycloak 启动后，在独立终端分别启动：

```sh
export AUTH_SOURCE=/absolute/path/to/saas-auth
python3 integration/run.py auth
```

```sh
/absolute/path/to/saas-auth/.venv/bin/python integration/mailpit.py
```

```sh
python3 integration/run.py portal
```

Portal https://127.0.0.1:58999、Auth http://127.0.0.1:59000、Keycloak https://127.0.0.1:59443、PostgreSQL 55434、SMTP 59025 全部监听回环地址。生成的测试证书有效期 7 天。浏览器测试仅在此环境忽略测试证书错误，服务器通过独立 CA 文件验证 Keycloak，不关闭服务器 TLS 验证。浏览器手工操作可将生成证书加入本地测试信任。

```sh
npm exec playwright -- install chromium
export AUTH_SOURCE=/absolute/path/to/saas-auth
npm run test:integration
```

已有 Chromium 时可设置 `PORTAL_CHROMIUM=/absolute/path/to/chromium-executable`。Browser 插件未在本次会话提供，因此使用 Playwright。截图默认保存 `/private/tmp/portal-desktop.png` 和 `/private/tmp/portal-mobile.png`，邮件捕获保存在忽略的 `.local/latest-mail.json`。测试读取本地凭据，不打印令牌、邮件链接或密码。

测试创建带随机后缀的租户和邀请，不需要 Auth bootstrap 或清库。复跑会保留测试租户；停止服务并按需移除**本环境**的卷，不操作其他容器。配置生成器拒绝覆盖已有凭据。`integration/run.py worker` 运行真实 Auth 私有任务单次投递或上游撤销。

## 配置与协议

Keycloak 客户端 `saas-portal` 为 confidential client，开启 code flow、强制 S256 PKCE、关闭 password grant 与 service account；回调 `PORTAL_ORIGIN/api/auth/callback`，退出回调 `PORTAL_ORIGIN/`。访问令牌带 `saas-auth` audience；Auth 用户客户端白名单包含 `saas-portal`。Portal 只持有该客户端凭据，不持有 Auth introspection 或会话 worker 凭据。

生成配置中的 Auth / Portal 使用不同数据库及账号。生产启动先注入 `.env.example` 对应变量并执行会话迁移，再 `npm run build && npm start`，由入口提供 HTTPS；`PORTAL_ORIGIN` 必须与入口一致。定期运行 `npm run session:prune` 清理过期会话。所有副本共享数据库和稳定的 32 字节会话加密密钥。生产不可启用回环 HTTP 例外或使用本地测试证书。

## Real Admin directory

Configure `PORTAL_ADMIN_URL` and `PORTAL_ADMIN_KEY` on the Portal server. The matching Admin service must have the same key, its own database and ADMIN_AUTH_URL. Use saas-admin/integration/README.md to start and test the real catalog. Missing/unavailable Admin is shown as “应用目录暂时不可用”; a verified empty response shows “暂无可用应用”. Application launching/proxying is not part of this directory increment.

## Runtime Registry regression

The historical scripts above exercise the explicitly selected `PORTAL_REGISTRY_MODE=environment` baseline. Fresh `prepare.py` config records that choice. To run the new default Admin mode, follow [Runtime Registry validation](../docs/RUNTIME-REGISTRY-VALIDATION.md); it starts independent built Portal/Admin replicas and creates uniquely named disposable databases. Do not combine its configuration with `.env.local` from the historical stack.
