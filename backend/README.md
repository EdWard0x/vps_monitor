# VPS Monitor 后端

后端使用 Go、Gin、GORM、PostgreSQL 与 Redis，提供认证、账号安全、用户管理、商家/VPS 目录、库存查询、站点设置和看板接口。独立 Worker 负责采集写入。完整技术文档见 [`../docs/backend.md`](../docs/backend.md)，接口契约见 [`../docs/openapi.yaml`](../docs/openapi.yaml)。

采集链路已经接入，默认 `WORKER_ENABLED=false`。本地使用 `WORKER_ENABLED=true` 启动 `cmd/worker`；Docker 入口还需 `START_WORKER=true`。三级采集许可、商家/VPS 启用条件及解析服务都需满足，详细运行方式见 [`../docs/deployment.md`](../docs/deployment.md)。

依赖保持单向：`api/middle → service`，service 依赖 `iface` 中的能力契约，`utils` 提供底层实现，最后由 `initialize` 统一装配。认证和冻结的可替换能力统一定义在 `iface`，API 不读取 service 的内部 provider；JWT、CSRF、密码、SMTP 和 Redis 缓存实现位于 `utils`。`service/mail.go` 与 `service/password_reset.go` 负责验证码业务和数据库事务，`utils/mail` 封装地址规范化、MIME 组装及 SMTP 交互。邮件由 API 同步投递，不经过 `task` 或消息队列。

内部任务为 `CollectionTask`，Worker 通过 Redis Stream 消费后调用采集器并更新库存。当前两个采集器只明确识别无货；Pending 清理直接 ACK，不执行重试。不要以进程存活判断采集正常，完整语义见 [`../docs/collection.md`](../docs/collection.md)。

## 本地启动

1. 准备 PostgreSQL 17 和 Redis，将 `.env.example` 复制为 `.env`，至少替换数据库地址以及三个不同的 32 字节以上密钥。
2. 显式执行迁移。
3. 启动 API。

```bash
cd backend
cp .env.example .env
go run ./cmd/migrate status --dir migrations
go run ./cmd/migrate up --dir migrations
go run ./cmd/api
```

服务不会默认迁移数据库，也不会运行 seed。`GET /health/live` 只检查进程；`GET /health/ready` 会检查 PostgreSQL、当前 `001_initial` 基线迁移和 Redis，任一未就绪时返回 503。

`APP_MODE=skeleton` 仅用于无外部依赖的路由/失败关闭测试：此模式 ready 返回 503，业务服务返回 501。正常运行使用默认的 `APP_MODE=runtime`。

## 首个管理员

公开注册默认关闭。首个管理员使用以下安全流程创建，不存在默认密码或演示账号：

1. 从环境变量 `ADMIN_PASSWORD` 读取密码，创建普通候选账号。
2. 启动 API，用该账号登录个人中心，通过真实 SMTP 完成邮箱验证。
3. 运行提升命令，然后重新登录以取得反映新角色的令牌。

PowerShell：

```powershell
$env:ADMIN_PASSWORD = 'replace-with-a-strong-password'
go run ./cmd/admin -action create -username administrator -nickname Administrator
go run ./cmd/admin -action promote -username administrator
Remove-Item Env:ADMIN_PASSWORD
```

Bash：

```bash
ADMIN_PASSWORD='replace-with-a-strong-password' go run ./cmd/admin -action create -username administrator -nickname Administrator
go run ./cmd/admin -action promote -username administrator
```

提升命令会拒绝尚未验证邮箱的账号。生产环境需配置 `MAIL_ENABLED=true`、SMTP 主机、端口、发件人、TLS 模式和凭据。

## 迁移

```bash
go run ./cmd/migrate status --dir migrations
go run ./cmd/migrate up --dir migrations
go run ./cmd/migrate down --dir migrations
```

`up` 应用所有待执行版本，`down` 只回滚最近一个版本。迁移使用事务、PostgreSQL advisory lock、连续版本和 SHA-256 校验。当前 `001_initial` 面向空数据库；旧数据库转换必须新增迁移并先备份，不能修改已经应用的迁移。

## 验证

当前可用的业务构建检查：

```bash
go build ./...
```

当前测试包中的 fakeMessages.Ack 签名未同步，`go test ./test -run '^$'` 编译失败；Redis 工具测试还包含固定本地连接和无限读取。不要直接把 `go test ./...` 当作无外部依赖检查。详情见 [`../docs/known-issues.md`](../docs/known-issues.md)。

修复测试编译后，完整路由集成测试需要专用 PostgreSQL 与 Redis：

```bash
docker compose -f compose.test.yml up -d
TEST_DATABASE_URL='postgres://vps_test:vps_test@127.0.0.1:55432/vps_monitor_test?sslmode=disable' \
TEST_REDIS_ADDR='127.0.0.1:56379' go test ./test -run TestRuntimeRouterFlows -v
docker compose -f compose.test.yml down
```

集成测试会创建独立 PostgreSQL schema，并使用 Redis DB 14；不要把生产连接放入这些测试变量。
