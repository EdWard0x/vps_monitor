# VPS Monitor 后端技术文档

本文以 2026-09-19 工作区实现为准。接口见 [api.md](api.md)，Worker 见 [collection.md](collection.md)，运行参数见 [deployment.md](deployment.md)。

## 1. 进程与装配

| 入口 | 职责 | 关键说明 |
| --- | --- | --- |
| `cmd/api` | HTTP 服务 | `config.Load → initialize.New → App.Run`，处理退出信号 |
| `cmd/worker` | 调度、消费、Pending 清理 | 独立打开数据库和 Redis，注册 dmit、akko 采集器 |
| `cmd/migrate` | up/down/status 迁移 | 显式执行，普通 API 启动不调用 |
| `cmd/admin` | 创建候选人、提升角色 | 普通账号真实验证邮箱后再提升 |
| `cmd/seed` | 保留入口 | RunSeed 返回 NotImplemented，不生成演示数据 |

`config.Load()` 从当前工作目录可选加载 `.env`，映射环境变量并校验。正常使用 `APP_MODE=runtime`，API 在此模式连接 PostgreSQL 与 Redis，连接失败阻止启动。skeleton 模式不建立这些连接，数据库业务主要返回 501；CSRF 等不依赖数据库的能力仍可工作。Worker 没有对应的无依赖分支，不能以 skeleton 演练采集。

`initialize.BuildServices` 显式注入数据库、冻结缓存、JWT、密码、CSRF、SMTP。API 关闭时释放连接，HTTP 优雅退出窗口 10 秒。Worker 在自己的 main 中装配依赖，没有完整复用 API 生命周期管理。

## 2. 分层及源码导航

```text
router/          路由分组、中间件绑定
api/             JSON/query 绑定、当前用户、Cookie、统一响应
middle/          request_id、日志、恢复、CORS、限流、认证、管理员、CSRF
service/         业务校验、事务、SQL 查询、输出组装
model/request/   HTTP 输入
model/response/  HTTP 输出和包络
model/entity/    GORM 实体和表映射
model/dto/       内部 CollectionTask
model/errcode/   业务错误映射
iface/           auth、froze、mail、collect、message、enqueue 能力契约
utils/           JWT、bcrypt、SMTP、Redis、采集器等具体实现
task/            调度和消息处理
initialize/      API 依赖与连接装配
flag/            CLI 业务
migrations/      SQL 迁移
```

当前没有 repository 层，service 直接通过 GORM 读写数据库。目录业务由 `catalog_helpers.go` 统一校验、错误映射和响应转换；账户辅助方法主要在 `user.go`、`mail_helpers.go`。扩展时沿用这套结构。

## 3. HTTP 请求生命周期

全局顺序：RequestID → Logging → Recovery → CORS → 可选 RateLimit。路径再叠加认证、管理员或 CSRF 校验。

- `/api/v1/auth` 写请求要求 CSRF Cookie 与 `X-CSRF-Token`。
- `/api/v1/me` 要求有效 Bearer AT。
- `/api/v1/admin` 要求 AT、数据库当前角色为 admin、邮箱已验证。
- 商家、套餐、库存、公开设置查询不要求登录。
- 绑定失败统一返回 100001；当前未开启 JSON 未知字段拒绝，也未输出细粒度字段错误数组。
- 普通成功 HTTP 200；找回验证码申请 HTTP 202；删除返回 `data:null`，不是 204。
- `errcode.Resolve` 保留已知业务错误，未知错误映射 503/900004。

健康端点不使用业务包络：live 返回 `{"status":"live"}`；ready 要求能读取迁移表、历史恰为一个版本 1、Redis Ping 成功，否则 503。ready 不校验完整表结构，也不检查 Worker、SMTP 或解析服务。

### 中间件边界

CORS 允许配置来源或直接同源，支持 credentials，OPTIONS 提前 204。反向代理后应配置公网 HTTPS Origin：当前同源比较依据请求 TLS/Host，不直接依赖转发协议头。请求体上限 1 MiB，HTTP ReadHeaderTimeout 为 5 秒。

限流为单进程、来源 IP、固定一分钟窗口：`/auth/` 与 `/me/mail/` 共用 30 次额度，其他 API 共用 300 次额度；超限 `Retry-After:60`。多实例没有共享计数。

业务响应带 request_id，头部暴露 X-Request-ID。API 使用 slog，Worker 多处仍使用标准 log，没有贯穿调度、消息和请求的统一追踪。

## 4. 认证与账户

### 4.1 注册、登录、刷新

