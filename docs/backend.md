# VPS Monitor 后端技术文档

按 2026-09-28 仓库源码重建，涵盖开发、业务、采集、部署与数据库迁移。前端见 [前端技术文档](frontend.md)。本文描述仓库实现，本次未连接已部署实例核对数据库状态。

## 1. 架构与数据归属

Go 1.25、Gin、GORM、PostgreSQL、go-redis/v9。生产编排使用 PostgreSQL 17、Redis 8。系统管理商家套餐、库存观测、收藏和补货通知，不采集 VPS 主机 CPU/内存指标。

| 位置 | 职责 |
| --- | --- |
| `cmd/api` | HTTP 服务 |
| `cmd/worker` | 采集/通知调度、消费和 Pending 处理 |
| `cmd/migrate` | 显式数据库版本迁移 |
| `cmd/admin` | 首个用户创建和管理员提升 |
| `config`、`initialize` | 环境变量、日志、数据库/Redis 与依赖装配 |
| `router`、`api`、`middle` | 路由、参数绑定、统一响应、认证/权限/CSRF/限流 |
| `service` | 业务规则、数据库事务、收藏与通知设置 |
| `model` | 数据实体、请求、响应、内部消息、错误码 |
| `iface`、`utils` | 可替换能力契约与 JWT/邮件/采集/Redis 等实现 |
| `task` | 调度器及消费者 |
| `migrations` | 不可改写的已发布 SQL 历史 |
| `test`、各包 `*_test.go` | 无依赖与外部服务集成测试 |

主要调用关系为 router → api → service；initialize 装配 utils 实现。API 与 Worker 是不同进程，生产 Compose 由同一个 `backend` 容器的入口脚本启动。空实现 seed 命令已移除。

PostgreSQL 保存 users、fronze（当前实际拼写）、merchant、vps_detail、vps_stocks、site_settings、user_mail_verifications、password_reset_requests、notices 和 schema_migrations。Redis 保存 `user:favors:<uid>` 收藏集合、冻结缓存及采集/通知 Stream。生产 Compose 通过根目录 `redis.conf` 同时启用周期性 RDB 快照、每秒同步的 AOF，并让 AOF 重写使用 RDB 基础文件；两类文件都保存在 `redis_data` 卷的 `/data` 下。**Redis 不全是可丢弃缓存，备份 PostgreSQL 不会备份用户收藏。**

## 2. 本地运行与配置

在 `backend/` 下复制 `.env.example` 为 `.env`，填写实际数据库、Redis 和密钥。配置从当前工作目录可选读取 `.env`；不要把真实配置提交到 Git。

```bash
cd backend
go run ./cmd/migrate status --dir migrations
go run ./cmd/migrate up --dir migrations
go run ./cmd/api
```

另开终端，设置 `WORKER_ENABLED=true` 后运行 `go run ./cmd/worker`。本地 API 不自动迁移，也不自动启动 Worker。正常使用 `APP_MODE=runtime`；skeleton 仅保留给无数据库的路由/失败关闭测试，不能替代生产配置，Worker 也没有同等无依赖启动模式。

| 配置 | 当前默认或说明 |
| --- | --- |
| `HTTP_ADDR` | `:8080` |
| `DATABASE_URL` | 必填 PostgreSQL DSN；连接池默认 20/5 |
| `REDIS_ADDR`、`REDIS_PASSWORD`、`REDIS_DB` | 默认 `127.0.0.1:6379`、空密码、DB 0 |
| `JWT_ACCESS_SECRET`、`JWT_REFRESH_SECRET`、`CSRF_SECRET` | runtime 要求至少 32 字节；使用三个不同的随机值 |
| `JWT_ACCESS_TTL_MINUTES`、`JWT_REFRESH_TTL_HOURS` | 15 分钟、168 小时 |
| `CSRF_TOKEN_TTL_MINUTES` | 120 分钟 |
| `CSRF_COOKIE_SECURE` | production 默认 true 且必须为 true；对应默认名 `__Host-vps_csrf` |
| `FRONTEND_ORIGINS`、`TRUSTED_PROXIES` | 逗号分隔，按实际域名与代理配置 |
| `RATE_LIMIT_ENABLED` | true |
| `MAIL_ENABLED` | false；启用后配置 SMTP 主机、端口、凭据、发件人、TLS 模式 |
| `SMTP_TLS_MODE`、`SMTP_TIMEOUT_SECONDS` | starttls、10 秒；TLS 模式支持 starttls/tls/none |
| `WORKER_ENABLED` | false；控制调度与消费循环 |
| `FLARE_RESOLVER_URL` | `http://localhost:8191/v1`，容器内 localhost 指容器自身 |
| `STOCK_STREAM`、`NOTICE_STREAM` | `stock:observations`、`notice:targets` |
| `STOCK_CONSUMER_GROUP`、`NOTICE_CONSUMER_GROUP` | `vps-monitor` |
| `STOCK_CONSUMER_NAME`、`NOTICE_CONSUMER_NAME` | `worker-1`；并行实例应使用不同名称 |
| `WORKER_READ_COUNT`、`WORKER_BLOCK_SECONDS` | 10 条、5 秒 |
| `NOTICE_DURATION`、`NOTICE_RESET_HOURS` | 发送间隔 10 分钟、计数重置间隔 168 小时 |
| `START_WORKER`、`MIGRATE_ON_START` | Docker 入口使用，默认 false |

