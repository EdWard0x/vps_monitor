# VPS Monitor 后端开发需求文档

本文是交给后端开发模型的需求与实施说明，不是功能已完成或测试已通过的报告。请以 `backend/router` 目录逐文件梳理功能，沿用项目已有实现的代码风格，补齐关联模块。前端开发需求见同目录 `frontend.md`。

## 一、目标和范围

完成现有 router 对应的全部业务能力，使管理员可以通过真实接口管理用户、录入商家和 VPS、调整站点设置，并保存是否允许采集的配置。接口涉及其他模块时，应一并完成依赖，不能只补路由或返回假成功。

**维护者自行完成的部分必须预留：VPS 是否有货的采集、库存更新，以及直接服务于这些工作的调度、库存消息消费和确认逻辑。** 本次不编写抓取网页、解析有货状态、模拟库存、定时更新库存等实现。

保留正常的库存查询和展示能力。没有库存记录代表“未知”，不得为了让页面有数据而生成库存。采集开关可保存，但在实际采集器接入前不能宣称采集已经启动。

## 二、实施约束

- 保持 Go/Gin/GORM/PostgreSQL/Redis 技术栈，延续 `router → api → service → model` 分层和构造器依赖注入方式。
- router 负责注册路径和中间件；api 绑定参数、调用 service、封装响应；service 处理业务、事务、权限相关约束与数据库读写。
- 使用现有 `model/request`、`model/response`、`model/entity`、`model/errcode`，避免建立第二套同类架构。
- 先阅读已有实现并复用，修复缺失的业务闭环；保留维护者已有未提交改动，不整体覆盖文件或回退仓库。
- 延续现有接口命名和路径。新需求优先扩展现有设置、商家和 VPS 接口，不擅自增加评论、设备会话、订阅或通知等功能。
- 对现有数据库通过新增迁移升级，不改已执行迁移的内容；不默认运行种子数据，不自动发布。
- 本文与旧骨架文档冲突时，以本文明确的目标为准：业务需要完成，只有采集和库存写入保留。

## 三、统一接口约定

业务路径前缀为 `/api/v1`，JSON 字段使用 snake_case。

- ID 使用字符串，避免 JavaScript 大整数精度问题；验证码请求标识作为不透明字符串处理。
- 时间使用 RFC3339；价格使用十进制字符串。
- 成功响应：`{code:0,message:"ok",data,request_id}`。
- 失败响应：`{code,message,data:null,request_id}`，配合正确 HTTP 状态；不得用成功响应承载占位业务。
- 列表返回 `data={items,total,page,page_size}`；默认 page=1、page_size=20，最大 page_size=100，空列表返回 `items:[]`。
- 普通业务成功 HTTP 200；忘记密码验证码申请 HTTP 202；删除成功仍返回统一包络且 data=null。
- POST/PUT 业务参数放 JSON 请求体；详情、删除和筛选参数依现有路由放 query。
- 公开、已登录、管理员权限必须在后端校验，不能依赖前端隐藏菜单。

认证继续采用现有 AT/RT 设计：AT 在响应 JSON 中返回，前端只在内存中保存，调用受保护接口时携带 `Authorization: Bearer ...`；RT 放 HttpOnly Cookie，不放 JSON 或 localStorage。前端请求带 `credentials: include`。

`GET /auth/csrf` 返回 `data.token` 并设置相应 Cookie。`/auth` 下写请求携带 `X-CSRF-Token`。受保护业务按现有 Bearer 约定处理，同时正确配置 CORS、Cookie 和可信代理。

## 四、逐文件功能清单

以下路径均省略 `/api/v1`。

### router/auth.go

| 方法与路径 | 输入 | 返回/要求 |
| --- | --- | --- |
| GET `/auth/csrf` | 无 | `{token}`，复用有效凭据 |
| POST `/auth/register` | `{username,nickname,password}` | PublicUser；检查注册开关、输入和用户名唯一性 |
| POST `/auth/login` | `{username,password}` | `{user:AccountUser,access_token,token_type,expires_in}`，设置 RT Cookie |
| POST `/auth/refresh` | RT Cookie | `{access_token,token_type,expires_in}`，检查令牌、用户和冻结状态 |
| POST `/auth/logout` | 无 | 清除当前浏览器 RT Cookie，data=null |
| POST `/auth/password-reset/code` | `{mail}` | `{reset_id,expires_in,retry_after,message}` |
| POST `/auth/password-reset/confirm` | `{reset_id,code,new_password}` | 修改密码并作废旧令牌，data=null |

注册只创建普通用户，不能从请求体接受管理员角色。用户名需要归一化、校验和数据库唯一约束；密码哈希保存。沿用现有密码工具的规则，并使注册、改密、管理员重置和找回密码保持一致。

鉴权读取数据库中的当前角色、邮箱状态和 token_version。冻结和密码变更必须使此前 AT/RT 失效；角色变化也应立即反映权限。刷新不无限延长原 RT 截止时间。登出只清除当前浏览器凭据，不增加设备会话管理能力。

