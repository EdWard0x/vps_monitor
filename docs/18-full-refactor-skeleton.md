# VPS Monitor 重构文档索引

旧版前后端合并规格已被以下两份独立文档替代，请按职责交给对应执行模型：

- [后端全量重构：外部骨架规格](18-backend-refactor-skeleton.md)
- [前端全量重构：外部骨架规格](19-frontend-refactor-skeleton.md)

两份文档均可独立阅读，并包含完全一致的 `refactor-skeleton-v2` 通信契约。

最终方案：使用 `iface` 目录；不做会话管理；AT/RT 不含 sid 或 jti；用户表通过 token_version 撤销全部旧凭据；SQL fronze 保存冻结记录；Redis 使用用户 ID key 和固定 TTL（默认 300 秒）；解冻后重新登录；删除评论和内置采集器，保留外部库存消息入口。

本次只更新重构文档，没有修改前后端实现或数据库。后续交付目标仍是外部骨架，业务逻辑由维护者自行实现。旧合并版中的会话表、永久 Redis key、冻结同步任务等要求不再适用。
