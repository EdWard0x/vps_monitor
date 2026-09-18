# 部署、配置与运行手册

核对日期：2026-09-19。以下命令是运行说明；本次文档工作未对真实数据库迁移、未发送邮件、未运行采集、未部署容器。

## 1. 运行依赖与目录

- Go：模块声明 1.25.0，实际依赖最低版本由 Go 工具链校验；本次本机已成功构建。
- Node.js：前端 Docker 构建镜像为 Node 22，使用 npm 和 package-lock.json。
- PostgreSQL：部署使用 17；Redis：部署使用 8，开启 AOF。
- 真实邮件功能需要 SMTP；采集需要独立的 FlareSolverr 兼容服务。

API 默认监听 :8080，前端开发 :5173，解析服务默认 localhost:8191/v1。从 backend 启动 Go 命令，使 config.Load 找到 backend/.env；根目录 Compose 的 .env 是变量替换来源，不会自动成为 Go 本地运行配置。

## 2. 本地初始化

先准备隔离的开发数据库与 Redis，不覆盖已存在的配置。首次复制模板：

```powershell
cd backend
Copy-Item .env.example .env
```

编辑 DATABASE_URL、REDIS_*、JWT_ACCESS_SECRET、JWT_REFRESH_SECRET、CSRF_SECRET。三个密钥应各自随机生成且至少 32 字节；配置校验强制 AT/RT 密钥不同，但未强制 CSRF 与两者不同，部署仍应分别设置。模板只是占位配置。

显式迁移并启动 API：

```powershell
go run ./cmd/migrate status --dir migrations
go run ./cmd/migrate up --dir migrations
go run ./cmd/api
```

另一终端启动前端：

```powershell
cd frontend
npm ci
npm run dev
```

前端通过 Vite 将 /api 代理至本机 API，默认无需改 API_BASE_URL。配置 FRONTEND_ORIGINS 为实际浏览器来源（例如 http://localhost:5173），127.0.0.1 与 localhost 是不同来源。

先检查 `/health/live`、`/health/ready`，再访问前端。API 运行不自动迁移，不自动创建管理员或演示数据。

## 3. 首个管理员

公开注册默认关闭，但 CLI 创建候选人不受此开关影响。先设置 MAIL_ENABLED=true 并配置可用 SMTP。

在 backend 工作目录：

```powershell
$env:ADMIN_PASSWORD = '<替换为符合规则的实际密码>'
go run ./cmd/admin -action create -username administrator -nickname Administrator
Remove-Item Env:ADMIN_PASSWORD
```

使用该普通账号登录，在个人中心绑定并验证真实邮箱，随后运行：

```powershell
go run ./cmd/admin -action promote -username administrator
```

角色改变撤销旧令牌，重新登录进入后台。promote 会拒绝未验证邮箱；seed 不能代替此流程，当前返回未实现。

## 4. 启用本地采集

先确保目标商家 code 为已有采集器支持的 dmit 或 akko，录入正确购买 URL，再设置站点、商家、VPS 三级采集许可与两层 enabled。

在 backend 新终端：

```powershell
$env:WORKER_ENABLED = 'true'
$env:FLARE_RESOLVER_URL = 'http://localhost:8191/v1'
go run ./cmd/worker
```

本地无需 START_WORKER；Worker 会自行 MKSTREAM 创建消费组，不必按旧模板注释手工创建。新组从 `$` 开始，旧组延续已有游标。初期只运行一个 Worker，避免每个进程各自调度造成重复采集。

WORKER_ENABLED=false 只禁用循环，当前 main 仍打开连接、创建消费组并等待信号，不是无副作用的诊断模式。关闭后也不清历史库存。

## 5. 环境变量总表

下表“默认”来自 config.Load，生产 Compose 可能覆盖。空表示无默认值，不是可忽略。

### 应用与 HTTP

| 变量 | 默认 | 作用 |
| --- | --- | --- |
| APP_ENV | development | production 时强制 Secure Cookie |
| APP_MODE | runtime | runtime 或 skeleton；Worker 不提供 skeleton 分支 |
| HTTP_ADDR | :8080 | API 监听 |
| FRONTEND_ORIGINS | 空 | 逗号分隔来源白名单 |
| TRUSTED_PROXIES | 空 | Gin 可信代理列表，影响 ClientIP |
| RATE_LIMIT_ENABLED | true | 单进程 IP 限流 |
| FLARE_RESOLVER_URL | http://localhost:8191/v1 | Worker 解析服务地址 |
| LOG_LEVEL | info | API 日志级别 |
| LOG_FORMAT | json | API 日志格式 |

### PostgreSQL 与 Redis

