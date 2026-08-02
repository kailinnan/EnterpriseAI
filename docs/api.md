# API

Swagger 位于 `/api/docs`。主要接口：`/auth/*`、`/tenants/current/*`、`/model-providers`、`/models`、`/knowledge-bases`、`/documents`、`/retrieval/debug`、`/assistants`、`/conversations`、`/agent-runs`、`/tool-calls`、`/workflow-runs`、`/api-keys`、`/usage`、`/evaluations`、`/audit-logs` 和 `/data`。

`POST /conversations/:id/messages` 返回 SSE：`response.started`、`retrieval.completed`、`response.delta`、`citation`、`response.completed` 或 `response.failed`。
