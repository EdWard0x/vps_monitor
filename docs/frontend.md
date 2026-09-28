# VPS Monitor 前端技术文档

按 2026-09-28 仓库源码重建。本文集中维护前端架构、运行方式、业务约束和验证边界；后端与迁移见 [后端技术文档](backend.md)。

## 1. 开发与构建

React 18、TypeScript 5、Vite 5、React Router 6、Tailwind CSS 3；图标使用 lucide-react，测试使用 Vitest。具体安装版本由 `frontend/package-lock.json` 锁定。

在仓库根目录执行：

```bash
cd frontend
npm ci
npm run dev
```

开发地址为 `http://localhost:5173`，Vite 把 `/api` 代理至 `http://127.0.0.1:8080`。启动真实后端后使用，无演示账号、Mock 数据服务或 MSW。环境变量模板为 `frontend/.env.example`。

```bash
npm run typecheck
npm test
npm run build
npm run preview
```

`build` 先运行 TypeScript 检查，再输出 `dist/`。`preview` 仅用于检查构建产物，不替代生产 Nginx；其 API 转发需要单独配置。

`VITE_API_BASE_URL` 是构建期配置，普通 HTTP 客户端默认 `/api/v1`。当前 AuthContext 初始化调用 CSRF/refresh 时仍使用默认路径，所以推荐同源 `/api/v1` 部署；修改普通客户端变量并不能保证跨域认证全链路同步切换。

## 2. 目录与启动顺序

| 位置 | 职责 |
| --- | --- |
| `src/main.tsx` | 先提取并清理 Server 酱回跳 URL，再动态加载 bootstrap |
| `src/bootstrap.tsx`、`App.tsx` | 样式、React StrictMode、应用挂载 |
| `src/app/` | 路由、守卫、认证、设置、收藏 Context、错误边界 |
| `src/pages/` | public、auth、account、admin 页面 |
| `src/features/` | 业务表单、表格、卡片、收藏按钮 |
| `src/components/` | 布局与 UI 基础组件 |
| `src/api/`、`src/types/` | HTTP 方法和 TypeScript 契约 |
| `src/lib/` | HTTP、格式化、微信绑定与通知操作 |
| `src/test/` | 单元、静态组件渲染、请求契约测试 |

`@/` 指向 `src/`。业务模块直接从文件导入。Provider 顺序为 ErrorBoundary → SettingsProvider → AuthProvider → ToastProvider → FavoritesProvider。新增用户状态应注意账号切换清理及旧响应失效。

## 3. 页面与权限

| 路径 | 功能 / 访问要求 |
| --- | --- |
| `/`、`/merchants`、`/merchants/:id`、`/vps/:id` | 公开目录、商家和产品详情 |
| `/login`、`/register`、`/reset-password` | 游客认证页；`/forgot-password` 重定向至找回密码 |
| `/account` | 登录后的资料、密码、邮箱设置 |
| `/account/favorites` | 我的收藏、服务端筛选、排序、分页 |
| `/account/notifications` | 所有收藏的微信通知设置 |
| `/account/notifications/guide` | Server 酱 Key 图文绑定说明，登录后访问 |
| `/account/notifications/serverchan/callback` | 特殊回跳页，自行等待认证恢复，不经过普通 AuthGuard |
| `/admin` | 管理看板 |
| `/admin/merchants`、`/admin/vps`、`/admin/vps/:id` | 商家与 VPS 管理 |
| `/admin/users`、`/admin/settings` | 用户管理与站点设置 |
| `/403`、其他未知路径 | 无权限、404 |

前台共用 AppLayout，后台共用 AdminLayout。后台页面 lazy import + Suspense。AuthGuard 处理认证恢复及登录跳转；AdminGuard 检查管理员与邮箱条件。实际授权由后端完成，前端路由守卫不能代替后端鉴权。

## 4. HTTP 与认证

`lib/http/client.ts` 统一处理请求：携带 Cookie、注入内存 Access Token、默认 15 秒超时、解析响应信封、认证失败事件与刷新重试。业务成功要求 HTTP 成功且 `code === 0`。错误使用 AppError，保留 HTTP 状态、业务码、request_id 和字段错误。

响应通常为 `{ code, message, data, request_id }`；分页 data 为 `{ items, total, page, page_size }`。ID 按字符串传递，金额也是字符串，不要先把 ID 转成 JavaScript number。库存数量 null 与 0 含义不同。

Access Token 仅在内存；Refresh Token 由后端 HttpOnly Cookie 保存。启动先获取 CSRF，再刷新 Token，随后读取 `/me/info`。登录、注册、刷新、退出、找回密码写请求由客户端附加 CSRF 头。后端业务 `/me` 接口依赖 Bearer 鉴权，不要自行假设所有写接口都要求同一种 CSRF 处理。

新增接口依次更新 `types`、`api`、调用页面与本文相关接口说明。优先显示服务端错误消息；目前前端 `DATABASE_ERROR` 常量仍为 400001，而后端数据库错误为 500001，尚未统一，不应据旧数值判断业务成功。

## 5. 收藏与库存

