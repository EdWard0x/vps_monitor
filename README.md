# VPS Monitor

VPS Monitor 是一个 Go/Gin/GORM/PostgreSQL/Redis 后端与 React 前端组成的 VPS 目录管理项目。当前已实现账号认证、邮箱验证与找回密码、用户与冻结管理、商家/VPS 录入、公开查询、站点设置和管理看板。

- 当前后端需求：[`docs/backend.md`](docs/backend.md)
- 当前前端需求：[`docs/frontend.md`](docs/frontend.md)
- HTTP 契约：[`docs/openapi.yaml`](docs/openapi.yaml)
- 后端启动与初始化：[`backend/README.md`](backend/README.md)
- 前端启动：[`frontend/README.md`](frontend/README.md)

采集器、库存观测写入及消息消费确认刻意留给维护者接入。三级 `collection_enabled` 可以保存，但 `collector_implemented` 固定为 `false`；录入套餐不会生成模拟库存。

数据库迁移必须显式运行，系统不会自动创建演示账号或填充演示数据。全新数据库从 `backend/migrations/001_initial` 开始；旧库升级需要另写转换迁移并先备份。
