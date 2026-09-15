# VPS Monitor 后端全量重构：外部骨架规格

> 面向执行后端重构的模型，可独立阅读。交付目标是外部骨架，具体业务由维护者自行实现。
> 本次任务只生成文档；执行本文时才修改代码。本文替代旧版合并文档中的后端设计。
>
> 2026-09-13 实施补充：维护者后续明确授权删除 `docs/sql` 的旧脚本并补全迁移功能。当前迁移以 `backend/migrations` 为唯一来源，支持 PostgreSQL `up/down/status`；本补充覆盖下文“骨架阶段不执行迁移、旧 migration 不改”的原始限制。

## 1. 最终范围

按维护者的目录习惯重新组织全部后端代码，不能只调整认证模块或把旧文件搬到新目录。所有业务模块都要有清楚的类型、方法、依赖和入口。

技术栈沿用 Go、Gin、GORM、PostgreSQL，新增 Redis。不增加通用仓储框架，不要求每个 service 都有对应接口。

最终确定：

- 接口目录名为 `iface`，按用途划分 `auth`、`froze`、`mail`、`message` 等子目录。
- 不做会话管理：删除会话表的运行依赖、设备列表、单设备退出、`sid`、`jti`、刷新轮换版本和相关接口。
- 认证使用用户表的 `token_version`，使冻结前签发的全部 AT、RT 永久失效。
- 冻结记录保存在 SQL `fronze` 表。名称沿用维护者提出的拼写，代码模块统一叫 `froze`，不另建 `blacklist` 或 `frozen_users` 表。
- Redis key 为 `auth:frozen:{userID}`，value 为 `1`，采用可配置固定 TTL，默认 300 秒。
- Redis 没有 key 时查 SQL，查到冻结记录则回填 Redis 并拒绝访问。
- 冻结覆盖所有设备；解冻后必须重新登录。登录本身不递增用户版本，多设备正常登录互不影响。
- 删除评论功能和当前项目内所有商家采集器；只预留 Redis 外部库存消息接入边界。
- 不引入冻结同步表、状态版本队列、分布式锁、同步任务或新增审计查询系统。
- 本阶段只生成骨架，不实现登录注册、JWT 算法、GORM CRUD、冻结操作、邮件发送和消息处理。

其他保留模块：账号资料、改密码、邮箱绑定/换绑、邮件找回密码、管理员初始化与用户管理、商家、VPS、库存展示、站点设置、后台汇总、结构化操作日志与健康检查。

## 2. 骨架交付边界

需要提供目录、包、实体、请求响应、错误码、DTO、必要的小接口、API/Service 结构体、构造方法、具名路由、任务入口和配置结构。

允许实现基础连接代码：env 加载、依赖装配、Gin 启停、路由绑定、统一错误响应、日志和连接关闭。业务函数只写签名、中文职责注释与明确的未实现返回。

- Service 和工具占位返回 `NotImplemented`，不能返回空结果加 nil 来假装成功。
- API 映射为 HTTP 501；未实现的鉴权中间件终止请求，不能放行。
- worker 默认不消费消息；未实现处理器不能确认、删除真实消息。
- 提供明确的 skeleton 启动模式，无数据库也可启动占位路由；live 可成功，ready 应报告未就绪。
- 不复制旧业务实现充当“已重构”，不为了通过测试造假 token 或默认管理员。
- 不实际迁移生产数据库、删数据、发邮件、推送镜像或部署。

## 3. 目标目录和归属

```text
backend/
├── cmd/
│   ├── api/main.go
│   ├── worker/main.go
│   ├── admin/main.go
│   ├── migrate/main.go
│   └── seed/main.go
├── api/                  # 各模块具名 HTTP 方法，enter.go 聚合
├── config/               # env 对应结构、加载和静态校验
├── flag/                 # 命令行参数、初始化命令入口
├── initialize/           # DB、Redis、日志、依赖和路由装配
├── iface/
│   ├── auth/             # 身份验证、令牌、密码、CSRF 契约
│   ├── froze/            # 冻结检查和缓存契约
│   ├── mail/             # 邮件发送契约
│   └── message/          # 外部消息读取和确认契约
├── middle/               # JWT、管理员权限、日志、CSRF、限流等
├── model/
│   ├── entity/           # GORM 数据表结构，按模块拆文件
│   ├── request/          # ShouldBind / ShouldBindJSON 输入
│   ├── response/         # 响应结构和统一输出
│   ├── dto/              # 尚未实现的库存观测事件边界
│   └── errcode/          # 错误类型、数字码和 HTTP 映射
├── router/               # 路由分组和 InitXxxRouter
├── service/              # 数据库操作、事务和可复用业务的外壳
├── task/                 # 仅保留待实现的 stock_consumer 入口
├── utils/
│   ├── password/
│   ├── jwt/
│   ├── csrf/
│   ├── mail/
│   ├── redisstream/
│   └── pagination/
├── test/                 # 骨架、路由、契约检查
├── migrations/           # 迁移文件归属，骨架阶段不执行
├── .env.example
├── Dockerfile
├── README.md
└── go.mod
```