完整变量以 `config/config.go` 与 `backend/.env.example` 为准。根目录 Compose 只传入容器部署必需或需要覆盖默认值的变量；库存和通知 Stream 等参数沿用后端代码默认值。`START_WORKER=true` 让入口脚本启动 Worker 进程，`WORKER_ENABLED=true` 让它运行采集和通知循环。FlareSolverr 仅在内部网络可访问；开发用的 `backend/.env` 不会自动进入生产容器。

首次管理员创建：在当前终端通过 `ADMIN_PASSWORD` 提供 8–72 UTF-8 字节密码，执行 `go run ./cmd/admin -action create -username administrator -nickname Administrator`。登录该候选账号完成真实邮箱验证后，再执行 `go run ./cmd/admin -action promote -username administrator`，重新登录取得新角色。公开注册默认关闭，无默认管理员或演示账号。

## 3. API 与业务规则

HTTP 前缀 `/api/v1`。响应为 `{ code, message, data, request_id }`，业务成功码 0；分页 data 为 `{ items, total, page, page_size }`，默认每页 20、最大 100。ID 与金额以字符串传输。

| 路由组 | 能力 |
| --- | --- |
| `/auth` | CSRF、注册、登录、刷新、退出、找回密码 |
| `/me` | 个人资料/密码/邮箱、收藏、微信通知设置 |
| `/merchant`、`/vps`、`/stock`、`/settings` | 公开可见目录、库存、站点设置 |
| `/admin/user`、`/admin/froze` | 用户管理、角色、重置密码、冻结 |
| `/admin/merchant`、`/admin/vps` | 管理端目录读写 |
| `/admin/settings`、`/admin/dashboard` | 设置与看板 |

请求字段以 router、model/request 为准，响应以 model/response 为准；service 是业务规则来源。变更接口时同步请求/响应类型、前端 types/api 和这两份技术文档，不再单独维护 OpenAPI 文件。

认证使用 Access/Refresh JWT、Cookie 与认证写请求 CSRF；鉴权结合数据库当前角色、邮箱、冻结状态和 token_version。改密及管理员重置密码可撤销旧令牌。邮箱与找回密码挑战采用随机码、哈希、过期、冷却、错误次数上限和一次性消费；邮件通过 API 同步调用 SMTP，不走通知 Stream。

公开列表排除停用或软删除的商家、VPS。创建套餐不会创建虚假库存。商家删除有引用约束。金额排序按原始金额，不折算汇率和周期。

收藏的增删参数为 query `vpsId`：`POST /me/addFavor`、`DELETE /me/delFavor`；`GET /me/listFavors` 复用公开 VPS 筛选与分页。添加前检查可见性，取消只验证 ID；重复操作可成功。列表过滤不可见产品，但 Redis 中旧关系可能保留；total 是筛选后的可见数量。

微信通知为全部收藏的总开关。`GET /me/notice` 返回 key_bound/notice_enabled；`PUT /me/notice/server-key` 保存 send_key；`POST /me/addNotice`、`DELETE /me/delNotice` 无 VPS 参数。Key 保存不自动开启通知，也不验证第三方送达。未绑定开启返回业务码 500005；关闭保留 Key、收藏与历史次数。Key 去除首尾空白后最长 64 字符，不接受占位符、内部空白或控制字符，完整 Key 不返回前端。

