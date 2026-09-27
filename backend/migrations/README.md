# Database migrations

迁移文件使用 `<version>_<name>.up.sql` 和 `<version>_<name>.down.sql` 成对命名。版本必须为正整数且不可重复。

`cmd/migrate` 会：

- 在 PostgreSQL 事务内取得 advisory lock，避免多个实例并发迁移；
- 用 `schema_migrations` 记录版本、名称、SHA-256 校验和和应用时间；
- 拒绝缺失文件、非连续历史或已应用文件被修改的情况；
- `up` 按升序应用全部待执行版本，`down` 只回滚最近一个版本；
- 任一语句失败时回滚本次命令的全部变更。

同一迁移文件中的独立 PostgreSQL 语句以单独一行 `-- migrate:split` 分隔。不要在 SQL 字符串或过程体内部使用该标记。

```bash
go run ./cmd/migrate status --dir migrations
go run ./cmd/migrate up --dir migrations
go run ./cmd/migrate down --dir migrations
```

`001_initial` 是当前架构的全新数据库基线，包含 users、fronze、merchant、vps_detail、vps_stocks、site_settings、user_mail_verifications 和 password_reset_requests，以及三级采集开关、邮件挑战字段和 Redis Stream delivery_id。它不负责转换旧库；旧库升级必须另写数据转换迁移并先备份数据库。

`002_notifications` 在基线上新增 users.notice_enabled、users.server_turbo_key、notices 表及 `(user_id, vps_id)` 联合唯一约束，并补齐当前 VPS 模型的 has_stock 列。库存通知的有货判断仍以 vps_stocks.status 为准，has_stock 不代替库存采集结果。新用户字段默认关闭通知、Key 为空，保留原有用户与库存数据。

`003_stock_status` 允许库存状态 4（有货但数量未知），不改写历史状态 3；重新采集后更新。回滚时将 4 转为 1 并保留空数量和时间。

当前 API 就绪检查要求迁移版本为 3。新增迁移时同步更新 `service.RequiredMigrationVersion`，由迁移测试检查版本一致性。回滚 002 会删除新增表和列及其中通知数据；正常启动仅执行 up，不执行 down。