`api`、`router`、`service` 中按 `auth/user/mail/password_reset/froze/merchant/vps/stock/settings/dashboard` 建立对应文件，另设 enter.go。初始化、CLI 和健康检查按实际职责拆分。没有 `session`、`collector`、`comment` 模块。

| 目录 | 职责约束 |
| --- | --- |
| router | 只注册路径、中间件和具名 API 方法 |
| api | 绑定请求、调用服务、输出响应；不直接写 GORM/Redis 查询 |
| service | 保存数据库操作、事务和多个入口共用的业务；不依赖 Gin |
| middle | 从请求取得 token，通过 auth 接口验证；管理员角色以当前用户数据为准 |
| iface | 只声明能力契约，不导入具体 service 或 initialize |
| model | 定义数据和错误，不依赖上层业务包 |
| flag | 参数解析和命令入口，实际操作调用 service |
| initialize | 统一建立依赖和关闭资源，不处理业务 |
| task | 仅保留库存消息入口，不包含邮件任务或网页采集逻辑 |
| utils | 通用能力，不放“冻结用户”“创建 VPS”等业务 |

依赖方向：`router → api/middle → service → GORM/Redis/utils`；接口仅用于真实依赖边界。API 可以直接持有 `*service.UserService`。分组对象可以用 `ApiGroupApp` 等风格，但启动时统一装配，不在包级 init 中连接 DB 或启动任务。

子目录使用正常 Go 包名，例如 `package auth`，导入可写 `authiface "vpsmonitor/iface/auth"`。标准库 flag 与项目 flag 同时出现时使用别名。

## 4. 接口和业务方法

接口尽量小，全部放在 iface 对应用途目录。以下为契约规格，生成代码时补全明确类型，不用 any 代替业务类型。

| 接口 | 方法范围 |
| --- | --- |
| auth.Authenticator | `Authenticate(ctx, accessToken) → Principal, error` |
| auth.TokenProvider | `Issue(ctx, TokenIssueInput) → TokenPair, error`；`Verify(ctx, raw, kind) → TokenClaims, error` |
| auth.PasswordProvider | `Hash(password) → hash, error`；`Verify(hash, password) → error` |
| auth.CSRFProvider | `Issue(ctx) → token, error`；`Verify(ctx, token) → error` |
| auth.CSRFVerifier | `VerifyCSRF(ctx, token) → error`，由 AuthService 对中间件实现 |
| froze.Checker / Cache | `Check(ctx, userID) → error`；`Exists/Set/Delete` 封装冻结缓存 |
| mail.Sender | `Ready() → error`；`Send(ctx, Message) → error` |
| message.Reader / Acknowledger | `Read(ctx, options) → []Delivery, error`；`Ack(ctx, deliveryID) → error` |

不要恢复旧 `ports.Repository` 大接口，不为每张表建立 CRUD 接口。

| 模块 | API / Service 骨架 |
| --- | --- |
| auth | Register、Login、Refresh、Logout、IssueCSRF；内部 Authenticate |
| user | GetMe、UpdateMe、ChangePassword、ListUsers、GetUser、UpdateUser、ChangeRole、AdminResetPassword |
| mail | GetStatus、SendCode、Confirm，覆盖绑定和换绑 |
| password_reset | RequestCode、Confirm；确认成功后递增用户 token_version |
| froze | Freeze、Unfreeze、Check；不需要异步 operation 查询 |
| merchant | Create、Update、Delete、List、Info |
| vps | Create、Update、Delete、List、Info |
| stock | GetCurrent；内部 ApplyObservation |
| settings | GetPublic、GetAdmin、Update |
| dashboard | GetSummary，不再返回评论或采集任务统计 |

