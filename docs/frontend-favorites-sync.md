# VPS 收藏功能：前端接入与实现交接

核对日期：2026-09-20。依据：当前工作区的收藏后端实现，包含尚未提交的改动。本文件描述实际接口和待实现的前端需求，不代表已完成前后端联调。

可直接交给另一个模型的实施提示词见 [frontend-favorites-prompt.md](frontend-favorites-prompt.md)。

## 1. 交付目标与范围

为现有 React 前端接入用户 VPS 收藏功能：

1. 登录用户在公开 VPS 卡片右上角看到收藏星星：未收藏为空心，已收藏为填色实心。
2. 点击星星调用后端收藏或取消接口；同一产品请求未完成时禁用相关按钮。
3. 未登录用户不展示收藏星星，不查询个人收藏；认证状态尚未确认时也不发收藏请求。
4. 个人中心增加“我的收藏”入口和页面，可查看自己的收藏产品、取消收藏、按商家筛选、按价格排序、分页。
5. 复用现有产品卡片、筛选器、价格格式化、认证、HTTP 客户端和提示组件。
6. 首页、商家详情页、VPS 详情页与个人收藏页的收藏状态保持一致。

这里的“个人后台”指普通用户的个人中心，不是 `/admin` 管理后台。收藏不要求管理员角色，也没有额外的邮箱验证门槛；登录与冻结检查沿用现有鉴权。

本次实施范围为前端和必要的前端 mock、测试。后端接口已经实现，不另起网站、不更换框架、不重构无关模块。

## 2. 已核对的后端与验证边界

### 实现入口

- `backend/router/router.go`：`/api/v1/me` 挂载登录鉴权。
- `backend/router/user.go`：三个收藏路由。
- `backend/api/favor.go`：查询参数绑定、从鉴权上下文获取用户 ID、响应封装。
- `backend/service/favor.go`：收藏、取消、收藏列表。
- `backend/service/vps.go`：列表复用 `query(..., false)` 和 `present`。
- `backend/model/request/vps.go`：筛选、排序、分页参数。
- `backend/model/response/response.go`、`types.go`：统一响应与公开 VPS 数据。

### 实际行为

- 每个用户一个 Redis Set，保存规范化后的 VPS ID；浏览器只访问 HTTP API。
- 添加前检查 ID 格式以及产品、商家是否公开可见。
- 重复收藏现有可见产品成功，重复取消也成功。添加请求若产品已不可见仍可能返回 404，不能把这个错误当作成功。
- 取消只校验 ID 格式，不要求产品仍存在。
- 列表批量查询数据库，复用商家、币种、周期、库存、搜索、排序规则，然后分页。
- 不合法的历史成员会跳过；已删除或不可见的产品不会展示，不导致整份列表失败。
- 收藏列表的 `total` 是应用可见性和筛选条件后的数量，不是 Redis 成员数。
- 不返回收藏时间，不支持“最近收藏”排序；`updated_desc` 是产品更新时间降序。
- 下架产品的 Redis 关系仍可能保留；恢复可见后再次出现在收藏列表里。

### 此次实际验证

| 检查 | 结果 |
| --- | --- |
| `go build ./...`（backend） | 通过，包括 API、Worker 和 CLI 的生产代码 |
| `go test ./service ./api ./router ./middle ./model/errcode` | 通过；api/router 没有测试文件 |
| `go test ./... -run '^$'` | 未通过：测试包仍有下列编译问题 |
| 收藏真实 HTTP + PostgreSQL + Redis 联调 | 本轮未执行，不能声称已经端到端验收 |

尚未处理的测试问题：

1. `backend/test/runtime_test.go:173` 调用 `BuildServices` 缺少新增的 Redis 客户端参数。
2. `backend/test/skeleton_test.go:169` 的 `fakeMessages` 不满足当前 `Acknowledger` 接口；这是此前已有的问题。

