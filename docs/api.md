# HTTP 接口与联调契约

核对日期：2026-09-19。机器可读契约见 [openapi.yaml](openapi.yaml)。路由事实来自 `backend/router`，输入/输出来自 `model/request`、`model/response` 和 service；OpenAPI 对必填字段等比当前绑定层更严格的地方见第 7 节。

## 1. 通用约定

业务前缀 `/api/v1`。以下路由表省略此前缀。POST/PUT 使用 JSON；详情/删除 ID 使用 query。字段 snake_case；ID 为十进制字符串，不转 JS Number；验证码请求 ID 为 UUID 不透明字符串；时间为 RFC3339；价格为十进制字符串。

成功示例（仅说明格式）：

```json
{"code":0,"message":"ok","data":{"items":[],"total":0,"page":1,"page_size":20},"request_id":"example-request-id"}
```

失败格式：`{code,message,data:null,request_id}`。普通成功 200；找回验证码申请 202；删除也是 200/null。健康检查不使用包络；CORS 预检 204。未注册路由可能由 Gin 返回默认 404，不应假定每个 404 都有 JSON 包络。

分页 `page/page_size`，默认 1/20，最大 100，由服务端 Normalize 归一化，非法字符串绑定失败。列表 data 为 `{items,total,page,page_size}`，空 items=[]。

权限缩写：公开=不要求 AT；CSRF=Cookie + X-CSRF-Token；登录=Bearer AT；管理=AT + 当前 admin 角色 + 已验证邮箱。所有前端请求 credentials=include。

## 2. 认证、账户与用户

| 方法/路径 | 权限 | 输入 | data |
| --- | --- | --- | --- |
| GET `/auth/csrf` | 公开 | 无 | `{token}`，设置/复用 CSRF Cookie |
| POST `/auth/register` | CSRF | username,nickname,password | PublicUser |
| POST `/auth/login` | CSRF | username,password | `{user:AccountUser,access_token,token_type,expires_in}`，写 RT Cookie |
| POST `/auth/refresh` | CSRF + RT Cookie | 空对象即可 | `{access_token,token_type,expires_in}`，更新 Cookie |
| POST `/auth/logout` | CSRF | 空对象即可 | null，清当前 RT Cookie |
| POST `/auth/password-reset/code` | CSRF | mail | 202 `{reset_id,expires_in,retry_after,message}` |
| POST `/auth/password-reset/confirm` | CSRF | reset_id,code,new_password | null |
| GET `/me/info` | 登录 | 无 | AccountUser |
| PUT `/me/update` | 登录 | nickname | AccountUser |
| PUT `/me/password` | 登录 | current_password,new_password | null |
| POST `/me/mail/code` | 登录 | mail,current_password? | `{verification_id,expires_in,retry_after}` |
| POST `/me/mail/verify` | 登录 | verification_id,code | AccountUser |
| GET `/admin/user/list` | 管理 | page,page_size,q,role,frozen | Page<AdminUser> |
| GET `/admin/user/info` | 管理 | id | AdminUser |
| PUT `/admin/user/update` | 管理 | id,nickname | AdminUser |
| PUT `/admin/user/role` | 管理 | id,role | AdminUser |
| POST `/admin/user/resetPassword` | 管理 | user_id,new_password | null |
| POST `/admin/froze/freeze` | 管理 | user_id | `{user_id,frozen,cache_synced}` |
| POST `/admin/froze/unfreeze` | 管理 | user_id | `{user_id,frozen,cache_synced}` |

PublicUser：id、username、nickname、role、created_at、updated_at。

AccountUser 在 PublicUser 上增加 mail:string|null、mail_verified:boolean、mail_verified_at:string|null、mail_required:boolean。AdminUser 在 PublicUser 上仅增加 frozen:boolean。角色只允许 user/admin。

用户名规范化后为 3–64 位小写字母/数字/下划线，首位字母或数字；昵称 1–64 字符；密码 8–72 UTF-8 字节。验证码为 6 位数字，有效 600 秒、重发冷却 60 秒；换绑已有邮箱需要 current_password。

