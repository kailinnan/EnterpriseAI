# 架构

Next.js Web 仅持有短期 access token；NestJS API 从 JWT 构建 `Principal/TenantContext`，所有业务 SQL 显式约束 `tenant_id`。PostgreSQL + pgvector 保存业务及向量数据，Redis + BullMQ 承担文档长任务，MinIO 保存原文件，独立 Worker 解析、切片、向量化并以版本切换发布索引。

模型调用只能经过 `@hub/ai-core` 的 `ModelProviderAdapter`。模型供应商密钥使用 AES-256-GCM 应用层加密；平台 API Key 仅保存单向哈希。RAG 使用 pgvector 与 PostgreSQL FTS 双路召回、RRF 融合；聊天以 SSE 输出事件，服务端验证 chunk 引用后持久化。

受控 Agent 通过 Zod Tool Registry 执行工具；副作用调用进入人工审批。企业问答由 LangGraph 条件状态图编排，节点具有独立 Schema、超时、分类重试和轨迹。套餐配额在调用前检查并按实际 Token 结算。

## 安全边界

- tenantId 只来自已验证的 Token。
- 上传类型、MIME、大小与 SHA-256 均校验。
- Provider 密钥与刷新令牌不明文落库。
- Prompt 将资料标记为不可信数据；引用必须属于本轮召回集合。
- Worker 任务载荷、对象 key 和每条查询均包含 tenantId。