本次按维护者决定以 runtime 配置为接入目标，不把 skeleton 的 nil 依赖分支作为此次前端实施前置任务。上述测试问题不意味着生产代码无法编译，也不能因此宣称全部测试通过。现有单元测试尚不足以覆盖全部收藏场景。

## 3. HTTP 接口契约

基础地址是 `/api/v1`；复用前端 `apiClient` 时只写 `/me/...`，不要重复拼基础地址。

三个接口都需要 `Authorization: Bearer <access_token>`。复用现有 `apiClient` 注入 Token 和处理刷新，不自己实现第二套认证逻辑。不能从前端传入或切换 `user_id`。

### 3.1 添加收藏

```http
POST /api/v1/me/addFavor?vpsId=100
Authorization: Bearer <access_token>
```

- 参数是 URL query 中的 **`vpsId`**，大小写必须一致。
- 不是 `vpsid`、`vps_id` 或 `id`。
- 不要只把 ID 放到 JSON body；当前后端用 `c.Query("vpsId")` 读取。
- `apiClient.post` 发送空 JSON body 不影响处理，ID 仍必须在 URL 上。

成功响应（HTTP 200）：

```json
{
  "code": 0,
  "message": "ok",
  "data": "success",
  "request_id": "example-request-id"
}
```

### 3.2 取消收藏

```http
DELETE /api/v1/me/delFavor?vpsId=100
Authorization: Bearer <access_token>
```

成功响应同添加收藏，为 HTTP 200 和 `data: "success"`，不是 204，不返回产品对象。

### 3.3 收藏产品列表

```http
GET /api/v1/me/listFavors?page=1&page_size=20&merchant_id=1&currency=USD&billing_period=monthly&sort=price_asc
Authorization: Bearer <access_token>
```

| 参数 | 含义及范围 |
| --- | --- |
| `page` | 从 1 开始；缺失或小于 1 时归一为 1 |
| `page_size` | 默认 20；小于 1 时使用默认值；最大 100 |
| `q` | 产品名称、编码、描述的关键词搜索，不是硬件规格的专门搜索 |
| `merchant_id` | 商家数字 ID 的字符串，不是商家编码 |
| `currency` | 币种，例如 USD、EUR、CNY；后端规范化为大写 |
| `billing_period` | `monthly`、`quarterly`、`yearly`、`one_time` |
| `status` | `1` 有货、`2` 无货、`3` 未知 |
| `sort` | `updated_desc`（默认）、`price_asc`、`price_desc` |

不需要 `vpsId`。没有价格上下限参数，没有“按收藏时间排序”，不支持用户自建分类或分组。当前“按商家分类”通过 `merchant_id` 筛选实现，“按价格查看”通过排序实现。

价格按原始金额数值排序，不自动汇率换算，也不把年付折算为月付。保留现有 `VpsFilter` 的币种和周期选择及价格比较提示。

