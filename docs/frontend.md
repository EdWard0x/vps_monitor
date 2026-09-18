# VPS Monitor 前端技术文档

核对日期：2026-09-19。本文描述已实现页面和通信行为，接口见 [api.md](api.md)，已知缺口见 [known-issues.md](known-issues.md)。

## 1. 技术栈与入口

React 18 + TypeScript + Vite 5，React Router 6，Tailwind CSS 3；图标为 lucide-react，类名工具为 clsx/tailwind-merge。项目没有 Redux、Zustand 或 React Query，业务数据主要通过 Context、useState/useEffect/useCallback 管理。

`main.tsx` 引入全局 CSS，清理本项目历史 mock Service Worker，然后在 StrictMode 中挂载 App。运行入口没有调用 enableMocking，不会因为配置 `VITE_MOCK_API=true` 就自动切换 mock。`src/mocks`、MSW 依赖和 public/mockServiceWorker.js 仍保留，属于显式预览/测试工具。

Provider 嵌套为 ErrorBoundary → SettingsProvider → AuthProvider → ToastProvider。ErrorBoundary 处理 React 渲染异常，HTTP 错误由请求层和页面处理。

```text
src/app/          Provider、认证/设置 Context、路由与守卫
src/api/          以业务模块组织的 HTTP 函数
src/types/        与后端对应的 TypeScript DTO
src/lib/http/     fetch、AT、刷新协调、CSRF、AppError
src/lib/format/   金额、规格、时间、邮箱格式化
src/pages/        public/auth/account/admin 页面
src/features/     VPS、商家、用户、账户、认证业务组件
src/components/   UI 基础件、布局、库存/过期提示
src/mocks/        显式模拟工具，不在默认运行链路中
src/test/         Vitest 测试
```

`@` 映射 src。构建脚本是 `tsc --noEmit && vite build`，产物 dist。开发端口 5173，`/api` 代理至 `http://127.0.0.1:8080`。

## 2. 页面、路由与接口

| 浏览器路径 | 页面 | 主要 API/行为 |
| --- | --- | --- |
| `/` | HomePage | `/vps/list`、`/merchant/list`，URL 筛选/分页 |
| `/merchants` | MerchantsPage | 公开商家列表 |
| `/merchants/:id` | MerchantDetailPage | 商家详情及关联 VPS |
| `/vps/:id` | VpsDetailPage | 首次详情，后续 `/stock/info` 轮询 |
| `/login` | LoginPage | 登录、内部 returnTo 跳转 |
| `/register` | RegisterPage | 注册，受公开设置提示和后端开关限制 |
| `/reset-password` | PasswordResetPage | 申请/确认找回验证码 |
| `/forgot-password` | 跳转 | 重定向 `/reset-password` |
| `/account` | AccountPage | 资料、改密、邮箱绑定/换绑 |
| `/admin` | AdminDashboardPage | 管理看板 |
| `/admin/merchants` | AdminMerchantsPage | 商家增删改查、两类开关 |
| `/admin/vps` | AdminVpsPage | 套餐增删改查、筛选 |
| `/admin/vps/:id` | AdminVpsDetailPage | 完整套餐编辑、采集条件说明 |
| `/admin/users` | AdminUsersPage | 用户、角色、密码重置、冻结/解冻 |
| `/admin/settings` | AdminSettingsPage | 站点、注册、采集设置 |
| `/403`、其他未匹配路径 | ErrorPages | 无权限 / 404 |

公开和账户页使用 AppLayout，管理页使用 AdminLayout。后台页面 lazy import + Suspense，公开页面静态导入。Router 使用浏览器 history；无 document 的测试环境使用 memory router。生产 Nginx `try_files ... /index.html` 支持直接访问深层路径。

### 守卫

- AuthGuard：loading 时等待；anonymous 转 `/login?returnTo=...`；unavailable 展示错误。
- AdminGuard：在认证基础上要求 admin；邮箱未验证或 mail_required 时提示前往个人中心。
- GuestGuard：已登录时跳首页，用于登录/注册/找回页。

