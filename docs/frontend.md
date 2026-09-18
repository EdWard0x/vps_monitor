# VPS Monitor 前端开发需求文档

> 库存采集 Worker 已接入后的前端同步要求，请优先参阅 [frontend-collection-sync.md](./frontend-collection-sync.md)。本文中“采集尚未实现”“未来采集”等旧描述不再作为该功能的实现依据。

本文可直接交给前端开发模型执行，是开发需求，不是完成报告。目标是基于后端现有 router 接口完成真实可用的前端。后端实施范围见 `backend.md`；前后端联调时以更新后的实际接口与 OpenAPI 为准，发现缺口应明确列出，不能用 mock 隐藏问题。

## 一、核心要求

1. **不使用 mock、MSW 拦截、随机数据、硬编码演示用户/商家/套餐/库存，也不在 API 失败时回退到假数据。**
2. 初始商家和 VPS 可以为空，由管理员登录后台手动添加真实信息。
3. 管理员能够编辑、停用、删除商家和套餐，并保存是否允许采集的配置。
4. VPS 是否有货的采集和库存更新由维护者自行实现，前端目前只展示查询结果和保存采集配置。
5. 采集开关已保存不等于已开始采集。能力标记为未实现时，必须明确展示“采集功能待接入”。
6. 沿用仓库已有 React/TypeScript/Vite 项目及组件、样式、路由、API 分层，不另建一套前端架构。

可以使用纯展示性的加载占位骨架，但不能把它当成实际业务记录；空数据、网络错误、权限不足必须是不同状态。

## 二、改造方式

- 先检查 `frontend/src/api`、`types`、`lib/http`、`app`、`pages`、`features` 中已有实现，复用可用部分。
- 清理运行入口中的 mock 启动逻辑，确保 `VITE_MOCK_API=false`；检查生产构建和开发启动均不会注册 mock Service Worker。
- 对以前已注册的 mock Service Worker，只清理属于本项目 mock 的注册，不能注销所有其他 Service Worker。
- API 适配统一放 `src/api`；请求、认证刷新、CSRF、错误处理统一复用 HTTP 层，页面不各自实现一套。
- 不把真实用户输入和业务数据写进静态文件。新增/编辑后刷新相关查询，以后端返回为准。
- 新字段需同时更新 TypeScript 类型、表单、API 输入和展示。旧类型中没有的采集字段不能仅画一个无法保存的开关。

## 三、通信与认证

API 基础地址 `/api/v1`，本地使用 Vite `/api` 代理，生产优先同源部署。所有请求携带 `credentials: include`。

```ts
type ID = string;
type Timestamp = string;
interface Envelope<T> {
  code: number;
  message: string;
  data: T;
  request_id: string;
}
interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}
```

字段 snake_case；ID 不转为 Number；时间按用户时区格式化；价格保留字符串精度。列表默认 page=1、page_size=20，最大 100。筛选变动回到第一页。

成功 HTTP 状态通常为 200，找回验证码申请为 202，且业务 code=0。删除成功返回统一包络且 data=null，不能按“必须 204”处理。

### 登录状态流程

- AT 只存内存，通过 `Authorization: Bearer ...` 携带；禁止把 AT/RT 放 localStorage 或 sessionStorage。
- RT 是 HttpOnly Cookie，前端不能读取、手动解析或作为请求体发送。
- 启动时先取得 CSRF，再尝试一次 refresh；成功后请求 `/me/info` 恢复账户信息。身份恢复期间显示加载状态，避免闪现后台。
- `GET /auth/csrf` 返回 `data.token`。需要 CSRF 的 POST 请求使用 `X-CSRF-Token`，不能通过 document.cookie 读取 HttpOnly CSRF Cookie。
- `/auth/register/login/refresh/logout/password-reset/*` 的写请求都携带 CSRF。
- 普通业务请求遇到 AT 过期可以刷新并重试一次；并发失败共享一次刷新，不能每个请求单独刷新形成风暴。
- refresh 失败后清理内存登录态，不循环刷新。登录失败不能触发 refresh。
- 退出登录请求成功后清理用户和 AT；个人改密、密码找回成功后提示重新登录。
- 管理员邮箱未验证时引导到个人中心，不能因缺少邮箱验证将用户困在后台重定向循环中。

