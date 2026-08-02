# Enterprise AI Hub

Enterprise AI Hub 是一个面向企业知识库和企业 Agent 场景的多租户平台。当前代码已经覆盖原分阶段方案的阶段 0 到阶段 12：认证与租户、模型网关、知识库入库、Hybrid RAG、流式问答、Agent 工具调用、人工审批、LangGraph 工作流、配额/API Key、评估可观测性，以及生产 Docker 部署。

当前没有真实大模型 API Key 也可以运行。系统默认 seed 了 Mock 模型，用于完整验证入库、检索、问答、Agent 和工作流；后续有真实模型 Key 后，只需要在后台或 API 中配置 OpenAI/OpenAI-Compatible Provider 和模型配置，不需要改业务代码。

## 核心能力

- 邮箱密码登录、多租户隔离、RBAC、租户切换和审计日志
- OpenAI、OpenAI-Compatible 和 Mock Model Gateway
- TXT、Markdown、HTML、DOCX、PDF 上传、解析、切片、向量化和 pgvector 索引
- pgvector 语义检索、PostgreSQL 全文检索、RRF 融合和 Retrieval Debug
- 助手配置、发布、测试、会话、SSE 流式 RAG 问答和引用校验
- 模型驱动的多步 Agent、Tool Registry、HTTP 白名单、只读查询模板和业务示例工具
- 副作用工具人工审批、幂等执行、审批后 Agent/Workflow 恢复
- LangGraph 四路径企业问答工作流、节点追踪、错误/超时处理
- API Key scopes、配额、用量、成本、RAG 评估、Prometheus Metrics
- 生产 Compose、Caddy HTTPS/SSE 代理、非 root 镜像、备份/恢复/部署/回滚脚本

## 技术栈

- Web: Next.js 15, React 19, TypeScript
- API: NestJS 11, Swagger, SSE, Zod
- Worker: Node.js, BullMQ, PDF.js, Mammoth, Cheerio
- Data: PostgreSQL 16 + pgvector, Redis, MinIO
- AI: OpenAI-Compatible Adapter, LangGraph, Mock Provider
- 工程: pnpm, Turborepo, Vitest, Playwright, ESLint

## 本地启动

Windows PowerShell:

```powershell
cd D:\C\rust\agent

if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
}

docker compose up -d
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

PowerShell 5.1 不支持 `&&`，请按上面分行执行。当前 API、Worker 和迁移脚本已经从根目录 `.env` 加载配置，不需要手动把 `.env` 导入当前终端。

## 服务地址

- Web: http://localhost:3000
- API: http://localhost:3001
- Swagger: http://localhost:3001/api/docs
- Health: http://localhost:3001/health/ready
- MinIO Console: http://localhost:9001

本地开发账号:

```text
owner@example.com
DevPassword123!
```

## 验证命令

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:integration
pnpm test:rag
pnpm test:e2e
```

其中 `test:integration` 验证依赖健康、Agent、审批幂等、工作流四路径和 API Key scopes；`test:rag` 验证真实文件上传、Worker 入库、Hybrid Retrieval、助手发布和 SSE 问答。

## 接入真实模型

1. 登录后台，进入“模型”页面。
2. 创建 OpenAI 或 OpenAI-Compatible Provider，填写 Base URL 和 API Key。
3. 创建 Chat 模型配置和 Embedding 模型配置，并勾选对应 capability。
4. 新建知识库时选择真实 Embedding 模型。
5. 新建助手时选择真实 Chat 模型。
6. 上传一份测试文档，运行 `pnpm test:rag` 或在后台手动完成入库和问答验证。

如果没有真实 Key，继续使用 seed 的 Mock 模型即可，所有核心流程都能跑通。

## 生产部署

生产部署说明见 [production-deployment.md](docs/production-deployment.md)。主要入口:

```bash
cp .env.production.example .env.production
./infra/scripts/deploy.sh
```

上线前请完成 [launch-checklist.md](docs/launch-checklist.md)。生产环境必须替换所有示例密钥，并完成备份恢复演练。

## 操作文档

完整本地使用步骤见 [operation-guide.md](docs/operation-guide.md)。