空结果的完整响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "items": [],
    "total": 0,
    "page": 1,
    "page_size": 20
  },
  "request_id": "example-request-id"
}
```

非空结果中的 `items` 是 **现有公开 `VPS[]`**，复用 `frontend/src/types/vps.ts` 的 `VPS`，整体复用 `Envelope<PageData<VPS>>`。

关键字段：

- 产品 ID 是 `item.id`，类型为字符串，不是 `item.vps_id`。
- 商家是嵌套对象 `item.merchant`，包括 `id/code/name/website_url`。
- 价格是字符串 `price_amount`，另有 `currency`、`billing_period`。
- 库存沿用 `item.stock`，其中 `stock.vps_id` 是库存对象自己的字段，不要与产品 ID 字段混淆。
- 包含现有产品规格、购买链接、创建时间和更新时间。
- 不包含 `is_favorited`、`favorite_at` 或管理字段。
- `backend/model/dto/favor.go` 中旧的精简 DTO 不再是本接口的实际响应，不要按它生成 TypeScript 类型。

### 3.4 错误处理与错误码差异

沿用 `apiClient`、`AppError`、`getErrorMessage` 和当前认证事件。接口失败时展示服务端 `message`；网络错误显示通用网络提示。不要将错误、加载中状态解释为“没有收藏”。

常见结果：

| 情况 | HTTP / 业务码 |
| --- | --- |
| ID 缺失或格式不合法、筛选条件非法 | 400 / 100001 |
| 添加的产品不存在或不可见 | 404 / 100005 |
| 未登录、Token 问题 | 沿用现有 401 及认证错误码 |
| 用户被冻结 | 403 / 200005 |
| 数据库错误 | 当前后端 500 / 500001 |
| Redis 等未映射依赖错误 | 503 / 900004 |

当前前端 `DATABASE_ERROR` 仍是 400001，后端改为 500001。维护者暂不要求修改前端错误码全集。现有 HTTP 层按非成功响应抛错，并优先使用服务端 message，因此普通错误展示仍能工作；但按旧 `DATABASE_ERROR` 数值单独分支会失配。收藏功能不要依赖该旧值处理数据库错误，也不要把“不认识的业务码”当成功。

后端仍定义 500002/500003/500004 等 Redis 错误常量，但当前收藏实现不会因重复添加、重复取消或空列表返回它们。不要在前端为这些正常场景设计报错流程。

当前收藏路由使用 Bearer 鉴权，没有额外挂载 CSRF 中间件；保持现有 HTTP 客户端策略，不为收藏另造登录或 CSRF 流程。

## 4. 首屏收藏状态：必须处理分页

**现有后端没有批量状态接口、单产品收藏状态接口或全部 ID 接口。公开 `/vps/list` 和 `/vps/info` 也没有 `is_favorited` 字段。** 不要调用尚不存在的 `/favorites/status` 等路径。

本期仅用已有接口的可行方案：在用户认证成功后，共享状态层分页加载该用户的全部可见收藏，建立 `Set<string>`。

```text
认证成功，固定当前 user.id 和本轮加载标识
    ↓
GET /me/listFavors?page=1&page_size=100&sort=updated_desc
    ↓
按响应 total 和 page_size 继续读取后续页
    ↓
合并所有 item.id，去重
    ↓