## 四、页面清单

### 公开页面

| 页面 | 内容与操作 | 接口 |
| --- | --- | --- |
| 首页/套餐列表 | 搜索、商家/币种/周期/库存筛选、排序、分页、套餐卡片或表格 | GET `/vps/list`、GET `/merchant/list` |
| 套餐详情 | 配置、价格、购买地址、商家、库存状态与检查时间 | GET `/vps/info?id=`、按需 GET `/stock/info?vps_id=` |
| 商家列表 | 搜索、分页、商家网站入口 | GET `/merchant/list` |
| 商家详情 | 商家信息及其套餐列表 | GET `/merchant/info?id=`、GET `/vps/list?merchant_id=` |

无记录时展示“暂无套餐/商家”，不要放演示卡片。详情 404 显示不存在或不可访问。购买链接仅接受 HTTP/HTTPS，并在新窗口打开时设置合适的 rel 属性。描述作为普通文本显示，不直接注入未经处理的 HTML。

VPS 筛选：`q,merchant_id,currency,billing_period,status,sort,page,page_size`。排序枚举：`updated_desc,price_asc,price_desc`。计费周期：`monthly,quarterly,yearly,one_time`。货币不自行转换；需要比较价格时提示先选同一币种和周期。

### 注册、登录与找回密码

- 注册页提交 `{username,nickname,password}`，依据公开设置 `registration_enabled` 控制入口和表单。注册关闭时展示明确说明，后端拒绝也要正常处理。
- 登录页提交 `{username,password}`，成功后根据用户权限和目标路径跳转。不要预填演示账号或密码。
- 密码输入规则与后端一致。若沿用当前 bcrypt 工具的 8–72 字节限制，前端可用 `new TextEncoder().encode(value).length` 校验，不能只按 JavaScript 字符串长度判断；输入不得自动 trim。
- 用户名按后端规则校验：当前约定为 3–64 位 ASCII 字母/数字/下划线，首位字母或数字，保存为小写。昵称去首尾空白后 1–64 字符。
- 找回密码分为申请验证码、输入验证码和新密码两步。申请返回 202 是中性受理结果，不能断言邮箱存在或已收到邮件。
- 保留后端返回的 reset_id；按 retry_after 倒计时禁用重复申请，按 expires_in 展示有效时间。验证码作为字符串保存，保留前导零。
- 重置成功后跳登录页，不伪造已登录状态。

### 个人中心

展示用户名、昵称、角色、已绑定邮箱和验证状态。用户名和角色不能通过个人资料编辑改变。

支持三部分：

1. 修改昵称：PUT `/me/update`。
2. 修改密码：PUT `/me/password`，提交当前密码和新密码，成功后重新登录。
3. 邮箱绑定/换绑：POST `/me/mail/code`，随后 POST `/me/mail/verify`；首次绑定与已绑定换绑分开，换绑提供当前密码输入。

换绑完成前保留原邮箱显示，不能在“验证码发送成功”后就更新为新邮箱。验证成功根据返回 AccountUser 更新页面。验证码过期、错误、冷却、重试次数耗尽、邮件服务不可用分别按后端错误展示。

### 管理员仪表盘

使用 GET `/admin/dashboard/info` 展示用户数、冻结用户数、商家数、VPS 数、有货数、未知库存数。数字必须来自接口；空库显示 0。无趋势接口时不要画虚构走势图。

增加“添加商家”“添加 VPS”“站点设置”入口，方便从空数据开始使用。

### 管理员商家管理

列表展示名称、code、网站、是否公开、是否允许采集、创建/更新时间，支持 q、enabled 和分页。

新增表单：`code,name,website_url,enabled,collection_enabled`。编辑表单：`id,name,website_url,enabled,collection_enabled`，code 只读。

- “公开展示”和“允许采集”使用两个清晰、独立的控件。
- 编辑时读取管理详情，不能拿公开 DTO 当完整表单。
- 停用不删除商家，提示其下套餐会从公开页面隐藏。
- 删除采用确认对话框；若后端提示仍有 VPS 引用，保留记录并说明先处理关联套餐。
- 保存时明确提交 false，不能用真值判断漏掉关停操作。

