# 前端采集联调速查

本文已替换旧的实施需求，核对日期 2026-09-19。完整说明见 [前端技术文档](frontend.md)、[接口](api.md)、[采集后端](collection.md)。

## 当前事实

- 调度、Redis Stream 消费和库存写入已经接入。
- 管理设置 collector_implemented 当前固定 true，不表示 Worker 在线，也不表示某商家已支持。
- ListCollectionTargets 已检查全局、商家、VPS 采集开关、业务启用及软删除条件。
- 公开详情已有 30 秒库存轮询、隐藏暂停、显示时刷新、防重叠与失败保留旧数据。
- 数据表实际名为 vps_stocks；此名称不进入前端业务类型。
- 采集器目前仅明确识别无货，其他正常返回可能写入未知；未知不能直接归因于未启动 Worker。

## 前后端边界

| 字段 | 来源 | 前端解释 |
| --- | --- | --- |
| collector_implemented | AdminSettings | 代码能力标记 |
| collection_enabled | 管理设置/商家/VPS | 各层保存的许可 |
| enabled | 管理商家/VPS | 业务启用/公开展示 |
| stock.status | VPS 内嵌或 stock/info | 1 有货、2 无货、3 未知 |
| quantity | Stock | null 未提供数量，不能转 0 |
| last_checked_at | Stock | 最近写入观测时间；不代表必然判定出有/无货 |
| last_in_stock_at | Stock | 最后确认有货时间 |
| is_stale | Stock | 检查时间为空或超过 15 分钟 |

不要发送或显示 delivery_id、stream/group/consumer/pending，也不要提供不存在的“立即采集”接口按钮。

## 联调场景

1. 保存 false 后重新 GET，确认配置确实关闭；下级原开关保持原值。
2. 关闭许可后检查后续入队停止；已入队任务当前仍可能执行，UI 不承诺立即取消。
3. 无库存行显示未知/过期/尚未获得结果；已检查但未知显示库存未知。
4. 轮询网络失败保留上次数据，恢复后清除错误提示。
5. 隐藏页面不轮询，恢复可见刷新；快速切换 ID 的首次请求竞态仍是待修复项。
6. 停用 VPS 对公开接口返回 404；后台详情仍通过管理 API 读取。
7. 管理设置或商家信息读取失败时，应表达条件未知；当前详情存在乐观判断缺口，见 [known-issues.md](known-issues.md)。

这些场景是后续联调检查项，不是已完成的端到端验收记录。
