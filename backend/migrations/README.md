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