### 管理员 VPS 管理

列表展示套餐、商家、主要规格、价格/周期、库存、公开状态、采集许可，支持公开 VPS 的筛选和管理员 enabled 筛选。

新增/编辑表单应覆盖所有可编辑字段，不能只支持名称和价格：

| 分组 | 字段 | 输入行为 |
| --- | --- | --- |
| 基础 | merchant_id,code,name,description | 商家选项来自管理接口；无商家时引导先添加 |
| 配置 | cpu_cores,memory_mb,disk_gb,disk_type | 整数校验，单位明确；磁盘类型字符串 |
| 网络 | transfer_gb,port_mbps | 显式区分未知 null、不限量 0、指定数值 |
| IP | has_ipv4,ipv4_count,has_ipv6,ipv6_count | 数量非负；关闭对应 IP 时数量置 0 |
| 价格 | price_amount,currency,billing_period | 价格以字符串提交；币种三位大写；周期固定枚举 |
| 购买 | purchase_url | 独立 HTTP/HTTPS 链接，不由商家网站推导 |
| 控制 | enabled,collection_enabled | 独立控制公开和采集，明确保存 false |

更新提交完整可编辑字段及 id；不得发送 merchant、stock、created_at、updated_at 等输出字段，也不能直接 spread 整个响应 DTO。

列表和详情中的库存为只读：**不提供手动设置有货、修改库存数量、模拟采集成功、立即更新库存等按钮。** 管理员目前只录入套餐信息并保存采集许可。

商家选项应处理分页，可使用搜索或逐页加载；不能固定只拿第一页导致后续商家无法选择。删除最后一条记录后正确调整分页并重新读取列表。

### 管理员用户管理

支持分页、q、role、frozen 筛选，展示用户名、昵称、角色、冻结状态和时间，不要求后端额外暴露用户邮箱。

操作：修改昵称、调整角色、重置密码、冻结、解冻。

- 提升管理员可能要求目标已验证邮箱，后端拒绝时明确说明。
- 冻结和角色变更等操作应先确认，再提交；不得乐观显示已成功。
- 后端保护最后一个可用管理员，前端展示冲突原因，不绕过限制。
- 冻结/解冻响应 `cache_synced=false` 时说明数据库操作已完成但缓存同步未完成，允许重试，不把它显示为完全同步成功。
- 当前用户被降权、冻结或令牌撤销时及时清理/更新页面权限，不反复发起后台请求。

### 管理员站点设置

读取 GET `/admin/settings/info`，编辑站点名称、开放注册、全局采集许可，通过 PUT `/admin/settings/update` 保存。设置是部分更新，不要把只读能力字段 collector_implemented 发回后端。

采集区分以下概念：

- **全局采集开关**：顶层 collection_enabled。
- **商家采集许可**：AdminMerchant.collection_enabled。
- **VPS 采集许可**：AdminVPS.collection_enabled。
- **实际能力是否接入**：AdminSettings.collector_implemented，只读。

未来执行需要全局、商家、VPS 都允许，且商家和 VPS 已启用、未删除。上级关闭时保留下级配置，说明“当前受上级开关影响”，不要擅自清空下级开关。

当 collector_implemented=false 时，控件仍可保存配置，旁边说明“采集配置可保存，实际采集功能待接入”。禁止展示“正在采集”、进度条、下一次采集倒计时或任务成功通知。

## 五、完整接口清单

下列路径均省略 `/api/v1`；POST/PUT 使用 JSON，详情和删除使用 query。