注销只清除浏览器凭据，不能承诺单设备 token 撤销。不得新增“设备列表”“踢下线指定设备”等功能。管理员修改角色后，以后端当前用户角色做权限判断。

每个方法注释写明职责、参数、返回值和待填业务。业务细节只需注释，例如“绑定请求后调用 Login 服务”“冻结记录和用户版本在同一 SQL 事务更新”，不写完整伪实现。

## 5. 认证与冻结：未来实现必须符合的流程

### 5.1 数据模型

认证与冻结只依赖 `users` 和 `fronze` 两张 SQL 表及 Redis；邮箱验证和密码找回的记录只服务对应功能，不参与每次普通登录校验。

User 保留账号、昵称、密码哈希、角色、邮箱及验证状态、时间，新增 `token_version`，初始为 1。旧 `enabled` 的用户冻结语义迁移到 fronze，避免两套独立禁用判断。商家/VPS 的 enabled 仍保留。

Fronze 模型只需 `gorm.Model` 与唯一 `user_id`。不保存 AT、RT，不增加冻结状态版本。未软删除的记录代表冻结；解冻软删除，再冻结时恢复原记录，避免唯一索引冲突。

所有 AT、RT 的 claims 保留 `sub`、`token_version`、`token_type`、`iss`、`aud`、`iat`、`exp`。删除 `sid`、`jti`、`refresh_version`。用户版本是账号级撤销版本，正常登录或刷新不递增。

### 5.2 登录、访问、刷新

注册：绑定 request → 输入和账号唯一性校验 → 密码哈希 → 保存用户。不能由注册请求指定管理员角色。

登录：ShouldBind 绑定请求 → GORM 查询用户 → 调用 VerifyPassword 验证 → 查冻结 → 使用当前用户 token_version 签发 AT/RT → 一次性返回响应。密码校验不能重新随机哈希后直接比较字符串。

每次访问受保护接口：验证 AT 签名、算法、有效期、issuer、audience、类型 → 取得用户 ID → 查冻结 → 读取用户并比较 token_version → 将 userID 和当前身份写入本次 Gin 上下文。缺用户、版本缺失或不一致都拒绝。管理员中间件据当前角色及既有邮箱验证要求判断权限。

刷新：验证 RT → 查冻结 → 比较当前用户版本 → 签发新 AT/RT。不能把旧版本 RT 升级为当前版本。无需提交 AT，旧 AT 过期不妨碍读取 RT 的用户身份。

简单默认值：AT 15 分钟，RT 为登录后 7 天，均可配置。刷新时 RT 到期时间沿用原 RT.exp，AT 不超过该截止时间；无会话表也可从已验证 RT 取得截止时间。旧 RT 在原期限内仍可使用，不实现一次性刷新或重放检测，也不声称签发新 RT 会自动撤销旧 RT。

### 5.3 冻结缓存

```text
key = auth:frozen:{userID}
value = 1
TTL = FROZEN_CACHE_TTL_SECONDS，默认 300 秒
```

TTL 是冻结缓存时长，与某个 AT 的剩余时间无关。普通 Redis 命中不刷新 TTL。

检查顺序：Redis 有 key → 拒绝；没有或 Redis 不可用 → 查 SQL；SQL 有活动冻结记录 → 尝试回填 Redis 并拒绝；SQL 确认没有记录 → 继续。Redis 回填失败不能把已冻结用户放行；SQL 查询失败不能当作没有记录。

冻结：管理员提交 user_id → 检查是否已有活动记录 → 首次冻结时写入/恢复记录，并在同一 SQL 事务递增 user.token_version → 写 Redis。重复冻结已冻结用户保持幂等，不必重复递增。

解冻：管理员解除 SQL 冻结 → 删除 Redis key。即使 SQL 已无活动记录，也执行 Redis 删除，支持重复解冻清理缓存。解冻不签发 token、不回退用户版本。

因此所有设备的旧 AT/RT 都会失效，解冻后各设备需要重新登录。改密码、管理员重置密码和邮件找回确认也递增用户版本，但不解除冻结。

SQL 成功、Redis 写入/删除失败时，保持 SQL 结果，返回 `cache_synced=false` 提示可重试，不假报 SQL 回滚。没有新增 outbox 或同步状态表。接受解冻与旧回填交错时暂时误拦的边界，旧缓存到期后回查 SQL；不为此引入复杂同步系统。

