# Backend acceptance

Validation date: 2026-09-07. The dedicated database is defined by `compose.test.yml`; no existing business database was used.

## Passed

- OpenAPI 3.1 YAML parses successfully; 37 paths cover every v1 route in `03-api.md`.
- `go test ./... -count=1` passes with isolated PostgreSQL schemas; `go vet ./...` passes.
- PostgreSQL constraints, unique keys, null/zero updates and transaction rollback.
- Argon2id, Access/Refresh type separation, CSRF, current database role/session checks and multi-session listing/revocation.
- Strict refresh rotation: one concurrent winner; replay commits session revocation and returns 401/200010.
- SQL comment search, anonymous public projection, five-level model, per-parent signed cursor, placeholders and author/admin deletion rules.
- Admin CRUD, current-role authorization, last-enabled-admin serialization, settings transaction and monitor config version conflict.
- Worker lease competition/reclaim safety, stale result rejection and MockCollector results 1/2/3.
- Read-only comparison with the real frontend request modules and TypeScript DTOs found no contract mismatch.

## Local integration accounts

After starting `compose.test.yml`, the currently initialized test database on `127.0.0.1:55432` contains:

- administrator: `integration_admin` / `Admin-Integration-2026!`
- normal user: `integration_user` / `User-Integration-2026!`

These are deliberately local integration credentials, not production defaults. Re-running migration down/up removes them. The disabled `demo_*` seed fixtures remain non-login history records.

## Deferred by the documented MVP boundary

MySQL migrations/driver, Elasticsearch/outbox, real merchant HTTP collectors, stock history, email/notification delivery, shared distributed rate limiting and a persistent audit table are not implemented. The application rejects unsupported search/database modes rather than silently claiming support.