用户名去空白转小写，匹配 `^[a-z0-9][a-z0-9_]{2,63}$`；昵称 1–64 个有效 UTF-8 字符。密码为 **8–72 个 UTF-8 字节**，bcrypt cost 12，不应误写为字符数。公开注册仅创建 user，初始注册关闭。

登录返回 AccountUser 和 AT，RT 写入 `vps_refresh` HttpOnly Cookie。JWT 分开配置 AT/RT secret 与 audience，默认 AT 15 分钟、RT 168 小时；工具实现见 `utils/jwt/jwt.go`。

认证每次检查令牌、冻结、用户存在性、token_version，从 SQL 读取当前角色和邮箱状态。Refresh 验证 RT 后重新签发，但保留原 RT 截止时间。没有设备会话表或 RT 单次使用/重放追踪表。

登出只清当前浏览器 RT Cookie，不撤销已复制令牌，不是全设备退出。

### 4.2 CSRF 和 Cookie

GET `/auth/csrf` 复用仍有效的签名值，否则创建新值；JSON 返回 `data.token` 并写 Cookie。CSRF Cookie 也为 HttpOnly，前端从 JSON 取值。

两类 Cookie 均为 Path=/、无 Domain、SameSite=Lax；Secure 由 `CSRF_COOKIE_SECURE` 同时控制。生产强制 Secure；安全 CSRF Cookie 默认名 `__Host-vps_csrf`，开发默认 `vps_csrf`。真正跨站部署不能只通过 CORS 白名单解决 Cookie 限制，现成方案适合同源反向代理。

### 4.3 改密、角色与管理员保护

- 本人改密校验当前密码；管理员重置不需要目标旧密码。
- 改密更新哈希、递增 token_version、消费旧安全验证码；不解除冻结。
- 角色仅 user/admin，提升前必须验证邮箱；角色实际变化递增 token_version。
- 降权和冻结先锁定站点设置行串行化管理员变更，再锁用户行并保护最后一个可用管理员；冲突为 409。
- `/me` 使用认证上下文用户 ID，不接受客户端选择操作者。
- AdminUser 仅额外公开 frozen，不返回密码哈希或邮箱。

### 4.4 冻结

实际 SQL 表名是 **fronze**。活动记录表示冻结，解冻软删除记录，重新冻结恢复或新建。

首次冻结改变状态时递增 token_version，重复冻结不重复递增。Redis key 为 `auth:frozen:{user_id}`，默认 TTL 300 秒，是缓存寿命，不是自动解冻时间。缓存命中直接拒绝；未命中或 Redis 异常回查 SQL。

事务成功后同步缓存，失败返回 cache_synced=false，不回滚数据库。解冻删缓存失败可能暂时仍被缓存阻止登录，可重试同步。解冻不恢复旧令牌。

## 5. 邮箱与找回密码

`service/mail.go`、`password_reset.go` 管理挑战，`utils/mail` 管理地址规范化和 SMTP。邮件在 API 请求内同步发送，当前在相关数据库事务内调用，不走 Stream。

| 项目 | 规则 |
| --- | --- |
| 验证码 | 安全随机 6 位数字，bcrypt 哈希保存 |
| 有效期/冷却 | 10 分钟 / 60 秒 |
| 最大错误尝试 | 5 次 |
| 对外标识 | UUID verification_id/reset_id，不是验证码或自增 ID |
| 消费 | 一次性；改密等安全操作使旧挑战失效 |

首次绑定发送目标邮箱验证码；换绑已有邮箱需当前密码，完成验证前保留旧邮箱。绑定投递失败返回 503/200014。

找回申请对未知、未验证邮箱和冷却中的请求返回中性 202。统一邮件配置不可用返回 503；特定地址投递失败回滚事务、记录 reset_id，仍返回中性受理结果。202 不表示已投递。重置成功更新密码、撤销旧令牌，不解冻。

SMTP 支持 starttls/tls/none，默认超时 10 秒。同步发送仍存在邮件已发但事务后来提交失败的窗口，不具备邮件和 SQL 的原子一致性。

## 6. 目录、设置和库存

### 商家

code 去空白转小写，匹配 `^[a-z0-9][a-z0-9._-]{0,63}$`，全表唯一，更新不接受 code。名称最多 128 字符。URL 为 HTTP/HTTPS、主机非空、无用户信息、最多 4096 字节。

公开仅启用且未删除，后台可查停用项。删除前检查未删除关联 VPS，有关联返回 409，不级联删除。软删除不释放唯一 code。

### VPS

`(merchant_id,code)` 全表唯一，软删除不释放组合。更新允许改变商家与 code，是完整可编辑对象更新；map 更新保存 false、0、null。

