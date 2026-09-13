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