| 变量 | 默认 | 作用 |
| --- | --- | --- |
| DATABASE_URL | 空，runtime 必需 | PostgreSQL DSN |
| DB_MAX_OPEN_CONNS | 20 | 连接池上限 |
| DB_MAX_IDLE_CONNS | 5 | 空闲连接数 |
| REDIS_ADDR | 127.0.0.1:6379 | Redis 地址 |
| REDIS_PASSWORD | 空 | Redis 密码 |
| REDIS_DB | 0 | DB 索引 |
| FROZEN_CACHE_TTL_SECONDS | 300 | 冻结缓存 TTL，不是解冻时间 |
| STOCK_STREAM | stock:observations | 采集任务 Stream |
| STOCK_CONSUMER_GROUP | vps-monitor | 消费组 |
| STOCK_CONSUMER_NAME | worker-1 | 实例消费者名；多实例应唯一 |

### JWT 与 CSRF

| 变量 | 默认 | 作用 |
| --- | --- | --- |
| JWT_ACCESS_SECRET | 空 | runtime 至少 32 字节 |
| JWT_REFRESH_SECRET | 空 | runtime 至少 32 字节且不同于 AT secret |
| JWT_ISSUER | vps-monitor | JWT issuer |
| JWT_ACCESS_AUDIENCE | vps-monitor-api | AT audience |
| JWT_REFRESH_AUDIENCE | vps-monitor-refresh | RT audience |
| JWT_ACCESS_TTL_MINUTES | 15 | AT 有效期 |
| JWT_REFRESH_TTL_HOURS | 168 | RT 初始寿命，refresh 不延长原截止 |
| CSRF_SECRET | 空 | runtime 至少 32 字节 |
| CSRF_TOKEN_TTL_MINUTES | 120 | CSRF token 寿命 |
| CSRF_COOKIE_SECURE | production 时 true，否则 false | 同时控制 RT/CSRF Secure |
| CSRF_COOKIE_NAME | 安全时 __Host-vps_csrf，否则 vps_csrf | __Host- 名称要求 Secure |

### 邮件与 Worker

| 变量 | 默认 | 作用 |
| --- | --- | --- |
| MAIL_ENABLED | false | 启用真实 SMTP |
| SMTP_HOST | 空 | SMTP 主机 |
| SMTP_PORT | 587 | 端口 |
| SMTP_USERNAME / SMTP_PASSWORD | 空 | SMTP 身份凭据 |
| SMTP_FROM | 空 | 发件人 |
| SMTP_TLS_MODE | starttls | starttls、tls 或 none |
| SMTP_TIMEOUT_SECONDS | 10 | 邮件超时 |
| WORKER_ENABLED | false | 调度、普通消费、Pending 清理开关 |
| WORKER_READ_COUNT | 10 | 每次 XREADGROUP 批量大小 |
| WORKER_BLOCK_SECONDS | 5 | 阻塞等待新消息时间 |

整数/布尔配置解析失败会回退默认，不一定启动报错；Validate 仅覆盖部分取值，例如尚未强制 Worker count/block 为正数。不要把成功启动当作所有配置正确的证据。

### 容器入口、CLI、前端

| 变量 | 默认/来源 | 作用 |
| --- | --- | --- |
| START_WORKER | false | shell 入口是否启动 /app/worker |
| MIGRATE_ON_START | false | shell 入口在启动 API 前执行迁移 |
| ADMIN_PASSWORD | 无默认 | admin create 命令读取 |
| VITE_API_BASE_URL | /api/v1 | 前端构建时 API 基础地址 |
| VITE_MOCK_API | 模板 false | 仅显式 enableMocking 工具读取；默认入口不用 |

## 6. 容器部署现状

`docker-compose.vps.yaml` 从镜像仓库拉取 postgres、redis、backend、frontend，不在 VPS 上构建源码，也没有宿主端口映射。它要求已有外部网络 `${NGINX_NETWORK:-nginx}` 和外部 HTTPS 反向代理。

前端 Nginx 提供静态文件，`/api/` 和 `/health/` 转发 `backend:8080`，其他路径 SPA fallback。公网代理可将域名指向网络中的 vps-monitor-frontend；TLS 终止和证书不由本 Compose 管理。

Compose 变量还包括 REGISTRY（docker.io）、IMAGE_NAMESPACE（必填）、IMAGE_TAG（latest）、APP_DOMAIN（必填）、POSTGRES_USER/DB（vps_monitor）、POSTGRES_PASSWORD（必填）、REDIS_PASSWORD、NGINX_NETWORK、TZ。实际部署建议固定可追溯镜像标签，根配置模板见 [.env.vps.example](../.env.vps.example)。

