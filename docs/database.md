# 数据库

迁移在 `packages/db/migrations/0001_initial.sql`。包含阶段 1–6 全部实体、pgvector 扩展、HNSW 与 GIN 索引。文档索引用 `index_version` 构建新版本，并在单事务内切换 `documents.version`，查询只读取当前版本。
