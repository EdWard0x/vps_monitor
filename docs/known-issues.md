# 已知问题、改进建议与验证记录

核对日期：2026-09-19，源代码基点 c1d2db8。本次只重写文档，下列问题没有顺便修改。结论来自列明的源码或本地命令；未连接生产环境，也没有验证商家网页的当前结构。

## 1. 实际执行的验证

| 检查 | 结果 | 能证明什么 |
| --- | --- | --- |
| 后端 `go build ./...` | 通过 | 业务包和命令入口可构建，不包括测试包的正确性 |
| 后端 `go test ./test -run '^$'` | 编译失败 | skeleton_test 的 fakeMessages.Ack 签名未同步 |
| 前端 `npm test -- --reporter=dot` | 6 文件、40 测试通过 | 现有 HTTP、格式化、邮件、找回、契约、库存组件测试通过 |
| 前端 `npm run build` | 通过 | TypeScript 检查和 Vite 生产打包通过 |
| 文档静态核对 | 通过 | 38 个业务路由与接口表/OpenAPI 对应；当前文档相对链接存在，代码围栏配对，git diff --check 无空白错误 |

初次检查受本机执行沙箱限制（Go 缓存访问、esbuild 子进程 EPERM），获准本地执行后得到以上最终结果。前端静态渲染测试输出 useLayoutEffect 服务端渲染警告，不影响通过。

未执行：完整 go test ./...、真实 PostgreSQL/Redis 路由集成、SMTP 发送、浏览器端到端流程、商家在线抓取、容器构建/部署、旧数据库升级。这些均不能标记为通过。

## 2. 优先处理：测试与采集可靠性

### B1. 后端测试替身不能编译

证据：[skeleton_test.go](../backend/test/skeleton_test.go) 的 fakeMessages.Ack 是 `Ack(context.Context,string)`，而 [消息接口](../backend/iface/message/message.go) 要求 `Ack(context.Context,ReadOptions,string)`。实测 go test 的编译错误与此一致。

建议同步 fake 接口，并增加不同分支 ACK/Pending 的隔离测试。业务构建通过不能替代此修复。

### B2. Redis 测试会访问固定本地实例并可能永久运行

证据：[client_test.go](../backend/utils/redisstream/client_test.go) 直接连接本地 Redis，使用固定凭据/DB；TestClient_Read 是无限循环、BLOCK=0，TestClient_Pub 使用 Redis Pub/Sub PUBLISH，根本不是 Stream XADD。

建议移到显式集成测试并用测试环境配置、随机 key、截止时间和资源清理；默认单元测试不读取真实业务组。当前没有执行这些测试。

### C1. Pending 恢复实际丢弃本次任务

证据：[RecoverPending](../backend/task/stock_consumer.go) 在 AutoClaim 后直接 Ack，处理业务的调用被注释。未 ACK 的解析/SQL 失败最终可能在不写库存的情况下被清理。此处属于当前避免重复触发风控的策略，不是可靠重试实现。

建议先决定产品语义：允许丢弃的周期采样需明确指标和原因；要求可靠处理则补最大尝试、退避、死信和可观测性，不能仅把现状改名为重试。

### C2. 采集器没有有货识别分支

证据：[dmit.go](../backend/utils/collect/dmit.go)、[akko.go](../backend/utils/collect/akko.go) 仅将 Out of Stock 映射 0，其他正常返回是 nil，UpdateStock 写未知。Akko 找不到标题也正常写未知；DMIT 则报 QueryHtmlFailed。

建议以保存的页面样本明确有货、无货、未知、结构变化规则；有货但数量未知需要扩展 Observation，不能伪造库存数。

### C3. 关闭许可无法停止已入队任务

证据：ListCollectionTargets 检查所有许可，但 processDelivery/UpdateStock 不调用 CollectionAllowed。修改或停用套餐后，旧消息仍持有旧 URL，可继续采集写库。

建议采集前与提交前根据所需一致性复核当前目标及许可；定义关闭后的在途任务语义。当前文档只承诺后续扫描不再选入。

### C4. Worker 业务循环退出不影响进程存活

证据：[worker main](../backend/cmd/worker/main.go) 对 OpenDatabase 错误使用 `_` 忽略；连接失败可能导致 nil Close/后续访问异常。读取错误、首次调度错误使 goroutine 退出，只打印日志；main 继续等待信号。

建议检查依赖错误、集中监管 goroutine、设计退出/重连策略，提供独立 Worker 健康观测。现有 API live 不能代表 Worker 健康。

### C5. 多 Worker 会重复调度，Pending 还可能提前 ACK

证据：每个 worker main 都启动 scheduler；没有领导者或去重机制。RecoverPending MinIdle=1 分钟，而外部 HTTP 无显式客户端超时，慢任务可能执行中被认领确认。

建议先保持单调度器，再扩展消费者；设置确定的任务超时和与之匹配的 Pending 策略。

### C6. 解析请求缺少完整超时与成功条件

证据：[flare_req.go](../backend/utils/collect/flare_req.go) 的 http.Client 无 Timeout，只检查 HTTP 状态和 JSON 解码；未判断返回业务 status、solution.status、响应体大小。maxTimeout 只是发给解析服务的参数。

建议为请求设 deadline、验证解析服务结果、限制读取大小，区分网页结构变化与网络/解析失败。

### C7. Stream 边界处理不完整