本设计要求后续 AT、RT 认证检查版本。已通过检查且正在执行的请求不会被远程撤回；骨架不增加请求取消系统。

## 6. 其他模型与删除范围

保留 Merchant、VPS、Stock、SiteSetting、MailVerification、PasswordReset，对应现有商家、套餐、库存、设置、邮箱和找回表。保留金额精度、网络未知/不限量含义、IPv4/IPv6 字段，以及库存“未知”和“无货”的区别。

删除全部评论表模型、请求响应、路由、设置、统计、分页专用逻辑、Mock、测试和文档运行引用。删除内置 DMIT、AKKO、mock、FlareSolverr、collector registry、旧采集调度和 vps_monitor_configs 运行依赖。

删除会话表运行模型、仓储接口、查询与撤销 API、刷新 JTI 比较、会话清理任务。物理删表与旧数据转换只写迁移说明，不在骨架阶段操作真实数据库。

旧审计沿用结构化日志能力，不新增 audit_logs 表及查询接口。冻结日志记录操作者和目标，不记录明文 token。旧 auth_state_sync、StockEventReceipt 等提案不是本版强制建表要求。

## 7. Redis 库存消息外壳

外部采集程序不属于本项目交付。后端预留 `task/stock_consumer.go → service/stock.ApplyObservation`，不重建采集器。

默认传输采用 Redis Streams 消费者组；这是消息边界默认值，具体生产程序、调度和消息处理由维护者实现。普通 Pub/Sub 可用于允许丢失的通知，不混作可靠库存结果。

库存事件 DTO 定义 schema_version、event_id、source、vps_id、observed_at、observation_version、status、quantity。注释明确版本按哪个来源/套餐递增，以及来源映射待实现。

只定义消息读取、解析入口、处理结果和确认边界。业务未来应在 SQL 更新成功后确认消息，重复与乱序处理写成 TODO；骨架不实现重试队列、死信系统或额外消费记录表。邮件投递独立保留外壳，不能因移除采集 worker 而丢掉找回邮件能力。

## 8. 前后端共用契约

本节与前端文档中的同名契约块内容相同。版本标识为 `refactor-skeleton-v2`，仅用于文档协调，不是 HTTP 路径。当前旧 OpenAPI 尚未更新，后端执行者负责按本节生成新契约，不能被旧会话/评论设计覆盖。

<!-- SHARED-CONTRACT-BEGIN -->
### 通信与认证

- API 前缀 `/api/v1`，JSON 字段统一 snake_case。ID 在 JSON 中用字符串，时间用 UTC RFC3339，价格用十进制字符串。
- 响应统一 `{code, message, data, request_id}`，成功 code=0，错误 data=null；可选 errors 为字段错误数组。
- 列表 data 为 `{items, total, page, page_size}`。分页 query 默认 page=1、page_size=20，最大 page_size=100。
- 沿用项目现有浏览器传输约定：AT 在 JSON 返回，前端内存保存并通过 `Authorization: Bearer ...` 携带；RT 由登录/刷新响应设置 HttpOnly Cookie，不放 JSON 或 localStorage。两种 token 都交付到浏览器，但只有 AT 供 JavaScript 读取。
- 前端请求使用 `credentials: include`。`GET /auth/csrf` 返回 data.token 并设置相应 CSRF Cookie；需要 CSRF 的写请求带 `X-CSRF-Token`。
- `/auth/register`、`/auth/login`、`/auth/refresh`、`/auth/logout`、`/auth/password-reset/*` 的写请求使用 CSRF；受保护业务使用 Bearer AT，服务端仍落实既有同源/CORS约束。
- 登录返回 data=`{user, access_token, token_type:"Bearer", expires_in}`；刷新返回 data=`{access_token, token_type:"Bearer", expires_in}`。RT 有效期由 Cookie 和服务端令牌控制。
- 不做会话管理，无 sid/jti、设备列表、单设备撤销、会话接口或刷新轮换版本。
- `user.token_version` 在冻结或密码变更时递增。后端验证 AT/RT 时比较版本；解冻后旧 token 仍失效，必须重新登录。前端不修改或自行判断版本。
- Redis 冻结 key 使用用户 ID，固定 TTL 默认 300 秒；未命中查 SQL fronze 并按需回填。SQL 冻结没有自动到期，只能管理员 Web 解冻。
- Logout 清除 RT Cookie，前端清除 AT 和身份缓存；由于没有会话管理，不保证已复制 token 失效。它不递增用户版本、不影响其他设备。
- 仅 ACCESS_EXPIRED 触发一次 RT 刷新，成功后原请求重试一次；并发请求共用一次刷新。USER_FROZEN、TOKEN_REVOKED、INVALID_TOKEN 和刷新失败终止刷新链。DEPENDENCY_UNAVAILABLE 与 NOT_IMPLEMENTED 不等同账号被冻结。

