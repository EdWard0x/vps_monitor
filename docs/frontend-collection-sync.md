# 前端同步说明：库存采集与展示

本文用于指导前端同步当前后端的库存采集功能。本文只描述浏览器需要理解的业务状态和 HTTP API；Redis Stream、消费者组、Pending、消息 ID 等均属于后端内部实现，不应进入前端模型。

> 本文优先级高于 `docs/frontend.md` 中“采集尚未实现”“仅为未来配置预留”等旧描述。

## 1. 当前后端流程

库存采集由后端自动完成，前端不直接发起采集：

1. 管理员配置站点、商家和 VPS 三个层级的采集开关。
2. 后端调度器周期性扫描允许采集的 VPS，当前周期约为 1 分钟。
3. 调度器把采集任务写入 Redis Stream。
4. Worker 读取任务，选择与商家 `code` 对应的采集器并请求目标站点。
5. Worker 将最新库存写入 `vps_stock`。
6. 前端通过 HTTP API 获取最终库存结果。

因此前端不得：

- 连接 Redis 或自行消费 Stream；
- 发送或展示 `delivery_id`、Stream ID、group、consumer、pending 等内部字段；
- 根据“开关已打开”直接显示“正在采集”或“Worker 正常运行”；
- 显示虚构的任务进度、倒计时或采集成功提示；
- 把轮询失败误写成“未知库存”。

## 2. 采集开关语义

一次采集任务是否应被创建，由以下条件共同决定：

```text
全局 collection_enabled
&& 商家 enabled
&& 商家 collection_enabled
&& VPS enabled
&& VPS collection_enabled
```

其中：

- `enabled`：资源是否对业务启用，例如是否展示或可正常使用；
- `collection_enabled`：是否允许后台采集该资源的库存；
- `collector_implemented`：后端是否已经具备采集能力，是只读能力标记，不是用户配置；
- 软删除的商家或 VPS 永远不应进入采集范围。

`collector_implemented` 不代表 Worker 当前健康，也不代表某个 VPS 已完成过采集。前端只能据此判断“采集能力可用/不可用”。

推荐前端展示以下状态：

| 条件 | 展示文案 | 是否允许编辑下级开关 |
| --- | --- | --- |
| `collector_implemented=false` | 后端采集能力不可用 | 可以保存配置，但提示暂不会产生采集结果 |
| 全局采集关闭 | 全局采集已停用 | 商家和 VPS 开关仍可编辑，用于预先配置 |
| 商家业务停用 | 商家已停用，库存不会采集 | 可编辑 |
| 商家采集关闭 | 商家采集已停用 | 可编辑 VPS 开关 |
| VPS 业务停用 | VPS 已停用，库存不会采集 | 可编辑 |
| VPS 采集关闭 | 此 VPS 未启用采集 | 可编辑 |
| 所有条件满足 | 已允许后台采集 | 可编辑 |

注意使用“已允许后台采集”，不要使用“正在采集”。目前没有 Worker 健康检查或任务状态 API，前端无法证明任务正在执行。

## 3. HTTP API 契约

当前 `frontend/src/types/stock.ts`、`settings.ts`、`merchant.ts` 和 `vps.ts` 的核心字段已经与下述响应一致。本次以核对并保持契约为主，不需要为了 Redis Stream 新增前端字段；主要改动集中在页面文案、有效状态解释和轮询失败处理。

### 3.1 管理端站点设置

```http
GET /api/v1/admin/settings/info
PUT /api/v1/admin/settings/update
```

响应中与采集有关的字段：

```ts
export interface AdminSettings {
  collection_enabled: boolean;
  collector_implemented: boolean;
  settings: PublicSettings;
  updated_at: string;
}
```

更新请求是部分更新，只发送用户实际修改的字段：

```ts
export interface UpdateSettingsRequest {
  site_name?: string;
  registration_enabled?: boolean;
  collection_enabled?: boolean;
}
```

不要把响应里的 `collector_implemented`、`updated_at` 或整个 `settings` 对象原样提交回 PUT 接口。

### 3.2 管理端商家

```http
GET /api/v1/admin/merchant/list
GET /api/v1/admin/merchant/info?id={merchant_id}
POST /api/v1/admin/merchant/create
PUT /api/v1/admin/merchant/update
```

采集相关字段：

```ts
export interface AdminMerchant {
  id: string;
  code: string;
  name: string;
  website_url: string;
  enabled: boolean;
  collection_enabled: boolean;
  created_at: string;
  updated_at: string;
}
```

- `enabled` 和 `collection_enabled` 是两个独立开关；
- 编辑时不要把两者合并为一个状态；
- 商家列表建议分别显示“业务状态”和“采集状态”；
- 商家上级条件关闭时，下属 VPS 的开关值不需要被前端自动改成 `false`。

