# VPS Monitor 后端

后端使用 Go、Gin、GORM、PostgreSQL 与 Redis，提供真实的认证、账号安全、用户管理、商家/VPS 目录、库存只读展示、站点设置和管理看板接口。接口契约见 [`../docs/openapi.yaml`](../docs/openapi.yaml)。

采集器、库存写入、调度以及 Redis Stream 消费/确认尚未实现。`WORKER_ENABLED` 必须保持 `false`；三级 `collection_enabled` 只保存未来采集许可，不会触发采集或生成库存。

依赖保持单向：`api/middle → service`，service 依赖 `iface` 中的能力契约，`utils` 提供底层实现，最后由 `initialize` 统一装配。认证和冻结的可替换能力统一定义在 `iface`，API 不读取 service 的内部 provider；JWT、CSRF、密码、SMTP 和 Redis 缓存实现位于 `utils`。`service/mail.go` 与 `service/password_reset.go` 负责验证码业务和数据库事务，`utils/mail` 封装地址规范化、MIME 组装及 SMTP 交互。邮件由 API 同步投递，不经过 `task` 或消息队列。

库存采集是明确的未来扩展点：只保留 `StockObservation`、`StockConsumer`、消息接口和 Redis Stream 外壳。当前不装配读取器，不读取、写入或确认库存消息。

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

服务不会默认迁移数据库，也不会运行 seed。`GET /health/live` 只检查进程；`GET /health/ready` 会检查 PostgreSQL、当前 1–3 号迁移和 Redis，任一未就绪时返回 503。

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

不需要外部服务的检查：

```bash
go test ./...
go vet ./...
go build ./...
```

完整路由集成测试需要专用 PostgreSQL 与 Redis：

```bash
docker compose -f compose.test.yml up -d
TEST_DATABASE_URL='postgres://vps_test:vps_test@127.0.0.1:55432/vps_monitor_test?sslmode=disable' \
TEST_REDIS_ADDR='127.0.0.1:56379' go test ./test -run TestRuntimeRouterFlows -v
docker compose -f compose.test.yml down
```

集成测试会创建独立 PostgreSQL schema，并使用 Redis DB 14；不要把生产连接放入这些测试变量。