### 目标端点

表中路径均相对 `/api/v1`。公开=不要求 AT；用户=需要 AT；管理员=需要当前管理员角色，并保留已验证邮箱要求。

| 权限 | 方法与路径 | 输入 → data |
| --- | --- | --- |
| 公开 | GET `/auth/csrf` | 无 → `{token}` |
| 公开 | POST `/auth/register` | `{username,nickname,password}` → PublicUser，注册不自动登录 |
| 公开 | POST `/auth/login` | `{username,password}` → LoginResult，并设置 RT Cookie |
| 公开 | POST `/auth/refresh` | 无 JSON，RT Cookie → TokenResult，并设置 RT Cookie |
| 公开 | POST `/auth/logout` | 无 JSON → null，清除 RT Cookie |
| 公开 | POST `/auth/password-reset/code` | `{mail}` → `{reset_id,expires_in,retry_after,message}` |
| 公开 | POST `/auth/password-reset/confirm` | `{reset_id,code,new_password}` → null |
| 用户 | GET `/me/info` | 无 → AccountUser |
| 用户 | PUT `/me/update` | `{nickname}` → AccountUser |
| 用户 | PUT `/me/password` | `{current_password,new_password}` → null，全部旧 token 失效 |
| 用户 | POST `/me/mail/code` | `{mail,current_password?}` → `{verification_id,expires_in,retry_after}` |
| 用户 | POST `/me/mail/verify` | `{verification_id,code}` → AccountUser |
| 公开 | GET `/merchant/list`、GET `/merchant/info` | 分页筛选 / query id → 商家列表 / 商家详情 |
| 公开 | GET `/vps/list`、GET `/vps/info` | 分页筛选 / query id → VPS 列表 / VPS 详情 |
| 公开 | GET `/stock/info` | query vps_id → Stock |
| 公开 | GET `/settings/info` | 无 → PublicSettings |
| 管理员 | GET `/admin/user/list`、GET `/admin/user/info` | 分页、q、role、frozen / query id → AdminUser 列表 / AdminUser |
| 管理员 | PUT `/admin/user/update`、PUT `/admin/user/role` | `{id,nickname}` / `{id,role}` → AdminUser |
| 管理员 | POST `/admin/user/resetPassword` | `{user_id,new_password}` → null，目标用户旧 token 失效 |
| 管理员 | POST `/admin/froze/freeze`、POST `/admin/froze/unfreeze` | `{user_id}` → `{user_id,frozen,cache_synced}` |
| 管理员 | POST `/admin/merchant/create`、PUT `/admin/merchant/update`、DELETE `/admin/merchant/delete` | 创建体 / 带 id 编辑体 / query id → AdminMerchant / AdminMerchant / null |
| 管理员 | GET `/admin/merchant/list`、GET `/admin/merchant/info` | 分页筛选 / query id → 管理列表 / AdminMerchant |
| 管理员 | POST `/admin/vps/create`、PUT `/admin/vps/update`、DELETE `/admin/vps/delete` | 创建体 / 带 id 编辑体 / query id → AdminVPS / AdminVPS / null |
| 管理员 | GET `/admin/vps/list`、GET `/admin/vps/info` | 分页筛选 / query id → 管理列表 / AdminVPS |
| 管理员 | GET `/admin/settings/info`、PUT `/admin/settings/update` | 无 / `{site_name?,registration_enabled?}` → AdminSettings |
| 管理员 | GET `/admin/dashboard/info` | 无 → DashboardSummary |

业务成功默认 HTTP 200，找回验证码申请为 202；错误使用对应 HTTP 状态和统一响应。服务端身份来自已验证 token，不接受请求体传入操作者身份。没有旧 session/comment/monitor/collector 路径。