### router/user.go

| 方法与路径 | 输入 | 返回 |
| --- | --- | --- |
| GET `/me/info` | AT | AccountUser |
| PUT `/me/update` | `{nickname}` | AccountUser |
| PUT `/me/password` | `{current_password,new_password}` | null |
| POST `/me/mail/code` | `{mail,current_password?}` | `{verification_id,expires_in,retry_after}` |
| POST `/me/mail/verify` | `{verification_id,code}` | AccountUser |
| GET `/admin/user/list` | 分页、q、role、frozen | List<AdminUser> |
| GET `/admin/user/info` | `?id=` | AdminUser |
| PUT `/admin/user/update` | `{id,nickname}` | AdminUser |
| PUT `/admin/user/role` | `{id,role}` | AdminUser |
| POST `/admin/user/resetPassword` | `{user_id,new_password}` | null |

个人操作的用户 ID 来自认证结果，不能信任请求中的操作者身份。普通资料编辑不得修改角色、密码哈希、验证状态或 token_version。

管理员角色仅允许 `user/admin`；提升管理员之前要求目标已验证邮箱。管理员自己未验证邮箱时仍可访问个人中心，但不能进入管理员业务接口。保护最后一个可用管理员，避免降权或冻结造成管理入口失效，并考虑并发操作。

管理员重置密码不得顺便解除冻结。管理列表不返回密码哈希或不必要的邮箱等信息。

### router/froze.go

| 方法与路径 | 输入 | 返回 |
| --- | --- | --- |
| POST `/admin/froze/freeze` | `{user_id}` | `{user_id,frozen,cache_synced}` |
| POST `/admin/froze/unfreeze` | `{user_id}` | `{user_id,frozen,cache_synced}` |

沿用现有 SQL `fronze` 和 Redis 冻结缓存设计。SQL 表示冻结事实，Redis 作为缓存；默认 TTL 300 秒，不是自动解冻时间。未命中或缓存不可用时应按既有安全约定查询 SQL。

冻结与 token_version 更新在事务内完成，重复提交应可安全处理。解冻不恢复旧令牌。缓存同步失败不能伪称同步成功，返回 `cache_synced=false`，允许重试相同操作。

### router/merchant.go

| 方法与路径 | 输入 | 返回 |
| --- | --- | --- |
| GET `/merchant/list` | 分页、q | List<Merchant> |
| GET `/merchant/info` | `?id=` | Merchant |
| GET `/admin/merchant/list` | 分页、q、enabled | List<AdminMerchant> |
| GET `/admin/merchant/info` | `?id=` | AdminMerchant |
| POST `/admin/merchant/create` | `{code,name,website_url,enabled,collection_enabled}` | AdminMerchant |
| PUT `/admin/merchant/update` | `{id,name,website_url,enabled,collection_enabled}` | AdminMerchant |
| DELETE `/admin/merchant/delete` | `?id=` | null |

支持管理员从空数据库开始录入真实商家。code 唯一且创建后不可编辑；校验名称与 HTTP/HTTPS 网站地址。公开接口只能查看已启用且未删除的商家。

删除仍有关联 VPS 的商家应返回明确冲突，提示先处理套餐；不静默级联删除数据。软删除后的唯一值复用规则应与数据库约束一致，并写入接口说明。

### router/vps.go

| 方法与路径 | 输入 | 返回 |
| --- | --- | --- |
| GET `/vps/list` | 分页和筛选 | List<VPS> |
| GET `/vps/info` | `?id=` | VPS |
| GET `/admin/vps/list` | 分页和筛选、enabled | List<AdminVPS> |
| GET `/admin/vps/info` | `?id=` | AdminVPS |
| POST `/admin/vps/create` | VPSEditable | AdminVPS |
| PUT `/admin/vps/update` | VPSEditable + id | AdminVPS |
| DELETE `/admin/vps/delete` | `?id=` | null |

VPS 筛选包括 q、merchant_id、currency、billing_period、status、sort；sort 使用 `updated_desc/price_asc/price_desc` 白名单，禁止直接拼接用户排序内容。

可编辑字段：

```text
merchant_id, code, name, description,
cpu_cores, memory_mb, disk_gb, disk_type,
transfer_gb, port_mbps,
has_ipv4, ipv4_count, has_ipv6, ipv6_count,
price_amount, currency, billing_period, purchase_url,
enabled, collection_enabled
```

商家必须存在；套餐 code 在商家内唯一。CPU/内存为正整数，其他数量不能为负数；IP 开关与数量一致。价格使用精确十进制，币种使用三位大写代码。计费周期沿用 `monthly/quarterly/yearly/one_time`。transfer_gb/port_mbps 保留 null 未知、0 不限量的语义。

公开 VPS 及库存查询必须同时考虑商家和套餐是否启用、是否删除；不能通过详情 ID 或筛选参数绕过。管理员可查看停用项。创建/编辑 VPS 仅维护套餐信息，**不得写入或更新库存**。

