# 上线检查表

以下清单用于真实生产上线。代码能力已经具备，但每个生产环境仍必须逐项确认。

- [ ] 所有示例密钥已经替换，主密钥来自 Secret Manager 或等价的安全存储
- [ ] `MODEL_ENCRYPTION_KEY` 长度和格式正确，并已安全备份
- [ ] 域名、HTTPS、CORS 精确来源、Secure Cookie 已启用
- [ ] PostgreSQL、Redis、MinIO 不暴露到公网
- [ ] PostgreSQL 和 MinIO 备份已自动化，且完成恢复演练
- [ ] API Key scopes、RBAC、跨租户隔离测试通过
- [ ] HTTP Tool 白名单只包含业务必需域名
- [ ] Prompt Injection 回归测试不能改变 Tool 权限
- [ ] Metrics、结构化日志、队列告警已接入监控
- [ ] RAG 固定数据集 hit rate、citation precision、groundedness 达标
- [ ] 数据导出、租户删除和审计保留策略经过法务或业务确认
- [ ] `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` 通过
- [ ] `pnpm test:integration` 和 `pnpm test:rag` 在目标环境或预生产环境通过
- [ ] 真实大模型 API Key 已配置，并完成端到端问答、入库和用量验证
