# 09 React 前端与移动端设计

## 1. 技术选型

使用 React + TypeScript、Vite、React Router、Tailwind CSS。HTTP 客户端封装原生 fetch；服务端状态由独立 query hooks/cache 层统一管理，后续可采用 TanStack Query，业务组件不直接依赖其底层缓存 API。组件样式采用 Tailwind，表单、Dialog、菜单等建立共用 UI 层，避免各页面重复实现行为。

React 负责组件和状态组织；Vite 用于开发/构建；React Router 负责路由；Tailwind 使用移动端优先的响应式规则。具体版本在项目初始化时选择相互兼容的稳定版，提交 package-lock，不在部署时无约束追随 latest。参考 [React](https://react.dev/learn)、[Vite](https://vite.dev/guide/)、[React Router](https://reactrouter.com/start/declarative/routing)、[Tailwind 响应式文档](https://tailwindcss.com/docs/responsive-design)。

## 2. 路由与页面

| 路由 | 权限 | 页面内容 |
| --- | --- | --- |
| / | 公开 | 库存列表、商家/状态/关键词筛选、分页 |
| /merchants | 公开 | 商家列表、商家简介、官网 |
| /merchants/:id | 公开 | 商家信息与该商家的 VPS |
| /vps/:id | 公开 | 规格、价格、库存、检查时间、购买链接、评论树 |
| /login | 游客 | 用户名密码登录，完成后回到站内 returnTo |
| /register | 游客且注册开启 | 注册表单；注册成功引导登录 |
| /account | 登录 | 昵称、密码、当前会话与其他会话 |
| /account/comments | 登录 | 本人普通/匿名评论及审核状态、删除操作 |
| /admin/* | 管理员 | 见 [后台设计](10-admin.md) |
| /403、通配 404 | 全部 | 无权限或不存在 |

returnTo 只允许本站相对路径，拒绝 `//host` 和绝对 URL，避免开放跳转。前端路由守卫用于交互，后端鉴权才是实际权限边界。

## 3. 组件与工程目录

```text
frontend/src/
  app/            # router、providers、错误边界
  pages/          # public、auth、account、admin 路由入口
  features/
    auth/ merchants/ vps/ comments/ admin/
  components/ui/  # Button、Input、Select、Dialog、Drawer、Pagination
  components/    # Header、StockBadge、Price、EmptyState、ErrorState
  lib/http/       # fetch、包络解析、错误、刷新协调、取消请求
  lib/query/      # query key、缓存、失效、轮询 hook
  lib/format/     # 时间、金额、流量和带宽展示
  types/api/      # 外部 DTO、枚举，不复用数据库对象
  mocks/          # 仅开发构建加载的 MSW handler 与样例
  styles/         # Tailwind 入口、设计变量
```

枚举保持数字语义，映射显示文案集中在 StockBadge 和 VisibilityLabel。ID 在全链路保持 string，金额只做定点字符串展示，禁止将金额转换为浮点参与业务判断。

## 4. 前台信息组织

首页桌面可以表格/卡片结合，主要列为商家、套餐、CPU/内存/磁盘、流量/网口、金额与周期、库存、检查时间。首期只提供 API 支持的商家、状态、关键词、币种、周期筛选，不增加没有数据库支持的地区筛选。

手机展示单列卡片：顶部商家与名称，中间两列规格，底部价格、库存和详情按钮。筛选项折叠到抽屉，当前条件用可删除标签表示；筛选写入 URL，刷新或分享后可恢复。

库存文案同时考虑 status、quantity、is_stale、monitor_enabled：

| 数据 | 展示 |
| --- | --- |
| status=1，quantity=5，数据新鲜 | 有货 · 5 台 |
| status=1，quantity=null | 有货 · 数量未知 |
| status=2，quantity=0 | 缺货 |
| status=3 | 无法识别 |
| last_checked_at=null | 尚未检查 |
| is_stale=true | 数据已过期 + 上次观测状态和绝对时间 |
| monitor_enabled=false | 监控已暂停 + 历史观测 |

不能用 `quantity || 0` 或 truthy 判断把 null 显示成缺货；transfer_gb=0 展示不限量，null 展示未知。价格展示 `USD 9.90 / 月` 等明确币种周期，不伪造商家折扣。

详情页评论正文与监控信息分开更新，库存每 30 秒轮询一次，页面隐藏时暂停、恢复可见时重新取数；浏览器轮询不调用管理员人工检查接口。

## 5. 评论交互

CommentList → CommentNode → ReplyList 按 parent_id 递归组成，但只请求展开的层级。根评论倒序、回复正序，每层提供“加载更多”。桌面每层缩进 16px；手机最多两级视觉缩进，再用“回复某条评论”与边线表达更深关系，数据库深度仍保持真实值。

编辑器包含纯文本框、字数计数、匿名复选框、提交按钮。未登录显示登录入口；匿名关闭时隐藏新建匿名选项；如果服务端在提交时返回 400002，保留草稿并提示用户明确取消匿名再提交，不能自动改为实名。站点评论关闭只禁用新编辑器，旧评论仍显示。

提交成功以服务端返回为准，待审核显示“已提交，审核后公开”，归入本人评论，不乐观插入公共列表。删除成功重新加载相关 parent/root 的计数与占位状态。本人管理入口来自 `/me/comments`，不能通过在公共 DTO 中夹带真实 user_id 判断匿名作者。

文本、昵称、描述均按文本渲染，URL 只接受 http/https。新窗口购买/官网链接加 `rel="noopener noreferrer"`；演示模式始终显示“模拟数据”，明确示例链接未验证。

## 6. 请求、错误与登录恢复

apiClient 统一设置 Base URL、Authorization、请求取消、超时和 JSON 包络解析；读取响应前判断内容类型。字段 errors 映射表单，普通业务失败局部提示；只对不可恢复的全页数据失败使用错误页。

启动顺序：GET settings → GET auth/csrf → 若可能有登录 Cookie，尝试 refresh → GET me；刷新返回 401 进入游客状态。AuthProvider 在恢复完成前保持 loading，避免刷新管理页面时短暂显示错误权限页。

只有 401/200003 可触发一次受控 Refresh，并重放被认证中间件拒绝的原请求；其他 401 清内存认证信息并引导登录。刷新接口自身不拦截递归刷新。写请求网络失败不自动重试。跨标签刷新协调与严格重放处理见 [06](06-auth.md)。退出时清除所有本人/管理缓存并广播退出；降级角色后不得保留可浏览的后台缓存。

`GET` 网络瞬时错误最多重试 2 次，指数等待带抖动；429 按 Retry-After，403/404/422 不自动重试。缺少数据、加载中、接口失败、无筛选结果、服务不可用分别显示对应状态。

## 7. 响应式和可访问性

按 360、390、768、1280px 宽度验收。移动端单列，md 后增加列数，后台侧栏改抽屉；长 URL/code/正文允许换行，页面主体不出现整体横向溢出。大表格可在自身容器横向滚动或转换卡片，操作按钮始终可触达。

按钮/触控目标建议至少 44px；状态除了颜色还带文字；输入有 label，错误用 aria-describedby 关联；Dialog 有标题、焦点限制和关闭后的焦点恢复；键盘能完成登录、筛选、回复和审核。提交后用 aria-live 反馈结果。支持系统减少动效，不为库存轮询强制跳动页面。

## 8. 先让前端有内容

[公开响应样例](examples/public-api.json) 按 HTTP 响应结构提供 settings、merchant、VPS、库存和评论列表，无密码、会话或后台作者字段。可用 MSW 在开发环境拦截同一 API 路径，组件保持真实请求代码；MSW 的用途参考 [官方文档](https://mswjs.io/docs/)。

这些文件是数据样例，尚未包含 MSW handler 或可运行页面；联调时替换 Mock handler 为真实后端，无需修改组件。测试加载、空列表、401、403、429、503 和评论待审核场景应由 handler 显式模拟。生产构建必须禁用 MOCK_API，演示站是否标记 demo_mode 则由后端决定。
