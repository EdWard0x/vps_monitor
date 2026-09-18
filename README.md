# VPS Monitor

VPS Monitor 是一个 Go/Gin/GORM/PostgreSQL/Redis 后端与 React 前端组成的 VPS 目录管理项目。当前已实现账号认证、邮箱验证与找回密码、用户与冻结管理、商家/VPS 录入、公开查询、站点设置和管理看板。

- 技术文档入口：[`docs/README.md`](docs/README.md)
- 后端技术文档：[`docs/backend.md`](docs/backend.md)
- 前端技术文档：[`docs/frontend.md`](docs/frontend.md)
- 接口说明：[`docs/api.md`](docs/api.md)
- HTTP 契约：[`docs/openapi.yaml`](docs/openapi.yaml)
- Redis Stream 采集链路：[`docs/collection.md`](docs/collection.md)
- 部署与配置：[`docs/deployment.md`](docs/deployment.md)
- 已知问题和验证记录：[`docs/known-issues.md`](docs/known-issues.md)
- 后端启动与初始化：[`backend/README.md`](backend/README.md)
- 前端启动：[`frontend/README.md`](frontend/README.md)

当前已接入 Redis Stream 调度、消费和库存写入，Worker 为独立进程，默认关闭。`collector_implemented` 固定为 `true`，但不是 Worker 健康状态。DMIT/Akko 采集器目前只明确识别无货，Pending 恢复直接 ACK，不重跑采集；具体能力与限制见采集文档。录入套餐不会生成模拟库存。

数据库迁移必须显式运行，系统不会自动创建演示账号或填充演示数据。全新数据库从 `backend/migrations/001_initial` 开始；旧库升级需要另写转换迁移并先备份。
