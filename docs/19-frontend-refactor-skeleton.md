# VPS Monitor 前端全量重构：外部骨架规格

> 可直接交给另一个模型执行，无需阅读之前的聊天。只负责前端，不重写后端。
> 目标是页面、类型、调用和状态的完整外部骨架，具体业务由维护者后续填入。本次生成文档不等于已经执行重构。

## 1. 项目与最终要求

这是一个 VPS 套餐及库存展示网站，包含公开页面、账号功能和管理员后台。现有前端位于 frontend，使用 React 18、TypeScript、React Router、Vite、Tailwind CSS、Vitest 和 MSW。

后端将全面重构为 Go/Gin/GORM/PostgreSQL/Redis 外壳，但本任务只修改 frontend。目标是全前端整理，不能仅删除几个页面就交付；现有每个源码文件都需确认归属。通用 UI、样式和格式化函数可复用，不要求另起一套视觉风格或升级依赖大版本。

最终产品变化：

- 不做会话管理：没有设备列表、当前会话、单设备踢下线、会话撤销或刷新轮换界面。
- 删除评论：公开评论区、我的评论、管理员评论、评论设置和统计全部移除。
- 删除旧采集器及管理功能：采集器选择、监控配置、轮询间隔、手动采集和采集任务状态全部移除。
- 保留 VPS 当前库存展示，结果未来由外部程序通过 Redis 交给后端；浏览器不连接 Redis。
- 管理员可冻结或解冻用户。冻结影响全部设备；解冻后用户必须重新登录。
- 正常多设备登录互不影响。普通退出只清理本浏览器凭据，不承诺撤销已复制 token。
- 后端骨架业务返回 HTTP 501，需要明确显示“功能尚未实现”，不能显示假登录、假保存成功。

## 2. 工作范围与边界

允许修改 frontend 下的源码、测试、配置、Dockerfile、Nginx 配置和 README。可以读取仓库旧类型和 OpenAPI 理解字段，但不得让旧 session/comment/monitor 契约覆盖本文。

后端执行者负责 backend、docs/openapi.yaml，以及根目录 Compose、VPS env 和共享 CI。前端模型不编辑这些文件；需要调整时写入 frontend README 的交接项，避免两个模型互相覆盖。

不实现 Go 代码、SQL、JWT 签名、Redis 操作或外部采集。不创建新的 Codex 任务，不调用另一个模型，不部署站点或镜像。

交付内容：

- 完整可构建的路由、布局、页面容器、表单字段和展示组件。
- 按模块拆分的 API 方法、请求响应类型、错误类型、身份状态和调用入口。
- loading、empty、error、forbidden、not implemented 等统一状态。
- 业务函数的明确占位和后续接入点。
- 类型检查、构建与必要骨架测试，以及重构清单。

可以实现 UI 本地交互、导航、字段输入和通用 HTTP 外壳。登录注册提交、认证恢复、自动刷新、管理员变更等业务只留调用契约/占位；不要借用旧业务实现在页面里保留完整流程。

普通占位返回明确 NotImplemented 错误。需要看到页面外观时可建立显式静态预览，不生成 token，不修改真实登录态，不默认进入管理员身份。

## 3. 目标结构

```text
frontend/src/
├── app/
│   ├── router.tsx
│   ├── providers.tsx
│   ├── AuthContext.tsx
│   ├── SettingsContext.tsx
│   ├── Guards.tsx
│   └── ErrorBoundary.tsx
├── api/
│   ├── auth.ts
│   ├── user.ts
│   ├── mail.ts
│   ├── passwordReset.ts
│   ├── froze.ts
│   ├── merchant.ts
│   ├── vps.ts
│   ├── stock.ts
│   ├── settings.ts
│   └── dashboard.ts
├── types/
│   ├── common.ts
│   ├── auth.ts
│   ├── user.ts
│   ├── mail.ts
│   ├── passwordReset.ts
│   ├── froze.ts
│   ├── merchant.ts
│   ├── vps.ts
│   ├── stock.ts
│   ├── settings.ts
│   ├── dashboard.ts
│   └── error.ts
├── pages/
│   ├── public/             # 首页、商家列表/详情、VPS 详情
│   ├── auth/               # 登录、注册、找回密码
│   ├── account/            # 资料、改密、邮箱；没有设备列表
│   ├── admin/              # 汇总、商家、VPS、用户、设置
│   └── ErrorPages.tsx
├── features/
│   ├── auth/               # 表单和身份交互外壳
│   ├── account/            # 资料、改密、邮箱表单
│   ├── merchant/           # 列表筛选和编辑表单
│   ├── vps/                # 套餐筛选、详情和编辑表单
│   └── user/               # 管理员用户编辑、冻结/解冻入口
├── components/
│   ├── layout/
│   ├── ui/
│   └── common/             # StockBadge、状态展示等
├── lib/
│   ├── http/               # 请求、错误、AT 内存存储、CSRF 外壳
│   └── format/
├── styles/
├── test/
└── main.tsx
```