## 4. 库存采集与通知

Worker 启动会连接 PostgreSQL/Redis 并确保两个消费组存在；`WORKER_ENABLED=false` 不代表整个入口完全不接触依赖。当前进程启动后立即调度，采集每 5 分钟、通知每 2 分钟扫描一次。多个 Worker 也会各自启动调度器，扩容前需考虑重复调度。

采集目标受全局、商家、VPS 三层许可及业务可见性限制，通过 Redis Stream 传递购买地址等任务。消费者按 MerchantCode 匹配 DMIT/Akko，调用 FlareSolverr 兼容服务解析购买页面；两种采集器都已有有货/无货特征识别，未识别页面返回解析错误，不保证能适应第三方页面变化。

| 库存状态 | 观测语义 |
| --- | --- |
| 1 | 有货，数量已知 |
| 2 | 无货，数量 0 |
| 3 | 未知 |
| 4 | 有货，数量未知 |

写入更新 vps_stocks 当前快照，使用事务、行锁和 Stream delivery_id 比较拒绝不新的观测；不存在库存历史表。最近确认有货时间在未知/无货更新时保留。超过 15 分钟未更新或无记录时对外标记 is_stale。

采集正常入库后 ACK；页面结构错误可直接 ACK，其他失败可能留 Pending。库存 Pending 恢复每分钟认领空闲消息后直接 ACK，不重新采集，依赖后续调度。Stream ACK 不等于删除数据，需监控 Stream 增长及业务更新时间。

通知调度扫描开启通知用户及其有货收藏，消费者发送前重新读取用户开关与 Key，按用户/VPS 记录次数。在行锁内判断间隔并发送，默认最多累计 3 次；距最后一次成功发送达到 `NOTICE_RESET_HOURS` 后，下次成功发送重新计数。间隔不足、次数超限或禁用等失败消息可能保留 Pending，恢复逻辑重试并在投递次数超过 3 后 ACK。

通知外部发送与数据库提交无法构成同一原子事务，因此不承诺绝不重复送达。关闭后已通过开关检查的发送可能完成。API 健康不能证明 Worker 正常：当前某个后台循环退出只记录日志，主进程可能继续存活；需检查任务日志、库存时间和通知记录。

## 5. 数据库基线与后续数据保留

本次 dev 重构版本采用**全新部署**，不转换旧 main 的数据库。旧 001_initial、002_notifications、003_stock_status 已删除，当前只保留一对新文件：

| 文件 | 用途 |
| --- | --- |
| `001_baseline.up.sql` | 空库一次建立全部九张业务表、索引、约束与默认站点设置 |
| `001_baseline.down.sql` | 按依赖顺序删除业务表，仅用于可丢弃的测试库，会丢失全部业务数据 |

基线已包含 users 通知开关/Key、notices 发送记录、VPS has_stock、库存状态 1/2/3/4。迁移记录表 schema_migrations 由执行器管理。当前 `RequiredMigrationVersion=1`，首次部署后数据库应只有版本 1 的已应用记录。

这次允许重建基线，是因为新部署明确从空库开始。**首次发布后，001_baseline 即成为不可修改的历史，以后的功能只能追加 002、003…，不再重建基线或重置数据库。** 新基线不能用于旧 main 数据库，也不能用于执行过旧 SQL 的 dev 测试库；需要为新部署准备空数据库和独立 Redis 数据存储。

### 迁移器提供的保护

`service/migration.go` / `cmd/migrate` 支持：

- `<version>_<name>.up.sql` 与 `.down.sql` 成对，按正整数版本升序执行。项目使用连续编号，新增时同步 RequiredMigrationVersion。
- schema_migrations 记录名称、版本、SHA-256 和应用时间；重复 up 跳过已应用版本，不重新建表或重复回填。
- up 与 down 原始字节共同参与校验；已应用文件被修改、删除、改名，或历史跳过前置文件时拒绝迁移。不能手工改校验和绕过检查。
- 一次 up 中所有待执行文件和版本记录在一个事务里提交，并持有 PostgreSQL advisory lock；任何语句失败时，本批结构、数据和版本记录一起回滚。
- down 只回滚最新版本，不自动执行。它是否丢数据取决于 SQL，生产默认只执行 up，绝不把基线 down 当成升级步骤。
- status 也使用锁和事务，元数据表不存在时会创建它；没有 force/baseline/指定目标版本功能。