确认用户和加载标识仍有效，再发布完整 ID Set
```

实施要求：

1. 不要只取第一页。`page_size=10000` 也不能绕过后端最大 100 的限制。
2. 用于全局标星的请求不能携带个人收藏页的商家、关键词、币种等筛选；筛选后的局部列表不能覆盖全局 ID Set。
3. 首页筛选、翻页、切换商家页面时复用共享状态，不让每个卡片分别加载全部收藏。
4. 初次全部加载完成前，将未确认状态视为 unknown；可展示禁用的占位星星或加载状态，不要先展示可操作的“未收藏”。
5. 部分页失败时，不能把已取得的部分数据当完整结果；展示可重试错误。首次失败时不允许依靠不完整状态反向切换收藏。
6. 使用响应里的实际分页值；对异常空页或不一致响应做有限退出，不允许无限请求。对未完成加载不能宣称状态完整。
7. 退出登录、账号切换时立即清空旧用户状态；旧请求迟到不能重新写回。AbortController 可用于取消，同时要用用户 ID / 请求代次校验拒绝旧结果。
8. 刷新收藏快照与收藏写请求可能重叠。用请求代次、变更版本或操作覆盖层，避免先发出的旧列表响应覆盖后完成的收藏操作。
9. 跨设备并发和产品更新可能使分页期间的数据变化；当前接口没有一致性快照。采取尽力同步，重新进入页面或恢复窗口焦点时可刷新并去重，不承诺严格跨设备实时一致。
10. 个人收藏页面上的产品都已被确认收藏，可显示实心星星；全局列表仍应按上述规则判定未知项。

这个方案会读取完整产品列表，适合当前阶段；收藏量很大时再考虑后端增加批量状态接口。本次前端任务不以新增接口为前提，也不能用 localStorage 代替服务端收藏数据。

## 5. 前端结构与建议修改位置

当前是 React 18 + TypeScript + React Router 6 + Tailwind CSS，图标使用 lucide-react，没有现成的收藏状态管理，也没有 TanStack Query 依赖。优先沿用 Context/hooks，不必引入新的全局数据框架。

| 位置 | 修改目的 |
| --- | --- |
| 新增 `frontend/src/api/favor.ts` | 封装三个接口，沿用 `apiClient` |
| `frontend/src/api/index.ts` | 按项目习惯导出收藏 API |
| 新增 `frontend/src/app/FavoritesContext.tsx` 或同等共享 hook/store | 按用户管理收藏 ID、加载状态、错误和正在提交的产品 |
| `frontend/src/app/providers.tsx` | 在 AuthProvider 内放置收藏状态层；若使用 toast，确保也在 ToastProvider 内 |
| 新增 `frontend/src/features/vps/FavoriteButton.tsx` | 统一星星按钮、无障碍文本和等待状态 |
| `frontend/src/features/vps/VpsCard.tsx` | 卡片右上角加入星星，避免遮挡库存徽标 |
| `frontend/src/features/vps/VpsDetailCard.tsx` 或 `pages/public/VpsDetailPage.tsx` | 详情页提供同一收藏操作 |
| `frontend/src/pages/public/HomePage.tsx`、`MerchantDetailPage.tsx` | 验证复用卡片后的状态正确，不逐卡发请求 |
| 新增 `frontend/src/pages/account/FavoritesPage.tsx` | 我的收藏，筛选、排序、分页和取消操作 |
| `frontend/src/pages/account/AccountPage.tsx` | 增加“我的收藏”入口 |
| `frontend/src/app/router.tsx` | 增加建议路径 `/account/favorites`，使用 AuthGuard，不使用 AdminGuard |
| `frontend/src/mocks/handlers/account.ts` 或新增 handler | 开发 mock 对齐真实接口，并在 handlers/index.ts 注册 |
| `frontend/src/test/` | 补充收藏关键行为和契约测试 |

`frontend/src/features/vps/VpsTable.tsx` 是管理员表格，使用 AdminVPS；个人收藏列表优先复用公开 VpsCard，不强行复用管理表格。

API 方法签名建议：

```ts
addFavor(vpsId: string): Promise<Envelope<string>>
delFavor(vpsId: string): Promise<Envelope<string>>
listFavors(query?: VPSQuery): Promise<Envelope<PageData<VPS>>>
```

写接口的核心调用为：

```ts
apiClient.post<string>(`/me/addFavor?vpsId=${encodeURIComponent(vpsId)}`)
apiClient.delete<string>(`/me/delFavor?vpsId=${encodeURIComponent(vpsId)}`)
```

`listFavors` 的 query 编码方式复用 `frontend/src/api/vps.ts`，不要用数字转换 ID。`ID` 类型保持 string。

## 6. 交互与状态规则

### 登录状态

读取 `useAuth()` 的 status 和 user：

- `authenticated` 且 user 存在：加载当前用户收藏，允许确认状态后的操作。
- `anonymous`：隐藏星星，不发个人收藏请求。
- `loading`：等待认证恢复，不使用旧账号状态。
- `unavailable`：不假装已登录，保持现有认证不可用体验。

管理员在公开页面也可以收藏；不要把收藏限定给 role=user。个人中心路由沿用 AuthGuard 的登录跳转和 returnTo 行为。

### 星星按钮

- 使用独立 `button type="button"`，不嵌在跳转链接中；点击不触发产品详情跳转或购买链接。
- 空心 / 实心状态使用现有主题颜色；移动端保留足够触摸区域，不挤占标题和库存信息。
- 设置 `aria-label`（收藏 / 取消收藏）、已确认状态下的 `aria-pressed`、可见键盘焦点；等待时 disabled，并给出适当的忙碌提示。
- 推荐等待服务端成功再更新状态。若采用乐观更新，失败必须恢复，并处理旧请求结果。
- 对同一用户、同一 VPS 建立共享的 in-flight 防重入；仅在单个按钮上设 disabled 不足以协调页面里同一产品的多个入口。
- 快速双击不能同时发出相反操作；不同 VPS 可以独立操作。
- 请求失败保留已知状态，展示 message，可重试；网络超时意味着结果可能未知，应提供重新同步，不能把它当已确定失败或成功。
- 成功后同步 ID Set 和相关页面数据，不能依赖一次整页刷新才生效。

### 我的收藏

- 建议独立页面 `/account/favorites`，个人中心有明显入口。
- 复用 `VpsFilter`、`VpsCard`、`Pagination`、`LoadingSpinner`、`ErrorState` 和 `EmptyState`。
- 筛选、排序、页码可同步 URL；筛选或排序变化时回到第 1 页。
- 服务端筛选、排序、分页；不要对已分页结果再本地筛选，也不要用本地排序冒充全量价格排序。
- 区分“还没有收藏”和“当前筛选没有结果”；无法判断时用中性的“没有符合条件的收藏”，不要误导用户。
- 取消成功后刷新当前列表与 total；若当前页超出新的最后一页，退回有效页重新加载，保留筛选条件。
- 页面查询加请求代次保护，防止快速切换筛选时旧结果覆盖新结果。
- 取消失败不要移除卡片；加载失败不要显示空收藏页。
- 默认按产品更新时间排序，不展示虚构的收藏时间。
- 详情页原有库存轮询要保留，库存刷新不能重置收藏状态。

## 7. Mock 与验证要求

MSW 中按用户 ID 维护收藏集合，不同账号不能共享。真实模式只使用后端数据；mock 只用于开发和测试。

mock 应对齐：POST/DELETE 的 query 参数 `vpsId`、重复写成功、空数组分页结构、商家筛选、价格排序和分页。不能只改 UI、不补当前 mock 模式的收藏路由。参考现有 auth mock 的 `getCurrentMockUser` / `setCurrentMockUser` 和项目测试 URL 规则。

至少覆盖以下有意义的行为：

1. 匿名和认证恢复期间不发收藏查询，匿名看不到可操作的星星。
2. 已有收藏标为实心，未收藏为空心；失败或未完成加载不伪装成未收藏。
3. 101 个以上收藏时，第一页之外的产品也能正确标星；不得只取第一页。
4. 添加与取消的 HTTP 方法、query 参数和响应类型正确；成功同步 UI，重复操作仍成功。
5. 同一产品快速连点只有一个在途操作；失败、超时和迟到响应不破坏状态。
6. 用户 A 退出后登录用户 B，A 的缓存和迟到响应不会污染 B。
7. 收藏页按商家、币种、周期、库存筛选和价格排序，total 与分页正确；清空筛选恢复完整收藏范围。
8. 取消最后一页的最后一项能回到有效页；取消失败保留原卡片。
9. 收藏页筛选后的列表不会把其他页面的收藏状态清空；旧刷新结果不会覆盖更新的写操作。
10. 400、404、401、500/500001、503 和网络失败正常展示；未知错误码不会被当作成功。
11. 商家页、首页、详情页及个人中心操作相互同步；库存轮询保持原功能。
12. 键盘可操作，星星不会误触链接；桌面和移动端布局无重叠。

在 frontend 目录运行：

```sh
npm run typecheck
npm test
npm run build
```

还需实际页面验证，不把 mock 通过等同于真实后端联调通过。记录哪些检查已执行、哪些因环境受限未执行，以及与本功能无关的既有失败。

## 8. 实施约束与交付说明

- 当前 `docs/openapi.yaml` 和旧 API 文档尚未收录收藏接口；收藏契约以本文件及核对的后端源码为准，不误判为功能不存在。
- 本文件中建议新增的前端文件是待实现项，不是已经存在的文件。
- 不因前端任务擅自重写 Redis 存储、修改鉴权、补造后端接口或接入订阅通知。
- 不要求此次同步错误码全集；保留对任意非零业务错误码的处理，并优先展示服务端 message。
- 交付时列出实际修改文件、实现范围、测试结果和未完成事项；明确全局标星当前通过分页列表实现及其限制。