| 权限 | 方法与路径 | 输入 | data |
| --- | --- | --- | --- |
| 公开 | GET `/auth/csrf` | 无 | `{token}` |
| 公开 | POST `/auth/register` | `{username,nickname,password}` | PublicUser |
| 公开 | POST `/auth/login` | `{username,password}` | LoginResult |
| Cookie | POST `/auth/refresh` | RT Cookie | TokenResult |
| Cookie | POST `/auth/logout` | 无 | null |
| 公开 | POST `/auth/password-reset/code` | `{mail}` | `{reset_id,expires_in,retry_after,message}` |
| 公开 | POST `/auth/password-reset/confirm` | `{reset_id,code,new_password}` | null |
| 登录 | GET `/me/info` | 无 | AccountUser |
| 登录 | PUT `/me/update` | `{nickname}` | AccountUser |
| 登录 | PUT `/me/password` | `{current_password,new_password}` | null |
| 登录 | POST `/me/mail/code` | `{mail,current_password?}` | `{verification_id,expires_in,retry_after}` |
| 登录 | POST `/me/mail/verify` | `{verification_id,code}` | AccountUser |
| 公开 | GET `/merchant/list`、GET `/merchant/info` | 分页/q 或 id | Page<Merchant> / Merchant |
| 公开 | GET `/vps/list`、GET `/vps/info` | 分页/筛选 或 id | Page<VPS> / VPS |
| 公开 | GET `/stock/info` | vps_id | Stock |
| 公开 | GET `/settings/info` | 无 | PublicSettings |
| 管理员 | GET `/admin/user/list`、GET `/admin/user/info` | 分页/q/role/frozen 或 id | Page<AdminUser> / AdminUser |
| 管理员 | PUT `/admin/user/update` | `{id,nickname}` | AdminUser |
| 管理员 | PUT `/admin/user/role` | `{id,role}` | AdminUser |
| 管理员 | POST `/admin/user/resetPassword` | `{user_id,new_password}` | null |
| 管理员 | POST `/admin/froze/freeze`、POST `/admin/froze/unfreeze` | `{user_id}` | `{user_id,frozen,cache_synced}` |
| 管理员 | GET `/admin/merchant/list`、GET `/admin/merchant/info` | 分页/q/enabled 或 id | Page<AdminMerchant> / AdminMerchant |
| 管理员 | POST `/admin/merchant/create`、PUT `/admin/merchant/update` | 商家创建体 / 编辑体 | AdminMerchant |
| 管理员 | DELETE `/admin/merchant/delete` | id | null |
| 管理员 | GET `/admin/vps/list`、GET `/admin/vps/info` | 分页/筛选/enabled 或 id | Page<AdminVPS> / AdminVPS |
| 管理员 | POST `/admin/vps/create`、PUT `/admin/vps/update` | VPS 创建体 / 编辑体 | AdminVPS |
| 管理员 | DELETE `/admin/vps/delete` | id | null |
| 管理员 | GET `/admin/settings/info`、PUT `/admin/settings/update` | 无 / `{site_name?,registration_enabled?,collection_enabled?}` | AdminSettings |
| 管理员 | GET `/admin/dashboard/info` | 无 | DashboardSummary |

## 六、响应类型

```ts
interface PublicUser {
  id: ID; username: string; nickname: string;
  role: 'user' | 'admin'; created_at: Timestamp; updated_at: Timestamp;
}
interface AccountUser extends PublicUser {
  mail: string | null; mail_verified: boolean;
  mail_verified_at: Timestamp | null; mail_required: boolean;
}
interface AdminUser extends PublicUser { frozen: boolean; }
interface TokenResult {
  access_token: string; token_type: 'Bearer'; expires_in: number;
}
interface LoginResult extends TokenResult { user: AccountUser; }
interface Merchant {
  id: ID; code: string; name: string; website_url: string;
}
interface AdminMerchant extends Merchant {
  enabled: boolean; collection_enabled: boolean;
  created_at: Timestamp; updated_at: Timestamp;
}
interface Stock {
  vps_id: ID; status: 1 | 2 | 3; quantity: number | null;
  last_checked_at: Timestamp | null;
  last_in_stock_at: Timestamp | null; is_stale: boolean;
}
interface VPS {
  id: ID; merchant: Merchant; code: string; name: string; description: string;
  cpu_cores: number; memory_mb: number; disk_gb: number; disk_type: string;
  transfer_gb: number | null; port_mbps: number | null;
  has_ipv4: boolean; ipv4_count: number; has_ipv6: boolean; ipv6_count: number;
  price_amount: string; currency: string;
  billing_period: 'monthly' | 'quarterly' | 'yearly' | 'one_time';
  purchase_url: string; stock: Stock;
  created_at: Timestamp; updated_at: Timestamp;
}
interface AdminVPS extends VPS {
  merchant_id: ID; enabled: boolean; collection_enabled: boolean;
}
interface PublicSettings { site_name: string; registration_enabled: boolean; }
interface AdminSettings {
  settings: PublicSettings; collection_enabled: boolean;
  collector_implemented: boolean; updated_at: Timestamp;
}
interface DashboardSummary {
  user_count: number; frozen_user_count: number; merchant_count: number;
  vps_count: number; in_stock_count: number; unknown_stock_count: number;
}
```