注册不会自动登录。密码或角色实际改变会使旧令牌失效。冻结不可通过改密解除。最后一个可用管理员不能降权或冻结。找回 202 是中性受理，不承诺邮箱存在或已投递。

## 3. 商家、VPS、库存

| 方法/路径 | 权限 | 输入 | data |
| --- | --- | --- | --- |
| GET `/merchant/list` | 公开 | page,page_size,q | Page<Merchant> |
| GET `/merchant/info` | 公开 | id | Merchant |
| GET `/admin/merchant/list` | 管理 | page,page_size,q,enabled | Page<AdminMerchant> |
| GET `/admin/merchant/info` | 管理 | id | AdminMerchant |
| POST `/admin/merchant/create` | 管理 | code,name,website_url,enabled,collection_enabled | AdminMerchant |
| PUT `/admin/merchant/update` | 管理 | id,name,website_url,enabled,collection_enabled | AdminMerchant |
| DELETE `/admin/merchant/delete` | 管理 | id | null |
| GET `/vps/list` | 公开 | VPSListQuery | Page<VPS> |
| GET `/vps/info` | 公开 | id | VPS |
| GET `/admin/vps/list` | 管理 | VPSListQuery + enabled | Page<AdminVPS> |
| GET `/admin/vps/info` | 管理 | id | AdminVPS |
| POST `/admin/vps/create` | 管理 | VPSEditable | AdminVPS |
| PUT `/admin/vps/update` | 管理 | VPSEditable + id | AdminVPS |
| DELETE `/admin/vps/delete` | 管理 | id | null |
| GET `/stock/info` | 公开 | vps_id | Stock |

VPSListQuery：page、page_size、q、merchant_id、currency、billing_period、status、sort。status 仅 1/2/3；sort 为 updated_desc（默认）、price_asc、price_desc；币种查询归一化。公开请求不能通过 enabled 参数查看停用项。

Merchant：id、code、name、website_url。AdminMerchant 增加 enabled、collection_enabled、created_at、updated_at。

VPSEditable 的完整示例：

```json
{
  "merchant_id": "42",
  "code": "sample-plan",
  "name": "示例套餐",
  "description": "仅用于说明请求格式",
  "cpu_cores": 1,
  "memory_mb": 1024,
  "disk_gb": 20,
  "disk_type": "ssd",
  "transfer_gb": null,
  "port_mbps": 0,
  "has_ipv4": true,
  "ipv4_count": 1,
  "has_ipv6": false,
  "ipv6_count": 0,
  "price_amount": "5.00",
  "currency": "USD",
  "billing_period": "monthly",
  "purchase_url": "https://example.com/cart.php?pid=42",
  "enabled": true,
  "collection_enabled": false
}
```

更新商家/VPS 需发送完整可编辑对象，尤其不要省略两类开关：当前 Go 非指针 bool 省略会变 false。设置更新才是部分更新。商家 code 创建后不可编辑，VPS code 与 merchant_id 可更新。

VPS 输出包含上述套餐字段（公开输出不含 merchant_id、enabled、collection_enabled），另含 id、merchant:Merchant、stock:Stock、created_at、updated_at。AdminVPS 增加 merchant_id、enabled、collection_enabled，内嵌 merchant 仍是公开简版，不包含商家采集许可。

Stock：

```ts
interface Stock {
  vps_id: string;
  status: 1 | 2 | 3; // 有货、无货、未知
  quantity: number | null;
  last_checked_at: string | null;
  last_in_stock_at: string | null;
  is_stale: boolean;
}
```

无记录返回未知/null/过期；15 分钟过期阈值不会覆盖状态。HTTP 类型允许有货但未知数量，当前 Worker 的 Quantity 推导逻辑不能生成此组合。没有 delivery_id、observation_version、Stream ID 输出。

公开详情、列表和库存都检查商家/VPS 可见性。隐藏、删除、不存在统一 404；没有公开资源时不能由 stock/info 绕过限制。删除商家若仍有未删除 VPS 返回 409，软删除不会释放唯一 code。

## 4. 设置与看板

