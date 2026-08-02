# Codex 进度

## 阶段 0

- pnpm/Turborepo、Web/API/Worker、共享包、Docker Compose、健康检查、严格 TypeScript 和测试命令已建立。

## 阶段 1

- 用户、租户、成员、Refresh Token、审计表；登录、轮换/撤销、TenantContext、RBAC、requestId/traceId 和成员页面已实现。

## 阶段 2

- Model Gateway、OpenAI/OpenAI-compatible/Mock、AES-256-GCM、超时/有限重试、成本与 usage_records 已实现。

## 阶段 3–4

- MinIO 上传、BullMQ、五类文档解析、Token-aware 切片、批量 embedding、版本切换、HNSW/FTS、Chunk 页面已实现。

## 阶段 5

- 租户隔离的双路召回、元数据过滤、RRF 和 Debug 页面已实现。

## 阶段 6

- 助手/会话/消息、历史预算、SSE 六类事件、停止、摘要、引用白名单校验和聊天页已实现。

## 阶段 7–8

- Zod Tool Registry、全局工具超时和输出上限、只读工具自主选择、HTTP SSRF 防护、查询模板、Agent 限制与 SSE 已实现。
- 副作用分级、pending approval、角色审批、原始校验参数、写操作幂等、Agent 恢复和完整审计已实现。

## 阶段 9

- LangGraph 四路条件工作流、独立节点模块、运行时状态/输出 Schema、节点超时与分类重试、轨迹 SSE、中断恢复和 Trace 页面已实现。

## 阶段 10

- 套餐、订阅、额度桶、六类配额限制、租户/Key 限流、API Key 哈希与 scopes、用量趋势、人工充值和 BillingProvider 接口已实现。

## 阶段 11

- 结构化脱敏日志、Prometheus 指标、四依赖健康检查、Prompt Injection 防护、数据导出/删除、可重复评估、CI 和上线检查表已实现。

## 验证记录

- Docker Compose 的 PostgreSQL/pgvector、Redis、MinIO 均为 healthy；迁移和开发数据 seed 通过。
- 真实文件经 MinIO、BullMQ、Worker 完成解析和索引；混合检索命中，SSE 对话引用真实 Chunk。
- Agent 审批、重复审批幂等、工作流四路径及恢复、API Key scope、跨租户 404、评估和 Metrics 均已运行态验证。
- `pnpm test:integration` 提供可重复的服务级验收；CI 执行 lint、strict typecheck、单元/回归评估和生产构建。
