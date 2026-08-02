# 上线检查表

- [ ] 所有示例密钥已替换，主密钥来自 Secret Manager
- [ ] HTTPS、CORS 精确来源、Secure Cookie 已启用
- [ ] PostgreSQL/MinIO 备份及恢复演练通过
- [ ] API Key scopes、RBAC、跨租户测试通过
- [ ] HTTP Tool 域名白名单仅含业务必需域名
- [ ] Prompt Injection 回归不能改变 Tool 权限
- [ ] Metrics、结构化日志、队列告警已接入监控
- [ ] RAG 固定数据集 hit rate 与 citation precision 达标
- [ ] 数据导出、租户删除和审计保留策略经法务确认
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` 全部通过
