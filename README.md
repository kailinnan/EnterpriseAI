# Enterprise AI Hub

多租户企业知识库、流式 RAG、受控 Agent 与 LangGraph 工作流平台（阶段 0–11）。

## 启动

1. `Copy-Item .env.example .env`
2. `docker compose up -d`
3. `pnpm install`
4. `pnpm db:migrate && pnpm db:seed`
5. `pnpm dev`

开发账号：`owner@example.com` / `DevPassword123!`（仅开发环境可 seed）。

- Web: http://localhost:3000
- API / Swagger: http://localhost:3001/api/docs
- MinIO Console: http://localhost:9001

静态与单元验证：`pnpm lint && pnpm typecheck && pnpm test && pnpm build`

服务启动后运行完整集成验收：`pnpm test:integration`。该脚本覆盖依赖健康检查、只读 Agent、自主选 Tool、写操作审批与幂等、四类工作流路径和 API Key scope。