类型不要继续集中为一个包含全部业务的 types/api.ts。页面不直接拼 URL 或重复解析统一响应，API 调用放在 api；纯展示组件不直接请求后端。旧路径可以短期通过 re-export 迁移，交付时清理无用途的兼容层。

前端不照搬 Go 的 iface 目录。TypeScript 的请求响应和必要依赖接口归 types 或所属功能模块。

## 4. 页面与路由清单

| 页面路由 | 骨架内容 |
| --- | --- |
| `/` | VPS 列表、查询条件、库存标签、分页与空状态 |
| `/merchants` | 商家列表 |
| `/merchants/:id` | 商家信息及其套餐 |
| `/vps/:id` | 规格、价格、购买地址和库存；没有评论区 |
| `/login` | 用户名、密码、提交占位、注册与找回链接 |
| `/register` | 用户名、昵称、密码和确认密码；注册后前往登录 |
| `/reset-password` | 邮箱申请验证码、验证码和新密码表单 |
| `/forgot-password` | 重定向到 `/reset-password` |
| `/account` | 个人资料、改密码、邮箱绑定/换绑、退出；没有会话列表 |
| `/admin` | 汇总卡片，无评论/在线设备/采集任务统计 |
| `/admin/merchants` | 商家筛选、列表、创建编辑和删除入口 |
| `/admin/vps` | VPS 筛选、列表和创建入口 |
| `/admin/vps/:id` | 编辑套餐、购买地址与查看库存；无采集配置 |
| `/admin/users` | 用户筛选、详情、角色编辑、密码重置、冻结/解冻 |
| `/admin/settings` | 站点名称与注册开关 |
| `/403`、兜底路径 | 无权限、404 |

移除 `/account/comments`、`/admin/comments`、`/admin/monitors` 及相关导航、懒加载和组件引用。退役页面访问走 404，不留“以后恢复”的隐藏路由。

管理员权限仍由后端决定。前端 Guard 只负责导航体验；状态未知或未实现时不能默认放行。为方便审阅外壳，可提供明确独立的静态预览，不让预览改变正式路由的认证判断。

## 5. 身份状态与冻结交互

AuthContext 可定义 loading、anonymous、authenticated、unavailable。UserFrozen 和 TokenRevoked 通过错误原因展示，不伪装成“会话过期”。对后端返回的用户信息使用明确 AccountUser 类型。

以下是后续接入必须满足的行为，本阶段只定义类型、方法和占位，不实现完整认证流程：

- 登录成功后设置内存 AT 与用户；RT 由 Cookie 维护。
- 页面重载后可通过 refresh 再 me/info 恢复身份；刷新流程未实现时显示不可用，不造假成功。
- ACCESS_EXPIRED 才尝试 RT 刷新，原请求最多重试一次，并发请求复用同一次刷新。
- USER_FROZEN：清理本地 AT/用户，提示“账号已被冻结，请联系管理员”，停止刷新。
- TOKEN_REVOKED：清理本地身份，提示“登录凭证已失效，请重新登录”。解冻不会自动恢复登录。
- PERMISSION_DENIED：展示无权限；MAIL_REQUIRED：引导账号邮箱验证。
- 501/503：分别展示未实现/暂不可用，不将依赖异常当成冻结或无权限。
- 修改密码、找回密码成功后重新登录。管理员重置其他用户密码不清除管理员自己的身份。
- 普通退出清理当前浏览器身份并请求清除 RT Cookie，不增加“当前设备已被服务端撤销”的文案。

管理员冻结入口传 user_id，不要求提交或获取目标用户的 token。界面状态使用 frozen，删除旧用户 enabled 开关；商家和 VPS 的 enabled 开关仍保留。

冻结/解冻成功按响应 frozen 更新 SQL 状态展示。如果 cache_synced=false，保留 SQL 结果并提示“状态已更新，缓存同步失败，可重试”，不得显示“操作全部失败，状态未变”，也不要增加异步同步进度轮询。普通用户不展示 Redis 细节。

## 6. 前后端共用契约

本节是完整嵌入的 `refactor-skeleton-v2` 契约快照，无需先取得后端实现就能定义类型与调用外壳。它和后端文档相同；旧 OpenAPI 尚未重写，不能因此沿用旧会话、评论或采集接口。

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

## 7. 组件、表单与数据含义

