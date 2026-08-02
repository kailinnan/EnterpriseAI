# Codex 完成进度

本文件记录《企业知识库 Agent 平台 Codex 分阶段实现方案》的当前完成状态。当前实现目标是：即使暂时没有真实大模型 API Key，也要把平台功能链路做完整，后续只通过配置接入真实模型。

## 总体状态

阶段 0 到阶段 12 已全部实现到可运行状态。当前平台属于“准 MVP / 内部试运行版”：本地 Mock 模型可完整验证企业知识库入库、RAG 问答、Agent 工具调用、审批恢复、工作流、配额、评估和生产部署骨架。真实模型供应商尚未做线上 Key 实测，因为当前没有真实 API Key。

## 阶段完成情况

- 阶段 0: pnpm/Turborepo Monorepo、Web/API/Worker、共享包、Docker Compose、健康检查、严格 TypeScript、Vitest 已完成。
- 阶段 1: 用户、租户、成员、Refresh Token、RBAC、TenantContext、审计、租户切换已完成。
- 阶段 2: Model Gateway、OpenAI/OpenAI-Compatible/Mock、密钥加密、超时重试、usage_records、真实 SSE 解析已完成。
- 阶段 3: 知识库、文档上传、MinIO StorageAdapter、BullMQ、重复文件识别、重试、删除和页面已完成。
- 阶段 4: TXT/MD/HTML/DOCX/PDF 解析、Token-aware chunk、批量 embedding、pgvector、FTS、Chunk 预览和重建索引已完成。
- 阶段 5: Hybrid RAG、向量检索、全文检索、RRF、元数据过滤、Reranker 接口、Retrieval Debug 已完成。
- 阶段 6: 助手、会话、消息、SSE RAG 问答、引用校验、历史预算、模型摘要、发布和测试接口已完成。
- 阶段 7: Tool Registry、模型驱动多步 Agent、只读工具、HTTP 白名单、查询模板、运行限制和工具审计已完成。
- 阶段 8: 副作用工具、人工审批、原始参数执行、幂等写入、审批后 Agent 恢复和审批中心已完成。
- 阶段 9: LangGraph 企业问答工作流、四路径路由、节点 Schema、超时重试、审批中断与恢复、Trace 页面已完成。
- 阶段 10: 套餐、订阅、配额、API Key hash/scopes、用量趋势、成本统计和手动充值接口已完成。
- 阶段 11: 结构化日志、Prometheus Metrics、健康检查、Prompt Injection 基础防护、数据导出/删除、RAG 评估和上线检查表已完成。
- 阶段 12: Web/API/Worker 生产镜像、Caddy 反向代理、HTTPS 说明、数据卷、单次迁移策略、优雅关闭、日志轮转、备份/恢复/部署/回滚脚本和生产文档已完成。

## 已完成验收

- Docker 依赖: PostgreSQL/pgvector、Redis、MinIO 均为 healthy。
- `pnpm test:rag`: 通过，覆盖文件上传、Worker 入库、Hybrid Retrieval、助手发布和 SSE 问答。
- `pnpm test:integration`: 通过，覆盖健康检查、Agent、人工审批、重复审批幂等、工作流四路径、工作流审批恢复和 API Key scope 拒绝。
- 生产 Compose: `docker compose --env-file .env.production.example -f docker-compose.production.yml config --quiet` 通过。
- 生产镜像: `enterprise-ai-hub-api`, `enterprise-ai-hub-worker`, `enterprise-ai-hub-web` 已成功构建。

## 剩余真实环境事项

- 配置真实 OpenAI 或 OpenAI-Compatible API Key 后，需要再跑一轮真实模型端到端验收。
- 生产上线前需要替换所有示例密钥，配置域名、HTTPS、CORS、备份存储和监控告警。
- 当前没有接入真实支付网关，BillingProvider 仍是预留接口和手动充值模式。
