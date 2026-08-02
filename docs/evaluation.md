# RAG 评估

评估数据集由 `question`、`expectedAnswer`、`expectedDocumentIds` 构成。`POST /api/v1/evaluations/run` 对固定数据集执行真实 Hybrid Retrieval，并保存 retrieval hit rate、citation precision 和平均延迟。CI 单元测试覆盖融合、引用安全和工作流路径；连接测试环境时应运行固定企业数据集作为回归门禁。