上面的内容仅是类型契约，不是可用于页面填充的数据。前端不要增加默认商品数组、固定 ID 或虚构时间。

## 七、库存展示规则

| 后端数据 | 页面表现 |
| --- | --- |
| status=1 | 有货 |
| status=2 | 无货 |
| status=3 | 未知 |
| quantity=null | 数量未知，不显示成 0 |
| last_checked_at=null | 尚未检查 |
| last_in_stock_at=null | 暂无有货记录 |
| is_stale=true | 单独提示库存信息可能过期，不改写有货/无货状态 |
| 库存接口失败 | 展示读取失败和重试，不生成默认有货/无货 |

没有库存行时返回未知状态是正常业务。初次录入的 VPS 应可以公开展示配置与购买链接，同时库存显示未知。

## 八、错误与交互

错误应根据业务 code 处理，不要把全部 401 都当作 AT 过期、全部 403 都当作未登录。

- 100001 参数错误：保留表单，显示提示。
- 100003 限流：依据 Retry-After 或返回的 retry_after 提示稍后操作。
- 100004 CSRF/来源校验失败：必要时重新获取一次 CSRF，不启动 AT 刷新循环。
- 100005 资源不存在：详情错误页或列表更新。
- 100006 资源冲突：解释重复 code、关联删除限制或管理员保护，不伪装保存成功。
- 200001 登录失败：停留登录页。
- 200003 AT 过期：刷新一次并重试。
- 200005 冻结：清理登录态，提示被冻结。
- 200006 权限不足：展示无权限。
- 200009/200017 无效或撤销令牌：重新登录。
- 200011 管理员需验证邮箱：引导个人中心。
- 200012/200015 邮箱冲突或未改变：表单内提示。
- 200013/200016 验证或找回 challenge 无效：提示重新输入或重新申请。
- 200014 邮件服务不可用：说明未能完成发信，禁止显示验证码或假成功。
- 200018 注册关闭：停止提交并更新注册入口。
- 300001/300002/300003：用户名校验、用户名重复或当前密码错误，保留对应表单。
- 400001/900004：数据库或依赖异常，展示可重试错误，保留必要输入。
- 900005 未实现：如实提示，不能使用 mock 补齐。

错误页面保留 request_id 方便定位。表单提交期间禁用重复操作；网络失败不清空用户输入；删除、冻结、角色调整等操作按实际结果更新界面。

## 九、真实数据验收流程

1. 对接已启动并迁移的后端；初始商家、VPS 列表为空时界面正常。
2. 后端通过命令创建普通候选账号，使用前端登录并完成真实邮箱验证，再由后端命令提升管理员，重新登录后台。
3. 在后台新增真实商家，新增关联 VPS，公开页面能查到相同信息。
4. 编辑规格、价格和 nullable 字段，刷新页面后仍为保存值；false 开关能够关掉。
5. 停用商家或 VPS 后公开页面隐藏，管理员仍能查看。
6. 分别保存全局、商家和 VPS 采集许可，刷新后状态保持；采集未实现时明确展示待接入，没有假任务或假库存。
7. 用户资料、邮箱换绑、改密、忘记密码、角色调整、冻结/解冻均调用真实后端；没有账号和验证码的模拟捷径。
8. 删除关联商家时正确显示冲突；先删除套餐再删除商家后列表更新。
9. 断网、后端停机、无权限、令牌撤销、验证码失效、库存未知分别展示正确状态。
10. 开发与生产入口均不启用 mock，接口失败不会回退演示数据。交付时报告真实联调结果及未完成项，不把本需求文档当作已完成证明。