backend 镜像含 api、worker、migrate、admin、seed 和 migrations，以非 root app 用户运行。entrypoint 默认只启动 API；START_WORKER=true 才同时启动 Worker，WORKER_ENABLED=true 才执行循环。入口等待 API，不监控 Worker 的业务循环健康。

**现有 Compose 未定义解析服务，也未透传 FLARE_RESOLVER_URL、WORKER_READ_COUNT、WORKER_BLOCK_SECONDS。** 单在根 .env 填这些变量不会自动注入。容器中的 localhost 指容器自身，不能访问另一容器的解析服务。

若解析服务已在 app 网络可访问，可另建一个尚未包含于仓库的 override，示意如下：

```yaml
services:
  backend:
    environment:
      START_WORKER: "true"
      WORKER_ENABLED: "true"
      FLARE_RESOLVER_URL: "http://flaresolverr:8191/v1"
      WORKER_READ_COUNT: "10"
      WORKER_BLOCK_SECONDS: "5"
```

这里 flaresolverr 必须是实际部署并可解析的服务名；该片段本身不会创建解析服务。应用 override 后再进行隔离环境验证。

显式容器迁移应覆盖 entrypoint，避免误启动整个应用：

```powershell
docker compose -f docker-compose.vps.yaml run --rm --entrypoint /app/migrate backend status --dir /app/migrations
docker compose -f docker-compose.vps.yaml run --rm --entrypoint /app/migrate backend up --dir /app/migrations
```

backend healthcheck 只检查 live；frontend healthz 只检查静态服务。二者健康不代表数据库迁移、Worker 或采集成功，应额外检查 ready、日志及库存时间。

### 本地构建镜像

在项目根目录执行，两个 Dockerfile 的构建上下文不同：

```powershell
docker build -f backend/Dockerfile -t vps-monitor-backend:local .
docker build -f frontend/Dockerfile -t vps-monitor-frontend:local frontend
```

现成 VPS Compose 使用 pull_policy:always 和仓库镜像名，本地标签不会自动替换该部署配置。

## 7. 迁移和升级

先备份数据库并验证恢复，再显式检查 status/up。当前 001 面向新库且包含 delivery_id；旧库应新增转换迁移，并为已有库存设计可靠回填。迁移校验和不匹配时先调查历史文件变化，不直接删除 schema_migrations 记录。

down 会回滚最新版本；当前只有初始建表版本，回滚会删除业务表，不能当作无损版本切换。数据库新增迁移版本后还需同步 readiness 的版本判断。

## 8. 排障路径

| 症状 | 优先核对 |
| --- | --- |
| live 200、ready 503 | DATABASE_URL、schema_migrations 是否恰为版本 1、Redis 连接 |
| 登录 403/100004 | Origin 白名单、CSRF Cookie/header、HTTPS Secure Cookie |
| 登录成功后页面刷新未恢复 | RT Cookie、AuthContext 默认地址与 VITE_API_BASE_URL 是否分歧 |
| 后台 403/200011 | 当前用户是否真实验证邮箱 |
| 找回 202 但没收到邮件 | 中性响应不承诺发送；MAIL/SMTP、日志 reset_id、冷却、邮箱绑定验证 |
| 无任务 | Worker 进程/循环、WORKER_ENABLED、三级开关、enabled、软删除、调度退出日志 |
| 有任务无库存 | merchant_code 是否支持、解析地址、HTML 选择器、SQL delivery_id 字段 |
| 库存持续未知 | 当前采集器只识别无货；nil Quantity 正常写未知 |
| Pending 下降但库存未更新 | 当前恢复逻辑直接 ACK，不是重试成功 |
| 关闭开关后仍更新一次 | 已入队任务不重新检查开关 |
| Worker 进程在但不工作 | scheduler/consumer 出错退出，main 仍在等待信号 |

在已鉴权的 Redis 终端可只读检查 `XINFO GROUPS stock:observations`、`XPENDING stock:observations vps-monitor`、`XINFO CONSUMERS stock:observations vps-monitor`。不要用 XREADGROUP 做只读诊断，它会改变消费状态；XLEN 也不等于未消费数。

## 9. 验证范围

推荐基本构建为后端 `go build ./...`、前端 `npm test` 与 `npm run build`。当前后端完整测试存在编译阻断和人工 Redis 测试，先看 [known-issues.md](known-issues.md)。

路由集成测试需要专用 TEST_DATABASE_URL、TEST_REDIS_ADDR，测试文件创建独立 PostgreSQL schema 并使用 Redis DB 14；先修测试编译问题，再用 `backend/compose.test.yml` 的隔离依赖运行。不要配置生产连接。本次未执行这些有外部状态的验证。
