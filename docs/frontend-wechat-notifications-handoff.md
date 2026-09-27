# 微信库存通知：前端实施与后端接口交接

核对日期：2026-09-27。依据：当前工作区代码与 Server 酱官方说明。

本文供其他模型直接读取并实施。2026-09-27 已补齐状态查询、Key 保存和全局关闭后端接口；前端页面、回跳和真实扫码联调仍待实施。本文自定义的回跳路径和 state 属于项目设计，并非官方固定参数。

## 1. 已确定的范围

- 面向已登录的注册用户，通过用户自己的 Server 酱 AppKey/SendKey 发送微信通知。
- 用户开启后，对其收藏的全部 VPS 生效。用户已明确：取消通知是关闭全部微信通知，不是取消某一个 VPS 的通知。
- 收藏关系、通知总开关、Server 酱 Key、发送历史是四种不同数据，不应互相代替。
- 关闭通知只关闭总开关，保留收藏、Key、发送次数及发送时间。重新开启不重置历史。
- 当前消费者按 `(user_id, vps_id)` 限制累计成功发送最多三次，两次成功发送至少间隔十二小时；目前没有每次补货自动重置次数的逻辑。
- 本次不扩展逐 VPS 通知开关、短信、其他微信渠道、通知历史页面或数据库迁移。
- 已接受：业务跳过也可以保留 Pending，按投递次数达到上限后 ACK；生产时检查库存，消费时不强制重新查询库存；读取失败可以停止对应协程。不在此次前端工作中重新改写这些策略。

## 2. 当前代码与接口现状

| 能力 | 当前事实 |
| --- | --- |
| 开启全部通知 | `POST /api/v1/me/addNotice` 已注册；检查 Key 后将 `users.notice_enabled` 设为 `true` |
| 关闭通知 | `DELETE /api/v1/me/delNotice` 已实现，直接关闭总开关，不需要 `vpsId` |
| 检查 Key | `NoticeService.CheckServerKey(ctx, uid)` 是后端内部方法，没有独立 HTTP 路由；读取数据库中的 Key，不验证 Server 酱是否接受它 |
| 保存 Key | `PUT /api/v1/me/notice/server-key` 已实现，接收 JSON `send_key` |
| 查询通知设置 | `GET /api/v1/me/notice` 已实现；`/me/info` 不增加通知字段 |
| 未绑定错误 | `ServerTurboNoRecord`：业务码 `500005`，当前 HTTP 状态为 500，消息为“未查询到ServerTurbo_key值” |
| 用户字段 | `users.notice_enabled`、`users.server_turbo_key`；当前 Key 字段声明 `size:64` |
| 通知记录 | `Notice` 存储用户/VPS、成功发送次数和时间；不是订阅开关表 |

前端不能直接调用 `a.Service.CheckServerKey`。应通过 HTTP 查询状态或处理开启接口返回的业务错误。

**不要通过中文 message 包含某个字符串来分支。** 在现有 `BusinessCode` 中增加 `SERVER_TURBO_NO_RECORD: 500005`，使用 `isAppError(error) && error.code === 500005`。即使 HTTP 为 500，当前 HTTP 客户端也会将业务码放到 `AppError.code` 中。其余网络/数据库错误不应被误认为“没有绑定”。

## 3. 前端展示方案

增加已登录用户页面 `/account/notifications`，名称为“微信通知”。在 `/account` 个人中心增加同风格入口，在 `/account/favorites` 增加“微信通知设置”入口。使用现有 React、Tailwind、Button、Input、LoadingSpinner、Toast 等组件，不创建新的设计系统。

页面主要内容：

```text
微信通知
收藏的 VPS 有货时，通过 Server 酱发送到你的微信。

Server 酱绑定       未绑定 / 已绑定
[前往 Server 酱绑定] 或 [更换 Key]
[手动填写 Key]（次要入口）

全部收藏的库存通知    [关闭 / 开启]
每个套餐每轮最多通知 3 次，两次通知需间隔一段时间。距最后一次成功通知达到重置间隔后，下次通知重新计数；具体间隔由站点配置。
关闭后保留绑定和通知记录，重新开启不会立即重置次数。
```

