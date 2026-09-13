# 执行清单

## PORTAL-01 固定浏览器会话和租户路由契约

依赖 AUTH-01、ADMIN-01；保留 basePath 与浏览器安全目录原则。

基线： https://github.com/valeeraZ/portal-multiapps/tree/8cdc9ae56381dcbde8b8d3c965a75a918897896c

## 验收标准

- [ ] 确定 URL/子域与每请求租户上下文，多标签页切换不会串租户
- [ ] 定义会话 BFF、退出/过期及代理信任边界，不继承浏览器可读 DSP token 作为新默认
- [ ] 导航组合成员角色、租户开通、权益与部署状态，再应用隐藏偏好
- [ ] 区分 Registry 最后有效路由与授权失效策略；直接应用 URL 仍需后端鉴权

完成时提交实现、执行过的验证及剩余限制；不得把模拟服务验收写成真实服务验收。

## PORTAL-02 抽取 Portal 并联调真实服务

依赖 SDK-02、PORTAL-01、Auth/Admin 最小真实服务。

基线： https://github.com/valeeraZ/portal-multiapps/tree/8cdc9ae56381dcbde8b8d3c965a75a918897896c

## 验收标准

- [ ] 迁入 apps/portal（移除管理业务）及 packages/registry-cache，独立锁文件、构建与部署
- [ ] 版本化 SDK 依赖；Admin 使用入口跳转，Portal 不复制管理业务
- [ ] 旧 employee_id 按受信身份映射；偏好租户范围迁移具备校验/回滚方案
- [ ] 固定版本镜像下无需 fixture 完成登录、租户切换、导航和应用访问
- [ ] 代理协议、basePath 静态资源、缓存故障与双租户隔离验收通过

完成时提交实现、执行过的验证及剩余限制；不得把模拟服务验收写成真实服务验收。

## GitHub Issues

- [PORTAL-01 固定浏览器会话和租户路由契约](https://github.com/valeeraZ/saas-portal/issues/1)
- [PORTAL-02 抽取 Portal 并联调真实服务](https://github.com/valeeraZ/saas-portal/issues/2)