`.gitattributes` 固定迁移 SQL 使用 LF，保证 Windows、Linux 和镜像里的文件校验和一致。已发布文件不能再调整注释、空格、编码或换行。

事务和校验和能防止部分执行、重复执行和历史漂移，**不能自动把任意 DROP/UPDATE 变成无损操作**。数据保留必须由每次新增迁移的 SQL、兼容代码和有真实旧数据的升级测试共同保证。

### 后续每次改表的要求

1. 从最新 main 创建工作分支，新增 `002_<change>.up.sql/down.sql`（以后继续递增）。一次文件表达一个清晰变更；已在共享环境应用的文件不再改写。
2. up 保留已有业务行、ID、关联关系和字段含义。新字段先可空或提供合理默认值，再回填、验证，最后加约束。增加唯一约束前先查重复，收紧类型前先检查数据范围，不依赖静默截断或覆盖。
3. 改名、替换类型或改变存储方式，按“新增字段 → 兼容读写 → 可恢复回填 → 验证数量/内容/关联 → 切换读取 → 后续单独发布清理旧字段”推进。没有保留方案时不删除仍有价值的数据。
4. 大批量回填放到有进度、可重试的独立任务；写入过程中应保留原数据，核对完毕后再切换。不能为了缩短迁移文件，改成 drop/recreate 表或清空数据再导入。
5. 同步 entity、service、接口、前端类型及 RequiredMigrationVersion。生产不运行 GORM AutoMigrate；显式 SQL 是结构历史的唯一维护入口。
6. 在专用数据库验证两条路径：空库完整安装，以及上一个已部署版本有数据时增量升级。对变更涉及的列逐项检查保留/转换结果，同时验证行数、ID、外键、默认值、约束和业务读写；再重复 up 确认不重复操作。
7. 发布前备份并验证可恢复，迁移成功后再发布匹配代码。生产修复优先新增前向迁移；down 仅在明确可保留数据并已演练时使用，不等同于恢复备份。

多条 SQL 用单独一行 `-- migrate:split` 分隔，不手工写 BEGIN/COMMIT。例如未来新增可空字段的 up 可写为（仅示例，本次未新增此字段）：

```sql
SET LOCAL lock_timeout = '5s';
-- migrate:split
SET LOCAL statement_timeout = '60s';
-- migrate:split
ALTER TABLE vps_detail ADD COLUMN region_code varchar(32);
```

超时值按数据量调整，上述设置在进入文件执行后才生效，不限制此前等待迁移 advisory lock 的时间。字段一旦有数据，删除它的 down 就是有损操作；必须在发布说明中明确，不能当作自动恢复路径。

**分阶段变更需要不同发布或独立回填步骤。** 当前 up 会一次执行所有 pending 文件，把“新增”和“删除旧字段”放在同一镜像的两个文件里并没有兼容窗口。