| 状态 | 展示与行为 |
| --- | --- |
| 正在读取设置 | 显示加载状态，禁用操作，不默认显示为未绑定 |
| 未绑定 | 展示“前往 Server 酱绑定”与手动填写入口；点击开启时引导先绑定 |
| 已绑定、未开启 | 展示“已绑定”、更换入口与“开启微信通知” |
| 已绑定、已开启 | 展示已开启状态与“关闭微信通知” |
| 操作进行中 | 禁用重复提交，显示正在保存/开启/关闭 |
| 设置查询失败 | 显示真实错误和重试入口，不显示假状态 |
| 后端接口缺失 | 显示“通知设置接口尚未就绪”，不能用本地状态伪造绑定或关闭成功 |

Key 输入框默认隐藏内容，允许用户临时显示；不得把后端已保存的完整 Key 回填到页面。保存成功只显示“已绑定”，不声称“微信送达验证成功”。

绑定与开启分为两步：绑定成功返回设置页，提示“绑定成功，可开启微信通知”；随后由用户点击开启。更换 Key 不隐式切换通知总开关。取消外部流程不会修改本地设置。

无需额外开发抓取二维码、代理扫码或轮询 Server 酱登录结果。用户在 Server 酱自己的页面完成操作。本期不增加自动测试推送，避免绑定行为产生额外通知。

## 4. 正确构造 Server 酱回跳链接