守卫只控制界面，真正权限仍由后端鉴权。前端账户快照不会主动订阅服务器角色变化，后续请求错误或资料刷新才同步。

## 3. HTTP 层

`lib/http/client.ts` 的 apiRequest/apiClient 是统一入口，业务 API 模块负责 URL、query 和 body。默认 `VITE_API_BASE_URL || '/api/v1'`，带 credentials=include；AT 有值时加入 Authorization。

默认请求超时 15 秒，AbortController 控制 fetch；网络失败转 AppError(status=0)，abort 转 408。成功要求 HTTP 2xx、JSON 可解析、code=0，返回完整 Envelope，而不是直接 data。

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

IDs 不转 Number；价格保留字符串，formatPrice 直接拼接币种/金额/周期，不经过浮点计算。时间按日期工具转换为用户本地显示。列表默认 20、服务端最大 100，空 items=[]。

### 自动恢复与错误

| 条件 | 当前请求层动作 |
| --- | --- |
| 401 + 200003 ACCESS_EXPIRED | 合并并发 refresh，成功后仅重试原请求一次 |
| 200005 USER_FROZEN | 清 AT，广播本页冻结事件 |
| 200017 TOKEN_REVOKED / 200009 INVALID_TOKEN | 清 AT，通知凭据失效 |
| 其他 401 | 清 AT，通知未登录 |
| 403 + 100004 CSRF_REJECTED | 清内存 CSRF；当前失败请求不自动重放 |
| 501 | 映射未实现状态；页面通常显示专门提示 |
| 其他错误 | AppError 包含 status/code/message/requestId/errors |

AppError 的字段错误扩展目前与后端类型存在差异，且后端未实际填充该数组，见已知问题。

## 4. 登录状态与多标签

AT 是 `token.ts` 模块内变量，不写 localStorage/sessionStorage；RT 是浏览器自动携带的 HttpOnly Cookie。CSRF 也缓存于内存，从 GET 响应取值，不能读 Cookie。

启动：loading → ensureCsrfToken → requestTokenRefresh → 成功则 `/me/info` → authenticated，否则通常 anonymous。AuthStatus 定义 loading/anonymous/authenticated/unavailable；但当前 refresh 辅助方法将所有失败压为 null，因此不是所有 501/503 都能进入 unavailable。

登录归一化用户名，保存返回 AT 与 user。注册成功不自动登录。登出尝试 API 后总会清本地状态；网络失败被忽略，浏览器 RT 可能仍在，后续刷新页面可能恢复身份。

刷新在同标签用共享 Promise 合并，在支持 Web Locks 的浏览器跨标签串行执行；BroadcastChannel `vps_auth_channel` 同步 AT/LOGOUT。当前锁内仍直接执行刷新，没有复用其他标签新 AT 的判断；收到广播也只更新 token 模块，未同步 React user/status。

**自定义 API 地址注意：** 普通 apiRequest 使用 VITE_API_BASE_URL，但 AuthContext 初始化调用 ensureCsrfToken/requestTokenRefresh 未传此地址，使用默认 `/api/v1`。当前最可靠的配置是同源 `/api/v1`，直连其他域名需要先统一这些调用。

## 5. 公开页面数据流

HomePage 从 URLSearchParams 读取 q、merchant_id、status、currency、billing_period、sort、page，固定 page_size=20；筛选变更重置第一页，路由变化重新请求。没有列表定时轮询，也没有通用请求缓存。商家筛选目前只取前 100 条，失败被忽略。

初次加载、无数据、请求错误、未实现是独立界面状态。API 失败不回退到 mock 套餐。SettingsContext 是例外：设置失败保留默认站点名和 registration_enabled=true，并另存 error；不能将这当作服务端注册已开启。

## 6. 库存展示与轮询

类型见 `types/stock.ts`，服务器返回三态，stale 是独立维度：

