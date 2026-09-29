# VPS Monitor

VPS 商家与套餐目录、库存采集、用户收藏和微信补货通知。后端使用 Go/Gin/PostgreSQL/Redis，前端使用 React/TypeScript/Vite。

技术文档集中维护两份：

- [前端技术文档](docs/frontend.md)：启动、页面、认证、收藏、通知回跳、构建与测试。
- [后端技术文档](docs/backend.md)：业务与采集、配置、部署、备份和数据库增量迁移。

历史实施提示词、交接记录和重复技术说明已清理，历史内容可从 Git 查询。

```text
backend/                API、Worker、管理/迁移命令与 SQL 历史
frontend/               React 应用与测试
docs/                   前后端技术文档
docker-compose.vps.yaml VPS 镜像部署编排
.env.vps.example       VPS 环境变量模板
redis.conf             Redis RDB + AOF 持久化配置
.github/workflows/      镜像发布
```

应用使用真实接口，无演示账号和浏览器 Mock。本次重构版本从空数据库全新部署，统一使用 `001_baseline`，不迁移旧 main 数据。首次发布后固定这份基线，后续表结构变化追加 `002、003…`，以保留已有数据为前提完成增量迁移。安装和升级流程见后端文档。

VPS 编排从 GHCR 拉取同一标签的前后端镜像；后端容器同时运行 API 和 Worker，并连接 PostgreSQL、Redis、FlareSolverr。外部网关只连接前端容器；部署前按[后端部署流程](docs/backend.md#6-部署与升级流程)完成数据库迁移并核对镜像标签。