- 商家创建/编辑包含标识、名称、官网与启用状态；编辑操作遵守只读字段约束。
- VPS 表单保留 CPU、内存、磁盘、流量、端口速率、IPv4/IPv6、价格、货币、计费周期、商家、描述、购买地址和启用状态。
- 删除 VPS 表单中的 monitor_config、collector_code、采集超时与间隔。购买地址是独立 purchase_url，不从被删除的采集配置取值。
- 价格用字符串处理和显示，避免金额精度损失。库存数量 null 表示未知，0 表示明确为零；不能统一渲染成“无货”。
- transfer_gb/port_mbps 的 null、0、正数保留现有业务含义，不在表单默认值中把未知变成零。
- 布局保留响应式、表单 label、按钮禁用和错误提示。优先复用现有组件，避免每个页面复制弹窗、分页、加载状态。
- 功能未实现时提示具体入口尚未接入，不用空列表冒充已成功查询；真正 empty 状态只用于成功返回空结果。
- 注册的确认密码仅用于前端输入校验，不发送后端。管理员身份、token_version 不能作为可编辑表单字段。
- 保留结构化字段错误展示；前端校验只是输入体验，不能替代后端校验。

## 8. 全量清理清单

| 现有内容 | 处理 |
| --- | --- |
| `features/comments`、MyCommentsPage、AdminCommentsPage | 删除全部源码和引用 |
| Comment 相关 types、visibility、游标与 Mock | 删除专用部分，共用部分按实际引用保留 |
| AdminMonitorsPage、MonitorConfig、monitor_config、采集器选择 | 删除 |
| Stock.monitor_enabled、旧采集错误展示 | 删除或按新 Stock 契约替换 |
| Session 类型、设备列表、当前会话和撤销接口 | 删除，不改名保留 |
| SESSION_REVOKED、REFRESH_REUSED | 退役；使用新 TOKEN_REVOKED 区分用户版本失效 |
| 用户 enabled 编辑 | 改为 frozen 展示与 freeze/unfreeze 操作 |
| 评论设置、统计与导航 | 删除 |
| 旧 AuthContext、token/client/CSRF 流程 | 提取通用结构，业务改为有类型占位 |
| mocks/handlers 与示例数据 | 清理退役字段，默认不启动伪业务服务 |
| types/api.ts | 拆为各模块类型，清理重复定义 |
| 旧测试、README 和 env | 按新骨架和契约调整 |

MSW 只允许用于明确标注的预览数据或测试夹具，不模拟真实认证。默认开发入口不能自动创建管理员、假 token 或假冻结成功。第三方生成的 mockServiceWorker.js 不必手工重写，按是否还需要 MSW 决定保留。

## 9. API 调用外壳和契约管理

api 模块导出清楚的函数签名，例如 login(input)、register(input)、getMe()、freezeUser(userID)、unfreezeUser(userID)、listVPS(query)。写明目标方法与路径，输入输出使用本文件契约，不用宽泛 any。

业务函数可先统一抛出 NotImplementedError。通用 HTTP 外壳可以准备，但不能在占位路径返回模拟业务成功。后端 501 必须稳定映射到未实现状态。

邮件验证码、错误数字、套餐字段等细节按共用契约和现有保留字段确定。遇到确实缺失的字段，在 frontend README 记录接口待定项并保持类型边界，不擅自新增后端业务。如果将来协商修改契约，两端文档和 OpenAPI 应一起更新，不能各自默默改路径。

## 10. 测试、构建和交付

执行前阅读项目规则，检查工作区已有未提交修改，不通过 reset/clean 覆盖维护者内容。

执行顺序：盘点文件 → 拆类型与 API 外壳 → 整理布局和路由 → 建立页面与表单骨架 → 移除评论/会话/旧采集 → 整理身份和错误状态 → 调整测试和 README。

使用项目现有脚本：

```text
npm run typecheck
npm run build
npm run test
```

依赖安装遵循现有锁文件和包管理器。不要为了迁就旧业务测试恢复已删除功能。只保留或新增必要的路由、错误状态、纯格式化和类型契约检查；不为每个占位函数重复写同样的测试。

验收要求：

- 全部 frontend 源码有明确去向，不只是局部改动；没有改动 backend 或根目录共享部署文件。
- 类型检查、构建和适用测试通过。
- 页面路由、导航与表单外壳齐全，无悬空导入或未说明的空页面。
- 不存在评论、会话管理、旧采集管理或默认管理员入口。
- 冻结/解冻和 token 错误的状态边界明确，没有刷新死循环或伪业务成功。
- 不使用 localStorage 保存 RT，不在控制台记录密码或 token。
- 新 API 方法、DTO 和错误码与本文件共用契约一致。
- 保留既有 UI 的基本可读性和移动端布局；只有静态预览可用时明确标注。
- README 给出启动方式、目录说明、API 待接入方法清单和未实现范围。
- 最终报告明确“前端外部骨架已完成，业务尚未实现”，不声称已完成真实登录、冻结或库存采集。