### 核心 DTO

- PublicUser：id、username、nickname、role、created_at、updated_at。
- AccountUser：PublicUser + mail（可空）、mail_verified、mail_verified_at（可空）、mail_required。
- LoginResult.user 为 AccountUser。AdminUser：PublicUser + frozen；管理列表不默认公开邮箱。
- Merchant：id、code、name、website_url；AdminMerchant 增加 enabled、created_at、updated_at。创建体为 code/name/website_url/enabled，编辑体为 id 和允许变更的 name/website_url/enabled。
- VPS：id、merchant、code、name、description、cpu_cores、memory_mb、disk_gb、disk_type、transfer_gb、port_mbps、has_ipv4、ipv4_count、has_ipv6、ipv6_count、price_amount、currency、billing_period、purchase_url、stock、created_at、updated_at。transfer_gb/port_mbps 可空，保留旧未知与不限量语义。
- AdminVPS 增加 merchant_id、enabled。创建/编辑输入使用上述可编辑套餐字段及 merchant_id/enabled，去掉 id/merchant/stock/时间等输出字段；编辑额外带 id。purchase_url 作为独立套餐购买地址字段，不再从 monitor_config 推导。
- Stock：vps_id、status、quantity（可空）、last_checked_at（可空）、last_in_stock_at（可空）、is_stale。status：1有货、2无货、3未知。去掉 monitor_enabled 和 collector 配置。
- PublicSettings：site_name、registration_enabled。AdminSettings：`{settings:PublicSettings,updated_at}`。
- DashboardSummary：user_count、frozen_user_count、merchant_count、vps_count、in_stock_count、unknown_stock_count；不包含评论、在线设备或采集任务统计。
- 冻结/解冻响应 frozen 表示 SQL 状态，cache_synced=false 表示 Redis 写入/删除失败，可提示重试相同操作。没有 pending operation、同步进度轮询或解冻自动登录。
- 公开商家筛选 q；公开 VPS 筛选 q、merchant_id、currency、billing_period、status、sort；sort 使用固定枚举 updated_desc/price_asc/price_desc。管理员商家/VPS 另可按 enabled 筛选，用户按 q/role/frozen 筛选。所有列表沿用统一分页。

### 错误约定

保留适用的旧错误数字，明确以下新语义；不能沿用 SESSION_REVOKED 或 REFRESH_REUSED 表示会话能力。

| 名称 | code | HTTP | 行为 |
| --- | --- | --- | --- |
| INVALID_ARGUMENT | 100001 | 400 | 展示参数错误 |
| RATE_LIMITED | 100003 | 429 | 提示稍后重试 |
| CSRF_REJECTED | 100004 | 403 | 请求验证失败，不自动刷新 AT |
| RESOURCE_NOT_FOUND | 100005 | 404 | 展示资源不存在 |
| INVALID_CREDENTIALS | 200001 | 401 | 登录失败，不触发 RT 刷新 |
| AUTH_REQUIRED | 200002 | 401 | 需要登录 |
| ACCESS_EXPIRED | 200003 | 401 | 普通业务请求可尝试一次刷新 |
| USER_FROZEN | 200005 | 403 | 清理本地登录态，提示被冻结，不循环刷新 |
| PERMISSION_DENIED | 200006 | 403 | 无权限，不当作 token 过期 |
| INVALID_TOKEN | 200009 | 401 | token 无效或 RT 过期，重新登录 |
| MAIL_REQUIRED | 200011 | 403 | 管理员先完成邮箱验证 |
| TOKEN_REVOKED | 200017 | 401 | 用户版本不一致，重新登录 |
| DEPENDENCY_UNAVAILABLE | 900004 | 503 | 服务依赖异常，不推断身份状态 |
| NOT_IMPLEMENTED | 900005 | 501 | 功能尚未实现，不展示假成功 |

其他保留模块错误沿用旧码并在新 OpenAPI 中逐项登记；旧 200004、200010 及评论/采集专用错误退役，不挪作新含义。所有骨架业务端点统一返回 NOT_IMPLEMENTED，表中成功契约供后续实现使用。
<!-- SHARED-CONTRACT-END -->

## 9. 路由风格