### 3.3 管理端 VPS

```http
GET /api/v1/admin/vps/list
GET /api/v1/admin/vps/info?id={vps_id}
POST /api/v1/admin/vps/create
PUT /api/v1/admin/vps/update
```

采集相关字段：

```ts
export interface AdminVPS {
  id: string;
  merchant_id: string;
  enabled: boolean;
  collection_enabled: boolean;
  stock: Stock;
  // 其余套餐字段沿用现有 VPS 类型
}
```

表单继续保存 `enabled` 与 `collection_enabled`。如果上级开关关闭，可以在界面上显示“受全局设置限制”或“受商家设置限制”，但不要自动覆盖 VPS 自己保存的开关值。

### 3.4 库存查询

公开 VPS 列表和详情响应中已经包含 `stock`。针对单个 VPS 的轻量刷新使用：

```http
GET /api/v1/stock/info?vps_id={vps_id}
```

库存类型：

```ts
export interface Stock {
  vps_id: string;
  status: 1 | 2 | 3;
  quantity: number | null;
  last_checked_at: string | null;
  last_in_stock_at: string | null;
  is_stale: boolean;
}
```

前端类型中不要添加以下字段：

```text
delivery_id
observation_version
stream_id
message_id
```

`delivery_id` 仅用于后端阻止旧消息覆盖新结果；`observation_version` 已废弃并删除。

## 4. 库存展示规则

`status` 的固定语义如下：

| `status` | 含义 | 推荐主文案 | `quantity` 处理 |
| --- | --- | --- | --- |
| `1` | 有货 | 有货 | 非空时显示库存数量；为空时只显示有货 |
| `2` | 无货 | 暂时无货 | 通常不显示数量 |
| `3` | 未知 | 库存未知 | 不把空值渲染为 0 |

额外规则：

- `quantity=null` 表示未提供数量，绝不等价于 `0`；
- `last_checked_at=null` 表示尚未成功采集；
- `last_in_stock_at` 是最后一次确认有货的时间，不是最后一次采集时间；
- `is_stale=true` 表示数据过期，应在主库存状态旁额外显示“数据可能已过期”；
- 当前后端超过约 15 分钟未成功检查即视为过期；前端直接使用 `is_stale`，不要重复计算；
- 没有库存记录时按“未知 + 过期”处理，不显示假库存；
- 时间统一按 ISO 8601 解析，再转换为用户本地时区显示。

建议组合示例：

```text
有货 · 剩余 3 台
最后检查：1 分钟前

暂时无货
最后有货：2026-09-18 10:20

库存未知 · 数据可能已过期
尚未获得成功的采集结果
```

## 5. 页面修改要求

### 5.1 系统设置页

目标文件：`frontend/src/pages/admin/AdminSettingsPage.tsx`

- 将“允许未来全局采集”等旧文案改为“启用全局库存采集”；
- 说明该开关是全局总开关，实际采集还要求商家和 VPS 两级开关均开启；
- `collector_implemented=false` 时显示能力不可用提示；
- `collector_implemented=true` 时移除“实际采集功能待接入”的旧提示；
- 保存成功只能提示“设置已保存”，不能提示“采集任务已启动”；
- 不提供任务进度条或“立即采集”按钮，因为后端暂时没有相应 API。

### 5.2 商家管理页

目标文件：

- `frontend/src/features/merchant/MerchantFormDialog.tsx`
- `frontend/src/features/merchant/MerchantTable.tsx`

要求：

- 保留业务启用与采集启用两个开关；
- 列表分别展示两个状态；
- 如果全局开关关闭，采集开关仍允许编辑，但显示“受全局开关限制”；
- 不因上级关闭而修改已保存的下级值。

### 5.3 VPS 管理页

目标文件：

- `frontend/src/features/vps/VpsFormDialog.tsx`
- `frontend/src/features/vps/VpsTable.tsx`
- `frontend/src/pages/admin/AdminVpsDetailPage.tsx`

要求：

- 保留 `enabled` 与 `collection_enabled` 两个字段；
- 展示该 VPS 的自身开关和最终是否具备采集条件；
- 如果缺少商家完整信息，至少展示 VPS 自身状态，不在前端猜测商家状态；
- 库存区域遵循第 4 节，不读取任何 Redis 内部字段。

### 5.4 公开 VPS 列表和详情页

目标文件：

- `frontend/src/pages/public/HomePage.tsx`
- `frontend/src/pages/public/VpsDetailPage.tsx`
- `frontend/src/components/common/StockBadge.tsx`
- `frontend/src/components/common/StaleAlert.tsx`
- `frontend/src/features/vps/VpsDetailCard.tsx`

