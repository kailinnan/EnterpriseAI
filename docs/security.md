# 安全

生产环境必须替换所有示例密钥，使用 32 字节随机主密钥的 Base64 作为 `MODEL_ENCRYPTION_KEY`。Refresh Token 通过 HttpOnly Cookie 传输且数据库只保存哈希。部署到 HTTPS 时 Cookie 自动启用 Secure。

所有新端点必须使用全局 JWT Guard；公开接口必须显式 `@Public()`。角色写操作使用 `@RequireRoles()`。不得将模型供应商密钥、完整 Prompt 或令牌写日志。

Tool Registry 仅注册内置白名单工具。HTTP Tool 强制 HTTPS、域名白名单、DNS 解析后的内网/metadata 地址拒绝、禁止重定向并限制响应长度。查询工具只接受服务端预定义 `queryId`，不接受 SQL。`low/high` 副作用工具必须审批，执行时使用持久化的原始已验证参数和幂等键。

文档内容始终被视为不可信数据，不能改变系统指令、身份、Tool 权限或审批策略。日志层对 `sk-`、`hub_` 和 Bearer 凭据脱敏。