```go
func (a *MerchantRouter) InitMerchantRouter(
    Router *gin.RouterGroup,
    PublicRouter *gin.RouterGroup,
) {
    merchantRouter := Router.Group("merchant")
    merchantPublicRouter := PublicRouter.Group("merchant")
    merchantApi := api.ApiGroupApp.MerchantApi
    {
        merchantRouter.POST("create", merchantApi.MerchantCreate)
        merchantRouter.DELETE("delete", merchantApi.MerchantDelete)
        merchantRouter.PUT("update", merchantApi.MerchantUpdate)
        merchantRouter.GET("list", merchantApi.MerchantAdminList)
        merchantRouter.GET("info", merchantApi.MerchantAdminInfo)
    }
    {
        merchantPublicRouter.GET("list", merchantApi.MerchantList)
        merchantPublicRouter.GET("info", merchantApi.MerchantInfo)
    }
}
```

此处 Router 是挂了鉴权和管理员权限的 `/api/v1/admin`，PublicRouter 为 `/api/v1`。另装配 `/api/v1/me` 用户分组。命名本身不代表已挂中间件。API 内绑定的是 model/request 类型，response 类型仅用于输出。

## 10. 配置、入口与迁移

配置分组：Application、HTTP、Database、Redis、JWT、Mail、Worker、Logging。增加 Redis 连接配置、`FROZEN_CACHE_TTL_SECONDS=300` 及可选 Stream/group 配置。TTL 必须为正值，不能把 0 隐式解释成永久冻结缓存。

删除 collector、FlareSolverr、旧采集扫描和会话配置；保留邮件、CSRF、通用限流、代理和 CORS 配置。初始化管理员的命令也只留参数和方法外壳，不创建真实账号，不提供 CLI 解冻入口。

管理员初始化保留“创建普通候选账号 → 完成邮箱验证 → 提升角色”的既有权限语义。种子演示用户不能因删除 users.enabled 就自动变成可登录账号，单独写迁移说明。

旧 migration 不改编号和既有内容。后续转换要处理 user.token_version、fronze、旧 users.enabled、旧 session/评论/监控表退役及 purchase_url 数据归属；本次骨架只写计划。旧 JWT 缺用户版本一律不兼容，切换后重新登录。

更新 backend 的 Dockerfile、entrypoint、README 和 env。根目录 Compose/VPS env/CI 由后端执行者统一协调，增加 Redis 并保护数据卷；不要自动发布。前端执行者仅负责 frontend 内文件和其 README，避免交叉覆盖。

## 11. 执行顺序和旧代码映射

1. 读取项目规则并盘点当前源码与未提交修改，不覆盖维护者工作。
2. 明确每个文件保留整理、重建外壳或删除的去向。
3. 建立 model、iface、config、initialize 和错误占位，使依赖闭合。
4. 重建各业务模块的 router/api/service 与 middle 外壳。
5. 移除评论、会话和旧采集运行链路，保留外部库存与邮件任务入口。
6. 按共用契约更新 OpenAPI、env、入口、部署路径和维护说明。
7. 完成结构、编译、路由及未实现行为检查，交付待实现方法清单。

旧 `transport/httpapi` 拆到 router/api/middle/model；`application` 和 `gormrepo` 的职责归各 service；`ports` 必要接口归 iface；`domain` 归 model；`platform` 归 config/model/utils/middle；`bootstrap` 和数据库初始化归 initialize。禁止新旧两套业务结构同时保留为运行入口。

## 12. 验收

- 所有后端模块已按新结构归类，未仅移动少量文件；frontend 不被改写。
- `go build ./...` 通过；骨架测试通过，无循环依赖、缺类型或虚假业务成功。
- router 只绑定具名方法；service 不导入 Gin；iface 无通用大 Repository。
- 不存在运行中的会话、jti、sid、refresh_version、评论和旧采集逻辑。
- 认证契约仅使用用户版本、SQL fronze 和 Redis TTL；默认 300 秒，两份文档一致。
- 鉴权占位拒绝请求；业务返回 501；worker 不消费或确认真实消息。
- 路由、DTO、错误码与共用契约和新 OpenAPI 一致。
- 文档注明“可运行骨架，业务未实现”，登录冻结等未来业务测试不算已经通过。
- 不操作真实业务数据、不发信、不部署、不覆盖现有未提交修改。

只针对路由覆盖、未实现鉴权不放行、错误映射和任务不消费等必要边界做检查；不要为每个空方法重复写同样的测试。