证据：[redisstream/client.go](../backend/utils/redisstream/client.go) 的 Read 对 payload 直接断言 string，非法消息可能 panic；Ack 对 0 返回错误；XADD 近似 MAXLEN 10000 不区分 Pending；新消费组从 `$` 跳过现存消息。

建议明确任务保留策略、毒消息处置、重复确认语义和新组起点。scheduled_at 当前也未赋值，不能支持过期丢弃/排队时延统计。

### C8. 库存写入的并发与校验边界

证据：[stock.go](../backend/service/stock.go) 忽略 vpsId 解析错误，merchantCode 未使用；首次创建缺行时 SELECT FOR UPDATE 无法锁定不存在行，并发创建可触发唯一冲突。去重在网页抓取后进行，ID 只表达入队顺序。

建议加强输入验证、原子 upsert/首次插入竞争处理、明确观测时间与去重边界。当前只能称为基于 delivery_id 的防旧覆盖，不能承诺 exactly-once。

## 3. 部署与迁移

### D1. 现成 Compose 无法独立提供解析服务

证据：[docker-compose.vps.yaml](../docker-compose.vps.yaml) 没有解析服务，也没有透传 FLARE_RESOLVER_URL、WORKER_READ_COUNT、WORKER_BLOCK_SECONDS。默认 localhost:8191 指 backend 容器本身。

建议按真实拓扑补服务或外部地址及网络，见 [部署示例](deployment.md)。仅打开 START_WORKER/WORKER_ENABLED 不代表解析依赖已就绪。

### D2. readiness 硬编码迁移版本

证据：[initialize/app.go](../backend/initialize/app.go) 要求 schema_migrations 只有一条且 min/max version=1。将来正常新增 002 后也会 not_ready；当前检查不验证字段或校验和。

建议从版本清单判断当前期望版本，并与迁移状态校验复用。不能以 ready=200 证明旧库拥有 delivery_id。

### D3. 旧库升级无现成转换迁移

仓库仅提供含 delivery_id 的 001_initial，不能据此推断既有数据库已更新。迁移历史会核验校验和；修改已执行 SQL 可能导致校验失败。

建议新增明确的升级迁移和库存历史回填规则。实际旧库结构未经本次访问，不能断言用户的数据库缺列或已损坏。

## 4. 前端及契约

### F1. 自定义 API 基础地址未覆盖启动认证

证据：[AuthContext.tsx](../frontend/src/app/AuthContext.tsx) 初始化调用 CSRF/refresh 未传 baseUrl，辅助函数使用 `/api/v1`；[client.ts](../frontend/src/lib/http/client.ts) 正常请求则读取 VITE_API_BASE_URL。

建议提取统一基础地址，覆盖所有裸 fetch 和初始化路径。当前采用同源代理可避免这一分歧。

### F2. 初次请求有竞态，管理采集条件可能被乐观展示

证据：[VpsDetailPage](../frontend/src/pages/public/VpsDetailPage.tsx) 的初次 getVPS 没有取消/版本守卫，而轮询有 cancelled。快速更换 id，旧详情可能覆盖新详情。

[AdminVpsDetailPage](../frontend/src/pages/admin/AdminVpsDetailPage.tsx) 在设置/商家请求失败、对象为 null 时跳过上级限制；当前文案又使用未提交表单值，可能提前显示条件满足。

建议覆盖初次请求生命周期，将“上级信息未知”“未保存编辑”“已保存许可”分别表达。

### F3. 设置异常回退与认证状态不完全准确

SettingsContext 在获取失败时回退 registration_enabled=true，后端安全默认则是 false。token.ts 将刷新失败全部压为 null，不能区分匿名与服务暂不可用。

建议设置异常采用保守值/未知态，刷新保留可区分的错误分类；不要用前端默认值推断后端状态。

### F4. 多标签 React 状态和登出失败尚未闭环

BroadcastChannel 只更新 token 模块，不同步其他标签的 AuthContext user/status；登出请求失败仍清本地状态但 RT Cookie 可能留下。Web Locks 只串行刷新，锁内没有复用新 token 的条件。

建议同步身份事件并呈现登出网络失败，补真实浏览器多标签测试。后端也没有 RT 重放追踪，不能由前端注释推断其存在。

### F5. 类型与契约差异

- 前端 disk_type 是固定枚举，后端是最多 32 字符的字符串。
- 后端 FieldError 是 field/message，前端是 field/reason/limit；当前响应不填 errors。
- OpenAPI 的完整 required、SettingsUpdate additionalProperties=false 比当前 JSON 绑定严格。
- 密码实际限制是字节，OpenAPI minLength/maxLength 是字符。
- HomePage 商家筛选只读第一页 100 条，不覆盖更多商家。

建议按 [api.md](api.md) 的差异清单逐项统一，并让契约测试验证实际路由/响应，而非仅检查静态常量。

## 5. 后续验证建议

优先修测试编译和 Worker 生命周期，再明确采集状态与 Pending 策略；之后覆盖：旧/重复 delivery_id、并发首条库存、SQL 成功 ACK 失败、执行中关闭开关、非法消息、解析超时、页面结构变化、不支持商家、Worker 异常退出。

前端优先覆盖跨 API 地址的启动恢复、详情 ID 切换、页面隐藏与恢复、轮询失败保留数据、上级信息失败、未保存采集编辑、多标签退出。真实邮件和旧库迁移另用隔离环境验收。