收藏写接口：`POST /me/addFavor?vpsId=...`、`DELETE /me/delFavor?vpsId=...`；列表是 `GET /me/listFavors`，返回公开 VPS 分页对象。参数名是 query 中的 `vpsId`。写成功 data 为字符串 `success`。

FavoritesProvider 在认证成功后分页读取未筛选收藏，每页 100 条，建立共享 ID Set；当前循环最多读取 100 页。用用户 ID、请求代次和变更覆盖信息处理迟到响应；同一 VPS 的在途写请求共享。未登录隐藏星星；首次状态尚未确定时显示等待状态，读取失败可重试。账号切换会清理旧收藏。

个人收藏页的筛选数据与全局标星集合分开管理。支持关键词、商家、币种、周期、库存、价格/更新时间排序；价格按原金额比较，不换汇、不折算周期。跨设备变更、分页过程中产品变更及超过当前分页上限仍需进一步验证，不能承诺严格一致的全量快照。

| 库存 status | 含义 |
| --- | --- |
| 1 | 有货，通常有数量；兼容数量为空的旧数据 |
| 2 | 无货 |
| 3 | 未知或尚无结果 |
| 4 | 已确认有货，数量未知 |

有货筛选 `status=1` 包括 1、4。`quantity=null` 不能显示成 0。无库存记录、超过 15 分钟未更新会被后端标为过期；`last_checked_at` 是最近写入观测的时间。

首页与收藏页每 30 秒刷新当前列表，公开产品详情每 30 秒查询库存；隐藏时暂停、恢复可见时刷新，后台请求失败保留已有内容并提示。商家详情目前没有同等列表轮询。公开产品详情的首次读取仍需关注快速切换 ID 的迟到响应边界。

`enabled` 控制公开可见性；全局、商家、VPS 的 `collection_enabled` 是三层采集许可。`collector_implemented=true` 仅表示有代码实现，不代表 Worker 在线或目标商家受支持。

## 6. 微信通知与敏感回跳

通知设置接口：

| 请求 | 用途 |
| --- | --- |
| `GET /me/notice` | 返回 `key_bound`、`notice_enabled` |
| `PUT /me/notice/server-key` | JSON `{ send_key }` 保存 Key，不回传完整 Key |
| `POST /me/addNotice` | 开启全部收藏通知，无 VPS 参数 |
| `DELETE /me/delNotice` | 关闭全部收藏通知，无 VPS 参数 |

保存 Key 与开启通知分开操作。写入成功后再 GET 确认状态；开启失败仅业务码 500005 触发未绑定引导，不根据中文错误消息匹配。关闭保留 Key、收藏和发送历史，已经开始发送的请求可能继续完成。

绑定说明页是 React 页面 `src/pages/account/ServerChanGuidePage.tsx`，入口在微信通知设置页。四张操作截图位于 `public/images/serverchan/`，依次展示本站入口、微信扫码登录、生成 AppKey 和返回本站。图片通过 Vite 的 `public` 目录随前端静态资源一起部署，无需新增接口。截图中的二维码和 localhost 地址仅作示例；更新截图前要遮住真实 Key、账号等敏感信息。

`serverchanBinding.ts` 构造外跳链接：Key 占位符位于内层 callback URL。绑定意图只在 sessionStorage 保存 state、userId、创建时间；有效期 15 分钟。回跳 Key 只留内存，通过鉴权 JSON 请求保存。

必须保留 `main.tsx` 的早期 URL 清理顺序，不能把 Key 放进登录 returnTo、localStorage 或 sessionStorage。回跳页处理 state/账号不匹配、重复参数、过期和重试。重复 effect 共享在途保存 Promise，避免重复绑定。

`index.html` 设置 Referrer 策略，Nginx 有回跳路径保护。外层反向代理也应禁止记录该路径的查询参数；SPA 内部重定向和实际访问日志需在部署环境检查。前端测试不代表第三方扫码或微信真实送达已经验收。

## 7. 生产与验证边界

本次重构版对应全新数据库基线 `001_baseline`，不承接旧 main 的数据结构。后续涉及表结构与接口的功能，应先验证后端增量迁移保留已有数据，再发布匹配前端；前端不执行建表或数据迁移。具体步骤见 [后端文档](backend.md)。

前端 Dockerfile 使用 Node 构建，再由 Nginx 提供静态资源、SPA 深链接及 `/api/` 代理；入口编排是根目录 `docker-compose.vps.yaml`。Vite 环境变量在镜像构建时写入，运行容器时修改变量不会重写已有 JS。

应用已移除浏览器 Mock 与 MSW 依赖。曾在旧开发版本注册过 Service Worker 的浏览器，升级时可在开发者工具 Application → Service Workers 中注销对应旧注册并刷新；这属于浏览器本地状态清理。

本次清理验证：TypeScript 检查、8 个测试文件共 53 项测试、生产构建通过。测试保留格式化、HTTP 错误、请求参数、通知回跳及组件展示等检查；网络用例仅在测试内部替换 fetch，不提供模拟业务后端。静态渲染存在 React Router 的 useLayoutEffect 警告，不等于测试失败。尚未在本次工作中进行真实浏览器全流程、SMTP、扫码和微信送达验收。