要求：

- 删除“外部采集程序”“采集功能待接入”等过时文案，统一称为“后台库存采集”；
- 详情页初次加载使用 VPS 详情中携带的 `stock`；
- 后续使用 `/stock/info` 轻量刷新，不重复获取整个 VPS 详情；
- 过期提示与有货/无货状态可以同时存在；
- 公开页面不展示任何管理开关或后台任务细节。

## 6. 轮询策略

VPS 详情页建议继续每 30 秒刷新一次库存：

1. 页面不可见时暂停轮询；
2. 页面重新可见时立即刷新一次；
3. VPS ID 改变或组件卸载时取消旧请求，或忽略迟到响应；
4. 刷新成功后替换当前 `stock`；
5. 刷新失败时保留上一次成功数据，并显示非阻塞提示；
6. 不得因为一次网络失败把现有库存改成 `status=3`；
7. 避免多个定时器重叠请求。

列表页无需高频刷新。可以在重新进入页面时刷新，或在页面可见时采用不短于 60 秒的刷新周期。

前端轮询周期与后端约 1 分钟的调度周期互相独立。即使设置刚保存，也可能需要等待一次调度、HTTP 采集和数据库写入后才能看到新结果。

## 7. 错误与空状态

前端必须区分：

| 场景 | 处理方式 |
| --- | --- |
| API 明确返回 `status=3` | 显示库存未知 |
| `last_checked_at=null` | 显示尚未获得采集结果 |
| `is_stale=true` | 在现有状态旁显示过期提示 |
| 轮询请求失败 | 保留现有数据，显示刷新失败提示 |
| VPS 不存在 | 按统一 404 页面处理 |
| 未登录或权限不足 | 沿用现有 401/403 流程 |
| 采集开关已打开但库存仍未知 | 提示等待后台采集，不宣称系统故障 |

## 8. 当前联调前置项

前端按本文修改前，后端还需要确认以下契约，否则界面会出现语义不一致。

### B1. `collector_implemented` 仍被固定返回为 `false`

当前设置服务仍将 `collector_implemented` 写死为 `false`。Worker 和采集器已经接入后，该字段应按实际部署能力返回 `true`，否则前端仍会显示“采集能力不可用”。

这个字段只表达“代码/部署具备采集能力”，不应被解释为实时 Worker 健康状态。如果未来需要显示 Worker 在线状态，应新增独立健康接口。

### B2. 调度查询必须真正应用全局开关

前端会把站点 `collection_enabled` 展示为总开关，因此后端 `ListCollectionTargets` 必须同时检查：

- 全局 `site_settings.collection_enabled=true`；
- 商家未删除、`enabled=true`、`collection_enabled=true`；
- VPS 未删除、`enabled=true`、`collection_enabled=true`。

如果查询未检查全局开关，管理员关闭总开关后任务仍可能继续入队，前端文案就会与实际行为冲突。

### B3. OpenAPI 和旧前端文档仍有过时描述

`docs/openapi.yaml` 以及 `docs/frontend.md` 中仍存在“采集未实现”或 `collector_implemented=false` 的旧描述。完成后端契约确认后应同步更新，避免前端生成类型或查阅文档时得到相反结论。

## 9. 验收清单

- [ ] 设置页能读取和保存全局 `collection_enabled`。
- [ ] `collector_implemented` 只作为能力提示，不作为实时健康状态。
- [ ] 商家和 VPS 的 `enabled`、`collection_enabled` 分开显示和提交。
- [ ] 上级开关关闭不会自动覆盖下级已保存值。
- [ ] VPS 详情页使用 `/stock/info?vps_id=...` 轮询库存。
- [ ] 页面隐藏时暂停轮询，重新可见时刷新。
- [ ] 轮询失败会保留最后一次成功数据。
- [ ] `quantity=null` 不会显示为 0。
- [ ] `status=3` 和 `is_stale=true` 能正确展示。
- [ ] `last_checked_at` 与 `last_in_stock_at` 文案不会混淆。
- [ ] 前端类型、请求体、界面和日志中均不存在 `delivery_id` 或 `observation_version`。
- [ ] 界面不显示虚构的采集进度、Worker 在线状态或立即采集按钮。
- [ ] 全局、商家、VPS 任一采集条件关闭时，界面能解释最终未采集原因。

## 10. 推荐实施顺序

1. 后端完成第 8 节的契约确认。
2. 核对并保持前端 TypeScript 类型和 API 请求类型，不引入消息内部字段。
3. 更新系统设置、商家和 VPS 管理表单文案。
4. 完善库存状态组件与时间展示。
5. 完善详情页轮询失败、页面可见性和迟到响应处理。
6. 按第 9 节完成联调验收。
