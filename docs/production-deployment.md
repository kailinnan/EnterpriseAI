# 生产部署与恢复

本项目提供单机 Docker Compose 生产部署方案，适合第一版生产或准生产环境。生产服务包括 Web、API、Worker、PostgreSQL/pgvector、Redis、MinIO 和 Caddy。

## 前置条件

- 一台安装 Docker Engine 和 Compose Plugin 的 Linux 服务器
- 域名 A/AAAA 记录指向服务器
- 防火墙开放 80/443
- PostgreSQL、Redis、MinIO 不直接暴露到公网
- 至少一份服务器外部的加密备份存储

## 首次部署

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

编辑 `.env.production`，替换所有示例密钥，重点包括:

- `SITE_ADDRESS`
- `POSTGRES_PASSWORD`
- `MINIO_ROOT_USER`
- `MINIO_ROOT_PASSWORD`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `MODEL_ENCRYPTION_KEY`
- `HTTP_TOOL_ALLOWED_DOMAINS`

部署:

```bash
./infra/scripts/deploy.sh
```

部署脚本会构建 Web/API/Worker 镜像，执行一次性数据库迁移，然后启动应用。数据库迁移通过 `migration` profile 单独运行，避免多 API 实例同时抢跑迁移。

## 镜像与反向代理

- Web、API、Worker 使用独立多阶段 Dockerfile。
- 运行阶段使用非 root 用户。
- Caddy 根据 `SITE_ADDRESS` 自动申请和续期 HTTPS 证书。
- `/api/*` 代理到 API，并对 SSE 禁用响应缓冲。

## 发布与回滚

发布指定版本:

```bash
IMAGE_TAG=2026.08.02 ./infra/scripts/deploy.sh
```

回滚到旧镜像:

```bash
./infra/scripts/rollback.sh 2026.08.01
```

如果版本包含不可逆数据库变更，不能只回滚镜像，必须先确认迁移兼容或执行恢复方案。

## 备份

每日通过 cron 执行:

```bash
BACKUP_DIR=/srv/enterprise-ai-hub/backups ./infra/scripts/backup.sh
```

备份内容包括:

- PostgreSQL custom dump
- MinIO 对象数据归档
- SHA-256 校验文件

生产环境应把备份目录同步到另一台服务器或对象存储，并配置保留周期。

## 恢复

恢复会覆盖当前 PostgreSQL 和 MinIO 数据，只能在维护窗口执行:

```bash
export CONFIRM_RESTORE='RESTORE PRODUCTION DATA'
./infra/scripts/restore.sh /srv/enterprise-ai-hub/backups/20260802T020000Z
```

恢复后检查:

- `/health/ready` 全部依赖为 true
- 随机抽查知识库文档、Chunk 数量和检索结果
- 检查 Worker 是否继续消费队列
- 检查最近审计日志、用量记录和消息记录

## 优雅关闭

API 启用 NestJS shutdown hooks。Worker 在 SIGTERM/SIGINT 时停止接收新任务，等待当前任务结束并关闭数据库连接。Compose 为 API 和 Worker 设置了停止宽限期。

## 监控建议

生产环境至少接入:

- `/api/v1/metrics`
- API 5xx 和 HTTP P95/P99
- 首 Token 延迟、模型耗时、检索耗时
- 文档队列 waiting/failed 数
- PostgreSQL、Redis、MinIO 健康状态
- 磁盘空间和备份失败告警