| 字段 | 规则 |
| --- | --- |
| name / description | 1–128 字符 / 最多 10000 字符 |
| cpu_cores / memory_mb | 正 int32 |
| disk_gb / ipv4_count / ipv6_count | 非负 int32 |
| disk_type | 小写非空字符串，最多 32 字符；后端没有固定枚举 |
| transfer_gb / port_mbps | null 未知、0 不限量；非空为非负 int32 |
| has_ipv4 / has_ipv6 | 分别等于对应数量是否大于 0 |
| price_amount | 十进制字符串，整数 1–12 位、小数最多 8 位，不接受科学计数法 |
| currency | 归一化为三位大写字母 |
| billing_period | monthly / quarterly / yearly / one_time |
| purchase_url | HTTP/HTTPS；也作为当前采集源 URL |

价格使用 decimal 与 SQL numeric(20,8)，响应可能去除末尾零。价格排序按存储金额，不折算汇率或付款周期。

公开列表、详情、库存同时要求商家与 VPS 未删除且启用。列表筛选 q、merchant_id、currency、billing_period、status、sort；后台多 enabled。排序白名单，库存筛选不按 stale 改写 status。

目录创建/编辑不写库存。VPS 删除软删除套餐，不物理删除库存行。返回列表时批量读取商家/库存，组装公共或管理视图。

### 设置

site_settings 活动记录唯一，保存站点名、注册和全局采集开关。默认注册/采集关闭；无行时查询返回安全关闭默认值，不创建数据。

部分更新用指针区分省略与 false；无有效字段返回参数错误。管理响应为嵌套 settings 加顶层 collection_enabled、collector_implemented、updated_at。当前 **collector_implemented 固定 true**，不检测部署能力或进程健康。

### 库存和统计

vps_stocks 每 VPS 一行快照，没有历史表。对外仅 vps_id、status、quantity、last_checked_at、last_in_stock_at、is_stale。

无库存行返回 status=3、数量/时间 null、stale=true，不插入假记录。检查时间为空或超过 15 分钟为 stale，保留状态。last_in_stock_at 是最后一次确认有货时间，后续无货不清空。写入与 Stream ID 防旧覆盖见采集文档。

看板一次 SQL 统计未删除用户、冻结用户、商家、套餐、有货和未知套餐，包含停用项；套餐要求商家未删除。无库存行计未知；stale 不影响按 status 统计。

## 7. 数据模型和迁移

实体共用自增 ID、创建/更新时间、软删除时间；对外 ID 为十进制字符串，内部 Go uint/SQL bigint。

| 表 | 核心字段/关系 | 约束与用途 |
| --- | --- | --- |
| users | username、nickname、password_hash、role、mail、验证时间、token_version | username/mail 唯一，版本 > 0 |
| fronze | user_id → users | user_id 唯一，活动行表示冻结 |
| merchant | code、name、website_url、两类开关 | code 唯一 |
| vps_detail | merchant_id → merchant、规格、价格、购买链接、两类开关 | 商家内 code 唯一，规格/币种/周期约束 |
| vps_stocks | vps_id → vps_detail、状态、数量、检查/有货时间、delivery_id | vps_id 唯一；delivery_id 数字-数字格式 |
| site_settings | 站点名、注册、采集开关 | 活动行单例 |
| user_mail_verifications | user_id、public_id、目标邮箱、code_hash、过期/消费/错误次数 | public_id 唯一 |
| password_reset_requests | user_id、public_id、code_hash、过期/消费/错误次数 | public_id 唯一 |
| schema_migrations | 版本、名称、校验和、应用时间 | 迁移服务维护 |

业务外键为 RESTRICT；主要索引覆盖软删除、商家目录、库存状态、验证码用户/过期查询。完整约束见 [001_initial.up.sql](../backend/migrations/001_initial.up.sql)。

当前只有 001_initial，面向空库。迁移器在事务内使用 PostgreSQL advisory lock，检查连续版本、SHA-256 校验和。up 应用待执行迁移，down 回滚最近版本；语句按 `-- migrate:split` 分隔。

旧库缺少 delivery_id 等字段时，需要升级迁移和历史回填，不能重写或重跑已应用 001。新增版本还需调整当前写死版本 1 的 readiness 检查。

## 8. 开发与验证

新增 HTTP 能力依次维护 request/response、service、api、router、OpenAPI、前端类型与调用。API 不越过 service 操作密码工具、Redis 或数据库。采集扩展见 [collection.md](collection.md)。

本次 `go build ./...` 通过；测试包因旧 fake Ack 签名不匹配无法编译。Redis 工具测试还包含本地实例无限读取，因此 `go test ./...` 不是当前无外部依赖的安全默认检查。详见 [验证记录](known-issues.md)。