小数据量优先短维护窗口内迁移。大表 CHECK/外键可评估 NOT VALID 后单独 VALIDATE；普通 ALTER TABLE 仍可能等待强锁。[PostgreSQL ALTER TABLE](https://www.postgresql.org/docs/17/sql-altertable.html)

当前执行器始终使用事务，不能执行 CREATE INDEX CONCURRENTLY；未来有大表在线建索引需求时，先设计非事务执行、失败恢复及版本登记，或评估成熟迁移工具，不直接把该语句塞入普通文件。[PostgreSQL CREATE INDEX](https://www.postgresql.org/docs/17/sql-createindex.html)

### 首次部署后的版本约束

API ready 要求迁移记录数量、首版本、末版本与 RequiredMigrationVersion 完全匹配。新建库迁移至 1 后使用本次应用；未来追加 002 后同步发布要求版本 2 的代码。因此当前采用短维护窗口，不承诺新旧代码滚动共存；也不能假定数据库已升级后只回滚镜像就能恢复。

出现校验和不一致时，恢复原已发布文件，再通过新增迁移修正。新基线与旧 main 数据库没有兼容关系，不补写版本记录或使用 IF NOT EXISTS 假装完成迁移。

## 6. 部署与升级流程

根目录 `.env.vps.example` 对应 `docker-compose.vps.yaml`，镜像发布工作流在 `.github/workflows/publish-images.yml`。发布到 GHCR 的 main latest、版本 tag、sha 标签中，部署优先选择固定 tag/sha，并保存旧镜像标识。手动从 dev 构建只发布 `sha-*`，不会更新 `latest`。Compose 依赖外部 `nginx_gateway` 网络，实际名称由 NGINX_NETWORK 指定，入口 TLS/域名反代由外部网关提供。该网关应指向 `vps-monitor-frontend:80`；前端容器代理 `/api/` 和 `/health/` 到内部的 `backend:8080`。数据库、Redis、后端、FlareSolverr 都不直接接入外部网关网络。

### 本次全新部署

准备全新的 PostgreSQL 数据库与独立 Redis 持久化存储，将 `docker-compose.vps.yaml`、`redis.conf` 放在 VPS 同一目录，从 `.env.vps.example` 复制该目录的 `.env`，配置已发布的镜像 tag、域名、网关网络、数据库/Redis 凭据和三组密钥。PostgreSQL 密码会嵌入 URL，请使用 URL 安全字符。不要把新应用直接连到旧 main 的业务库或旧 Redis 收藏/队列。

Compose 项目名固定为 `vps-monitor`，数据卷属于该项目。修改 `.env` 中 `POSTGRES_DB` 不会自动清空或重新初始化已有 PostgreSQL 数据卷。先确认使用的卷确实属于这次新部署。外部 `NGINX_NETWORK` 网络需要预先创建，并让网关容器接入。

首次安装按以下顺序执行（VPS Bash）：

```bash
docker compose -f docker-compose.vps.yaml pull
docker compose -f docker-compose.vps.yaml up -d --wait postgres redis
docker compose -f docker-compose.vps.yaml run --rm --no-deps --entrypoint /app/migrate backend up --dir /app/migrations
docker compose -f docker-compose.vps.yaml run --rm --no-deps --entrypoint /app/migrate backend status --dir /app/migrations
docker compose -f docker-compose.vps.yaml up -d backend frontend
docker compose -f docker-compose.vps.yaml exec -T backend wget -q -O - http://127.0.0.1:8080/health/ready
docker compose -f docker-compose.vps.yaml logs --tail=50 backend
```

确认版本 1 已应用、ready 成功且后端日志没有 Worker 启动错误，再创建首个管理员。镜像部署时运行镜像内的管理命令；`ADMIN_PASSWORD` 只经环境变量传给一次性容器，不写进 `.env` 或命令参数：

```bash
read -rsp 'Admin password: ' ADMIN_PASSWORD; echo
export ADMIN_PASSWORD
docker compose -f docker-compose.vps.yaml run --rm --no-deps -e ADMIN_PASSWORD --entrypoint /app/admin backend -action create -username administrator -nickname Administrator
unset ADMIN_PASSWORD
# 候选账号登录并完成真实邮箱验证后：
docker compose -f docker-compose.vps.yaml run --rm --no-deps --entrypoint /app/admin backend -action promote -username administrator
```

初始站点注册和采集许可均关闭，按需要在后台开启。迁移保持为单独命令，不在 API 启动时自动执行。FlareSolverr 镜像和 Worker 需要额外内存；采集目标也依赖第三方页面可访问。

### 以后有数据时升级

**当前推荐短维护窗口升级。** 先在生产副本演练并准备好新旧镜像，然后停止业务写入，备份，再用新镜像单独运行迁移，成功后启动新应用。Compose 固定关闭 API 启动时自动迁移，迁移作为独立发布步骤。

以下为 VPS 上 Bash 命令示例，逐步执行，任一步失败停止后续操作；本次没有执行这些线上命令。先在根 `.env` 选择已经构建好的固定 IMAGE_TAG：

```bash
docker compose -f docker-compose.vps.yaml pull backend frontend
docker compose -f docker-compose.vps.yaml run --rm --no-deps --entrypoint /app/migrate backend status --dir /app/migrations
# 开启网关维护页，暂停其他写入者，再停止前端与后端（包括 Worker）。
docker compose -f docker-compose.vps.yaml stop frontend backend
```

在仍运行的 PostgreSQL 容器内生成自定义格式备份，再复制到宿主机，避免通过不同 shell 的重定向处理二进制：

```bash
backup_name="vps-monitor-$(date +%Y%m%d-%H%M%S).dump"
mkdir -p backups
docker compose -f docker-compose.vps.yaml exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "$1"' sh "/tmp/$backup_name"
docker compose -f docker-compose.vps.yaml cp "postgres:/tmp/$backup_name" "backups/$backup_name"
```

备份包含用户及通知 Key 等敏感数据，复制到受控的持久存储。发布前应在隔离数据库实际 pg_restore 并验证业务数据；只列目录或看到 dump 文件不能证明可恢复。自定义格式可通过 pg_restore 还原。[PostgreSQL pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html)、[pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html)

完整灾备还需要 Redis 的持久化备份（收藏、队列）及配置/密钥。数据库备份与 Redis 恢复要考虑一致时间点；不要为了迁移清空 Redis 或删除 Docker 数据卷。

```bash
docker compose -f docker-compose.vps.yaml run --rm --no-deps --entrypoint /app/migrate backend up --dir /app/migrations
docker compose -f docker-compose.vps.yaml run --rm --no-deps --entrypoint /app/migrate backend status --dir /app/migrations
docker compose -f docker-compose.vps.yaml up -d backend frontend
docker compose -f docker-compose.vps.yaml exec -T backend wget -q -O - http://127.0.0.1:8080/health/ready
docker compose -f docker-compose.vps.yaml logs --tail=50 backend
```

`--entrypoint /app/migrate` 很重要：否则镜像默认脚本会启动 API/Worker。迁移成功与 status 一致后才启动应用，验证登录、目录、收藏及 Worker 日志，最后撤下维护页。备份目录应在 Git 之外管理。

`/health/live` 只表示 HTTP 进程存活；`/health/ready` 检查迁移版本和 Redis 可用性，SQL 查询本身也验证数据库连接。Compose 使用 ready 作为后端 healthcheck，前端会等待 API 就绪；该检查不代表 Worker 正常运行，还需检查后端日志和实际采集/通知结果。

迁移命令失败时本次事务回滚，排除原因后再执行。迁移成功但新应用失败时优先修复前进；不要自动 down。旧应用的 ready 会因数据库版本比代码新而失败，因此当前不能承诺“回滚镜像即可恢复”。需事先在副本验证旧代码/新结构兼容、选择已经验证不会丢失所需数据的 down，或安排从备份恢复；恢复备份会丢失备份之后写入的数据。

未来要求不停机发布时，再引入明确的最小/最大兼容 schema 版本、分阶段改表和独立迁移作业，并演练新旧 API/Worker 共存与回滚；本次没有改变迁移器或健康检查语义。

## 7. 测试与维护

在 backend 下：

```bash
go test ./... -timeout 90s
go build ./...
```

未设置 TEST_DATABASE_URL/TEST_REDIS_ADDR 时，外部 PostgreSQL/Redis 集成用例跳过。无断言的本地 FlareSolverr 调试文件和固定密码、无限循环的 Redis 手工调试测试已清理；其余路由、CSRF、认证、迁移文件校验、采集解析和通知业务测试保留。

独立测试环境示例（Bash）：

```bash
docker compose -f compose.test.yml up -d --wait
TEST_DATABASE_URL='postgres://vps_test:vps_test@127.0.0.1:55432/vps_monitor_test?sslmode=disable' \
TEST_REDIS_ADDR='127.0.0.1:56379' go test ./service ./test -timeout 120s -v
docker compose -f compose.test.yml down
```

测试会建立独立 PostgreSQL schema；runtime 测试使用 Redis DB 14。仅使用专用测试实例，禁止传入生产连接。service/migration_integration_test.go 使用独立 schema 检查空库安装、九张业务表已有数据的增量升级、重复执行、历史篡改拒绝及失败事务回滚。每次真实业务改表仍需补充对应的数据转换断言，并在上一部署版本的副本演练。

本次验证：在独立 PostgreSQL 17 容器中完成新基线安装、九张业务表数据保留的示例增量迁移、重复执行、历史校验和拒绝、跨文件失败回滚及示例字段回退测试；后端 go test ./... 和 go build ./... 通过。通知 PostgreSQL 集成测试已启用，需要 Redis 的 runtime 集成测试因未配置 TEST_REDIS_ADDR 跳过。上述测试验证迁移机制与本次基线，未来每个实际改表仍必须增加对应的数据保留断言。旧 main 数据库未连接、未升级、未清理。
