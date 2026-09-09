# Backend

Go + Gin + GORM + PostgreSQL implementation of the v1 contract in `../docs/openapi.yaml`.

初学者请先阅读 [项目阅读与学习指南](../docs/13-learning-guide.md)，按商家查询、写入、认证、评论、监控的顺序配合代码中的中文注释学习。

## Local startup

1. Create a PostgreSQL database and copy `.env.example` to `.env`. API, worker and admin currently require `.env` in their working directory; existing process environment variables take precedence. Migrate and seed read process environment directly, so export `DATABASE_URL` for them and `DEMO_MODE=true` for demo seeding.
2. From `backend/`, run `go run ./cmd/migrate up` and optionally `go run ./cmd/seed --allow-demo` against a disposable demo database.
3. Create a real login account: `go run ./cmd/admin create --username admin --nickname 管理员`. The CLI prompts twice without echo on a terminal. Seed users are deliberately disabled and cannot log in.
4. Start `go run ./cmd/api` and, separately, `go run ./cmd/worker`.

For a non-admin integration user, either register through `POST /api/v1/auth/register` (after fetching CSRF) or create another administrator and downgrade it through the admin API. Development cookies are non-Secure and named `vps_csrf` / `vps_refresh`; production uses the documented `__Host-` names.

## Test database

`docker compose -f compose.test.yml up -d` starts a dedicated database on port 55432. Set `TEST_DATABASE_URL=postgres://vps_test:vps_test@127.0.0.1:55432/vps_monitor_test?sslmode=disable`, then run `go test ./...`. Integration tests refuse to run without this explicit variable.

MySQL, Elasticsearch/outbox, real merchant HTTP collectors, stock history and distributed rate limiting remain post-MVP extensions. `SEARCH_BACKEND` must be `sql`; the first release intentionally fails startup for unsupported modes.