| 方法/路径 | 权限 | 输入 | data |
| --- | --- | --- | --- |
| GET `/settings/info` | 公开 | 无 | PublicSettings |
| GET `/admin/settings/info` | 管理 | 无 | AdminSettings |
| PUT `/admin/settings/update` | 管理 | site_name?,registration_enabled?,collection_enabled? | AdminSettings |
| GET `/admin/dashboard/info` | 管理 | 无 | DashboardSummary |

```ts
interface PublicSettings {
  site_name: string;
  registration_enabled: boolean;
}
interface AdminSettings {
  settings: PublicSettings;
  collection_enabled: boolean;
  collector_implemented: boolean;
  updated_at: string;
}
```

PUT 使用平铺字段，至少一个有效字段；false 必须保存。collector_implemented 当前固定 true，不可由请求修改，不证明 Worker 健康。

DashboardSummary 全是计数：user_count、frozen_user_count、merchant_count、vps_count、in_stock_count、unknown_stock_count。包含未删除停用项，无库存行计未知；无货数量可从套餐总数减去另两类计算，但接口没有单独字段。

## 5. 错误码

| HTTP | code | 含义 |
| --- | --- | --- |
| 400 | 100001 | 参数错误 |
| 429 | 100003 | 请求频繁/验证码冷却 |
| 403 | 100004 | CSRF 或来源校验失败 |
| 404 | 100005 | 资源不存在或公开不可见 |
| 409 | 100006 | 唯一约束、关联冲突、最后管理员保护 |
| 401 | 200001 / 200002 / 200003 | 凭据错误 / 需登录 / AT 过期 |
| 403 | 200005 / 200006 | 冻结 / 权限不足 |
| 401 | 200009 / 200017 | 无效令牌 / 令牌撤销 |
| 403 | 200011 / 200018 | 邮箱验证要求 / 注册关闭 |
| 409 | 200012 / 200015 | 邮箱被占用 / 邮箱未变化 |
| 400 | 200013 / 200016 | 邮箱验证码失效 / 找回请求失效 |
| 503 | 200014 | 邮件服务不可用 |
| 400 | 300001 | 用户名非法 |
| 409 | 300002 | 用户名已存在 |
| 401 | 300003 | 密码验证失败 |
| 500 | 400001 | 数据库操作失败 |
| 503 | 900004 | 依赖/未分类异常 |
| 501 | 900005 | 未实现或无依赖骨架模式 |

当前后端采集错误 FlareResolveFailed/QueryHtmlFailed 也复用 400001，但不经业务路由返回；它们不是额外的稳定 HTTP 子分类。前端仅对 401+200003 自动刷新一次，其他 401 不循环刷新。

## 6. 联调顺序

1. 检查 live/ready，初始化数据库和首个管理员。
2. GET csrf，保留 Cookie；登录 POST 同时带 CSRF header。
3. 用返回 AT 调用 me/info，验证角色和邮箱状态。
4. 录入商家和 VPS，检查公开接口；关闭 enabled 验证公开 404、管理仍可查。
5. 更新采集三级许可，独立启动 Worker；前端只读取库存结果。
6. 验证令牌过期、冻结、改密撤销、验证码冷却和错误状态。

这些步骤未在本次连接真实服务执行，不构成运行验收。

## 7. OpenAPI 与实现的已知差异

当前 OpenAPI 已包含采集能力 true 的说明，不需要回退到旧“未实现”版本。尚存差异：

- OpenAPI 将完整编辑字段全部列 required，但 Go 绑定对部分 bool/int/string 使用零值，实际不会全部拒绝省略。
- SettingsUpdate 声明 additionalProperties=false，当前 ShouldBindJSON 未配置拒绝未知字段；至少一个已知非 null 字段仍由 service 校验。
- 密码 schema minLength/maxLength 按字符描述，实际后端按 UTF-8 字节数校验。
- 后端 FieldError 是 field/message，前端预留 field/reason/limit；当前接口不填充 errors，不能以此扩展做已实现承诺。

调用方按较严格契约发送完整数据；后续应统一实现与 schema，而不是依赖省略或未知字段的偶然兼容。