官方说明要求：把 `{key}` 放入**应用回跳 URL 内部**，再将整个回跳 URL 编码后作为外层 `url` 参数。来源：[Server 酱 AppKey 快速创建流程](https://ft07.com/serverchan-appkey/)。这是浏览器返回应用页面，不是 Server 酱对本项目后端发出的 webhook。

用户此前提供的形式：

```text
.../forward?name=vps-monitor&url=https%3A%2F%2Fmonitor.hiding.top&ref=26797&key={key}
```

其中最外层的 `key` 不是回跳 URL 的参数，不能按本文预期把 Key 带回本项目。

本项目建议回跳路由：

```text
/account/notifications/serverchan/callback
```

内层回跳模板：

```text
https://你的实际前端域名/account/notifications/serverchan/callback?key={key}&state=本次随机值
```

`monitor.hiding.top` 只是用户提供的示例域名；另一次消息中的 `monitor.hidng.top` 拼写不同，不能将两者混用。实现使用当前受信任前端部署的 `window.location.origin`，不要硬编码示例域名，也不要把回跳地址指向网站首页或管理员 `/admin` 页面。

示例代码（已有登录用户点击按钮时执行）：

```ts
const callbackPath = '/account/notifications/serverchan/callback';
const state = crypto.randomUUID();

// 仅保存非密钥的流程信息；TTL 由本项目约定为 15 分钟。
sessionStorage.setItem('serverchan.bind.intent', JSON.stringify({
  state,
  userId: user.id,
  createdAt: Date.now(),
}));

// 先保留字面量 {key}，不要提前把它单独编码成 %7Bkey%7D。
const callback = `${window.location.origin}${callbackPath}`
  + `?key={key}&state=${encodeURIComponent(state)}`;

const target = new URL('https://sct.ftqq.com/appkey/create/forward');
target.searchParams.set('name', 'vps-monitor');
target.searchParams.set('url', callback); // URLSearchParams 完成外层编码。
target.searchParams.set('ref', '26797'); // 沿用用户现有推荐参数。
window.location.assign(target.toString()); // 同一标签页跳转。
```

必须验证：`new URL(target).searchParams.get('url')` 恰好等于包含字面量 `{key}` 的 callback 模板。不要先对 callback 调用 `encodeURIComponent` 再交给 `searchParams.set`，否则双重编码。

`state` 是本项目放进回跳地址的流程关联值，不是 Server 酱承诺提供的 OAuth 验证协议；上线时需确认其他查询参数随完整回跳 URL 保留。浏览器参数本身不证明 Key 所属的微信身份。

## 5. 回跳页面的处理顺序

1. 在路由守卫跳转、埋点或其他请求读取当前 URL 之前，读取 `key` 与 `state` 到内存，并立即用 `history.replaceState` 移除这些查询参数。`URLSearchParams.get` 已解码，不要重复 `decodeURIComponent`。
2. 只在固定回跳路径处理这些参数；重复的 `key`/`state` 参数、空 Key、字面量 `{key}` 都按回跳失败处理。
3. 检查 `sessionStorage` 中的流程信息、state 相等且未超过十五分钟；缺失或过期时不自动绑定，提示重新发起流程或回到设置页手动填写。
4. 等待现有 `AuthContext` 完成静默 refresh，不能仅因为 Access Token 在页面内存中暂时不存在就判定未登录。
5. 当前用户必须与发起绑定时的 `userId` 一致。未登录或账号变化时停止自动绑定、清空待绑定 Key，转到不含密钥的登录/设置路径，提示登录后重新发起。不得把 Key 放入 `returnTo`。
6. 条件通过后，使用现有 `apiClient` 将 Key 通过 JSON 请求体传给保存接口。
7. 保存失败时保留当前页面内存中的 Key，允许用户重试；不向存储或 URL 写回 Key。不自动重复跳转到 Server 酱。
8. 保存成功后清空内存 Key、移除绑定流程信息，以 replace 导航回 `/account/notifications`，重新读取后端状态。

仓库使用 React StrictMode，需要防止 effect 重复执行造成双重保存/重复 Toast。使用每次回跳的内存状态或共享执行 Promise，确保处理一次；不能仅靠组件重挂载后会重置的布尔值。保存接口本身也应支持重复提交同一 Key。

推荐将早期 URL 读取和清理封装成独立模块，保证在 router 初始化前执行；注意静态 import 的求值顺序，不能仅把清理语句写在 `main.tsx` 正文中就假定早于已导入的 router。回跳页面自行等待认证状态，不直接套用会把完整 search 拼入登录 URL 的现有 `AuthGuard`。

本期默认在原浏览器同一标签页完成流程。若在另一台设备/微信内置浏览器打开回跳，原 sessionStorage 不存在，按失效流程处理；提供手动填写 Key 作为兜底，不做跨设备登录关联。

Key 不进入 localStorage、sessionStorage、日志、Toast 或错误上报。回跳文档应使用 `Referrer-Policy: no-referrer`（可在 HTML 尽早设置或用响应头），回跳路径的前端服务器及外层反代日志应省略查询串。地址栏清理不能撤销已经发生的首次页面请求日志。

## 6. 已实现的后端契约

以下全路径带 `/api/v1`；前端通过 `apiClient` 调用时只传 `/me/...`，由现有客户端添加前缀及 Bearer Token。

| 方法与路径 | 状态 | 用途 |
| --- | --- | --- |
| `GET /api/v1/me/notice` | 已实现 | 查询当前用户的总开关与 Key 是否存在 |
| `PUT /api/v1/me/notice/server-key` | 已实现 | 保存或替换当前用户的 Key |
| `POST /api/v1/me/addNotice` | 已有 | 开启全部收藏的通知 |
| `DELETE /api/v1/me/delNotice` | 已实现 | 关闭全部通知，不要求 vpsId，传入该参数也不会切换成单 VPS 关闭 |

### 6.1 状态查询

返回：

```json
{
  "code": 0,
  "message": "ok",
  "data": { "notice_enabled": false, "key_bound": true },
  "request_id": "..."
}
```

Key 为空是正常状态：返回 `key_bound: false`，不报数据库错误。查询失败则返回错误，不能伪装为未绑定。不返回完整 Key。前端页面首次加载以这个响应为准，不用调用开启接口来探测绑定状态。

### 6.2 保存 Key

请求体：

```json
{ "send_key": "用户回跳或手动提供的实际Key" }
```

服务方法名：`BindServerKey(ctx, uid, key)`；API 用 `principalID(c)` 取得 uid，不使用前端提交的 uid 或回跳参数选择数据库用户。

- 校验去掉两端空白后的 Key 非空，不接受字面量 `{key}`、控制字符或内部空白；根据当前字段容量最多接受 64 个字符，不能静默截断。若官方实际生成 Key 超长，应明确返回参数错误并另行调整存储契约。
- 不凭经验强制只允许 `SCT` 前缀，以免错误拒绝应用专用 AppKey。当前功能针对 Server 酱 Turbo 支持的 Key，不能宣称支持未验证的其他服务 Key。
- 使用鉴权用户 ID 查询并更新其 `server_turbo_key`；用户不存在要返回明确错误，不能零行更新却报告成功。
- 仅修改 Key，不更改 `notice_enabled`、通知次数、发送时间及收藏关系。
- 保存同一个 Key 多次应得到成功状态；响应采用 6.1 的设置对象，不回传 Key。
- “保存成功”仅代表 Key 入库；不声称已验证微信接收能力，后台发送仍可能遇到 Key 失效、限额等问题。

现有 `/me` 路由使用 Bearer 鉴权。复用当前认证方式，不创建匿名保存 Key 的 GET 接口。当前 `apiClient` 只为特定 `/auth` 写请求自动加 CSRF 头，不能假定 `/me` 写请求也已加；如果后端额外要求 CSRF，必须同步补充该路由与前端调用的 token 处理。

### 6.3 开启通知

继续使用现有 `POST /me/addNotice`，无须传 VPS 查询参数。当前成功响应 `data` 是字符串 `"success"`，前端兼容该响应，然后重新 GET 设置状态。

若失败业务码为 `500005`，重新读取状态并展示绑定入口，不通过中文错误文本进行匹配。其他错误正常展示，不启动绑定流程。

### 6.4 关闭全部通知

`DelNotices` 已去掉 API 对 `vpsId` 的必填检查；Service 接收 `ctx, uid`，确认用户存在后将 `users.notice_enabled` 设为 `false`。重复关闭成功。

为兼容现有写法，成功仍返回 `data: "success"`；前端随后 GET 设置状态，确认 `notice_enabled: false` 才展示已关闭。此接口已由空实现补全为数据库更新。

不删除 notice 行，不清空 Key，不删除收藏，也不遍历 Redis 删除消息。

## 7. 为什么关闭通知不需要删除 Pending

当前生产器只扫描 `notice_enabled = true` 的用户；消费者处理消息时会重新读取用户开关。因此：

```text
用户关闭总开关
  → 后续调度不再为该用户生成任务
  → 已入队任务在读取到关闭状态后不调用 Server 酱
  → 按现有策略留 Pending，达到投递上限后由 Recovery ACK
```

生产器已经读取到旧状态时，仍可能多入队一批任务，但消费者检查开关会阻止之后读取到关闭状态的任务发送。关闭前已经通过开关检查、进入发送流程的请求可能继续完成；前端文案可提示“关闭后停止后续通知，正在发送的消息可能仍会送达”。本期不保证撤回正在进行的 HTTP 请求。

`notice` 的计数/时间是历史。删除会让消费者下次发现没有记录时重新创建次数为零的行，造成重置额度；并不会建立任何“禁用订阅”状态。该模型还包含软删除和联合唯一约束，删除再创建会增加冲突处理问题，更不适合作为总开关。

当前 Stream 是共享任务队列，不是每个用户一个 Stream。`XPENDING` 提供消息 ID、消费者、空闲时间、投递次数，不直接给出用户/VPS。技术上可根据消息 ID 读取 Stream 的 payload 再解析 `UserId/VpsId`，但这种扫描对全局关闭没有必要。

此外，Pending 只覆盖已投递未确认的消息；尚未投递的消息不在其中，删除 Pending 也无法停止调度器继续产生新任务。`XACK` 表示某组完成消息，不等于删除 Stream 条目；`XDEL` 删除消息正文也不是撤回已开始处理任务的方法。业务开关才是关闭依据。

重新开启后按当前总开关和保留的通知历史处理；本期不保证关闭前的旧消息永远失效。若未来要求重新开启后必须忽略旧任务，需要另行引入配置版本或任务失效规则。

## 8. 实施文件建议

| 文件 | 工作 |
| --- | --- |
| `frontend/src/pages/account/NotificationSettingsPage.tsx` | 新增设置页 |
| `frontend/src/pages/account/ServerChanCallbackPage.tsx` | 新增回跳处理页 |
| `frontend/src/lib/serverchanBinding.ts` | 链接构造、流程信息、早期回跳提取与内存状态 |
| `frontend/src/api/notice.ts` | 封装状态、保存、开启、关闭 HTTP 调用 |
| `frontend/src/types/notice.ts` | 设置状态和保存请求类型 |
| `frontend/src/types/error.ts` | 增加 500005 错误码及对应文案 |
| `frontend/src/app/router.tsx` | 注册设置路由和特殊回跳路由 |
| `frontend/src/pages/account/AccountPage.tsx` | 增加设置入口 |
| `frontend/src/pages/account/FavoritesPage.tsx` | 增加微信通知设置链接 |
| `frontend/src/main.tsx` / 启动模块 | 确保敏感 URL 清理先于路由初始化 |
| `frontend/index.html`、`frontend/nginx.conf` | 回跳页 Referrer 策略、日志及 SPA 深链接支持；外层反代另行核对 |
| `backend/api/notice.go`、`backend/service/notice.go`、`backend/router/user.go` | 已补齐后端接口，前端联调时核对实际部署版本 |

前端开发复用现有 `apiClient`、`AppError`、`AuthContext`、Token refresh 和 Toast。当前生产入口不会启用 MSW，保持真实 API；Mock 只用于测试，不能拿 Mock 掩盖缺失后端接口。不要修改其他功能的错误码以扩大本次范围。

后端契约已同步 `docs/api.md`、`docs/openapi.yaml`。数据库迁移不在此次范围内，部署需已有通知用户字段；缺字段产生数据库错误时应按失败展示，不能伪造设置状态。

## 9. 验收要求

1. 未绑定、已绑定关闭、已绑定开启、设置查询失败、接口缺失均有对应展示；状态由后端返回决定。
2. 外跳 URL 的 `url` 解码一层后包含正确路径、`key={key}` 和本次 state；没有外层独立 key 参数，没有双重编码。
3. 不展示或代理 Server 酱二维码；用户在外部完成创建后返回指定页面。真实第三方扫码流程需人工联调，不能仅凭模拟回跳宣称已验证。
4. 有效回跳会先清理 URL、等认证恢复，再保存一次；刷新、StrictMode、网络失败重试不会产生重复提示或反复绑定。
5. 空 Key、重复参数、错误/过期 state、未登录、账号切换、跨浏览器回跳均不自动绑定到错误账户；提供重试或手动填写入口。
6. 手动填写只向后端 JSON 请求体提交 Key，成功后清空输入；GET/错误响应不泄露完整 Key。
7. 开启返回 500005 时展示绑定入口；不会把任意 HTTP 500 都当成未绑定。
8. 关闭请求不带 vpsId；后端总开关变 false，Key、收藏、notice 发送次数及时间不变；重复关闭成功。
9. 绑定成功不自动开启；重新开启不重置成功发送计数；UI 不承诺每次补货都无限次推送。
10. 模拟保存超时、开启失败、关闭失败，页面不假装成功，按钮可重试；恢复时重新查询状态。
11. 单元/组件测试覆盖链接编码、回跳清理和状态校验、业务码分支、保存与开启分离、全局关闭参数。执行 `npm run typecheck`、`npm test`、`npm run build`，区分 Mock 验证与真实联调。

## 10. 可直接交给实施模型的任务

> 请先阅读本文和所列当前源文件，实现注册用户的 Server 酱微信通知设置前端。范围是全部收藏的通知总开关、Key 绑定/更换和外部回跳，不做逐 VPS 取消。修正回跳链接层级，复用项目现有认证、HTTP 和 UI 组件。状态查询、Key 保存、开启和关闭后端接口已实现；不要调用内部 Service、匹配中文错误消息或伪造后端成功。核对实际部署版本，缺失接口时明确列出联调依赖，不擅自声称已上线。回跳 Key 只短暂存于内存并通过已鉴权 JSON 请求保存，不能放进登录 returnTo 或浏览器持久存储。最终说明修改文件、测试结果和仍未完成的真实联调项。