### router/stock.go

GET `/stock/info?vps_id=` 返回：

```text
{vps_id,status,quantity,last_checked_at,last_in_stock_at,is_stale}
```

status：1 有货、2 无货、3 未知。quantity 和时间可为 null。无库存行时返回未知、null 数量和时间、is_stale=true；这是未获得库存信息的真实状态，不是 mock。资源不存在或公开不可见时返回 404。

新鲜度按照固定阈值判断并在接口文档注明，可沿用 15 分钟。过期不等于无货，不应覆盖原有状态。库存采集及写入方法保留明确 TODO/未实现结果。

### router/settings.go

| 方法与路径 | 输入 | 返回 |
| --- | --- | --- |
| GET `/settings/info` | 无 | PublicSettings |
| GET `/admin/settings/info` | 无 | AdminSettings |
| PUT `/admin/settings/update` | `{site_name?,registration_enabled?,collection_enabled?}` | AdminSettings |

PublicSettings 为 `{site_name,registration_enabled}`。AdminSettings 建议保持现有 settings 嵌套结构，并在顶层增加采集配置和能力标记：

```text
{settings:PublicSettings,collection_enabled,collector_implemented,updated_at}
```

设置部分更新应能正确保存 false，不遗漏零值。初始采集关闭；注册默认关闭，由管理员开启。`collector_implemented=false` 表示实际采集器尚未接入，不能由客户端随意写入。

### router/dashboard.go

GET `/admin/dashboard/info` 返回真实数据库统计：

```text
{user_count,frozen_user_count,merchant_count,vps_count,in_stock_count,unknown_stock_count}
```

无数据时计数为 0。明确是否包含停用项，并与管理列表口径一致；建议包含未删除的停用商家和套餐。没有库存行的套餐计入未知库存。不增加虚构采集任务数、在线设备数或走势图。

### router/router.go、enter.go

完成路由装配、认证/管理员/CSRF 中间件、错误响应、CORS、可信代理和限流的实际接入。`/health/live` 表示进程存活，`/health/ready` 检查运行所需依赖和迁移状态，不能固定返回假就绪。

## 五、采集控制的明确边界

在站点、商家、VPS 三层保存独立 `collection_enabled`，默认 false。`enabled` 只表示公开展示，不复用为采集开关。

未来执行许可为：全局允许采集，且商家和 VPS 均存在、未删除、已启用、各自允许采集。可提供只读的 `CollectionAllowed` 查询方法，供维护者后续接入；该方法不得发起抓取或写库存。

开关关闭不清空历史库存，不删除套餐，不伪造无货；重新开启也不会立即产生库存。UI 必须依据能力标记说明“配置已保存，采集功能待接入”。保留现有 StockObservation/ApplyObservation/StockConsumer 等入口即可，不擅自实现库存消费、确认或重试流程。

## 六、邮箱与初始化闭环

邮件必须通过真实 SMTP 发送，验证码不得回传到 API、日志或前端。需要配置邮件服务的启用状态、连接地址、认证、TLS 和超时。

验证码使用安全随机数，保存哈希，具备有效期、发送冷却、错误次数上限和一次性消费。建议沿用 6 位数字、10 分钟有效、60 秒冷却、最多 5 次错误尝试。首次绑定和换绑区分处理，换绑验证当前密码，成功前保留旧邮箱。

找回密码不得通过响应泄露邮箱是否存在。未知邮箱、未验证邮箱、冷却中的请求返回中性提示；统一配置不可用可返回邮件不可用。投递失败的行为必须明确记录，不能把“申请已受理”表述成“已成功收到邮件”。改密、换绑和找回流程应避免旧验证码在并发操作后仍可使用。

提供真实首个管理员初始化流程：命令创建普通候选账号 → 登录个人中心完成真实邮箱验证 → 命令提升管理员 → 重新登录后台。密码通过环境变量等适当方式输入，不创建默认密码或演示账号。公开注册关闭时也必须能够完成此初始化。

## 七、交付与验收要求

- router 下每个业务路径都有对应实现与关联依赖，只有明确约定的采集/库存写入保留。
- 新数据库完成迁移和首个管理员初始化后，可以直接通过后台录入商家和套餐。
- 公开页面能够读取这些真实记录；隐藏、删除、筛选、分页和权限限制行为一致。
- 用户资料、邮箱、密码、权限和冻结流程形成闭环；过期、撤销、验证码复用、非法参数和数据库冲突有明确错误。
- false、0、null 能按字段语义正确保存；不能因 GORM 忽略零值导致开关关不掉。
- 三级采集开关可保存并查询，但不启动采集、不更新库存、不消费或确认库存消息。
- 保持前端运行时不使用 mock，不通过 seed 填演示数据。
- 后端实施者完成适当的构建与业务验证，并如实报告已验证内容、跳过项和依赖限制；不要把本需求文档当作已完成证明。
- 实施完成后同步 OpenAPI、配置示例、启动说明和前端接口契约。文档与返回字段、错误码、校验规则必须一致。