| 数据 | 展示原则 |
| --- | --- |
| status=1，quantity 非空 | 有货及剩余数量 |
| status=1，quantity=null | 有货，不编造数量 |
| status=2 | 暂时无货 |
| status=3，有检查时间 | 库存未知 |
| 没有检查时间 | 尚未获得采集结果 |
| is_stale=true | 保留状态，额外显示数据可能已过期 |
| 请求失败 | 错误状态，不等于库存未知 |

StockBadge、StaleAlert、VpsDetailCard/VpsCard 负责复用展示。公开 DTO 不含 collection_enabled、delivery_id、consumer 等管理/消息字段。

VpsDetailPage 初始 GET `/vps/info?id=...`，使用内嵌 stock；取得 VPS 后每 30 秒 GET `/stock/info?vps_id=...`。隐藏时跳过，重新可见立即刷新；isFetching 防重叠，cleanup 置 cancelled、清定时器和事件监听，忽略迟到的轮询结果。失败保留上次库存，显示非阻塞提示。

该取消保护目前仅覆盖轮询；首次详情请求没有取消/过期响应保护，ID 快速切换仍可能发生竞态。后台详情当前使用 adminGetVPS 里的库存，不走公开 stock 轮询，以免公开隐藏资源返回 404。

## 7. 管理页面与表单

### 商家和套餐

MerchantFormDialog 分开提交 enabled 和 collection_enabled，编辑不能改商家 code。商家删除冲突应以服务端返回为准。

VpsFormDialog/AdminVpsDetailPage 编辑完整 VPSEditable；明细页可改商家和套餐 code。管理商家选项按每页 100 循环读取，以涵盖停用项。空 transfer/port 转 null，0 保留；IP 开关关闭把数量置 0。若为空或过小，部分数值输入在提交前用 Math.max/default 归一化，不能假定所有非法输入都以错误提示拒绝。

前端 disk_type 类型/选项为 ssd/nvme/hdd/unknown，后端接受任意合法短字符串；外部客户端录入其他类型时需要注意兼容。

### 设置和采集许可

设置 GET 返回嵌套结构，PUT 发送平铺可选字段 site_name/registration_enabled/collection_enabled，不回传 collector_implemented。

能力标记 true 仅说明代码提供采集实现。实际需要 Worker 开启、支持该商家、三级开关及 enabled 满足、解析服务可达。界面只能说明“允许采集”，没有证据显示“Worker 在线”或“正在执行”。

后台详情会读取管理设置和当前商家，计算条件文案。但当前这些请求失败后缺少完整未知态，且文案依据未提交表单值；因此条件说明可能比实际已保存配置更乐观，详见已知问题。上级开关关闭不自动修改下级开关值。

### 账户与用户

AccountPage 组合 ProfileSection、PasswordChangeSection、MailBindingSection。验证码冷却由响应 retry_after 驱动；绑定/换绑区分 current_password。找回页面分申请 reset_id 与确认两步，202 文案保持中性。

AdminUsersPage 组合筛选、表格、资料/角色/重置密码/冻结对话框。冻结返回 cache_synced=false 时需提示缓存尚未同步，不能将解冻与重置密码合并。新增、编辑后重新读取服务端数据，不以静态文件保存真实业务输入。

## 8. 开发、测试与维护

```powershell
cd frontend
npm ci
npm run dev
npm run typecheck
npm test
npm run build
```

npm ci 依据 package-lock.json 安装；VITE_* 在构建时注入，修改运行容器环境不重写已生成静态 JS。不要将服务端密钥写入 VITE_*。

新增字段需要同时核对后端 response/request、OpenAPI、types、api、表单和展示。复用 lib/http，页面不另写认证刷新。需要覆盖异步竞态时采用实际生命周期测试，不仅做静态渲染断言。

本次 6 个测试文件、40 个测试通过，TypeScript 与 Vite 生产构建通过；静态渲染测试含 React useLayoutEffect 警告。现有测试不等价于真实浏览器登录、Cookie、邮箱或 Worker 联调验收。
