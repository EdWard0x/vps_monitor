# VPS Monitor 前端

React + TypeScript + Vite 前端已对接当前 `/api/v1` 真实接口，包括公开目录、认证与找回密码、个人中心、商家/VPS/用户管理、冻结、站点设置和管理看板。

## 启动

```bash
cd frontend
npm ci
npm run dev
```

开发服务器将 `/api` 代理到 `http://127.0.0.1:8080`。普通请求支持 `VITE_API_BASE_URL`，但当前启动认证仍默认 `/api/v1`，直连其他地址前需统一配置路径，详见 [`../docs/frontend.md`](../docs/frontend.md)。请求始终携带 Cookie；Access Token 仅保存在内存，Refresh Token 由后端 HttpOnly Cookie 管理。

运行时默认不启用 MSW 或演示数据。`src/mocks` 只用于显式预览/测试，只有手工调用 `enableMocking()` 且设置 `VITE_MOCK_API=true` 才会启用。

## 验证

```bash
npm test
npm run build
```

业务类型和错误码应与 [`../docs/openapi.yaml`](../docs/openapi.yaml) 保持一致。后端已接入采集，当前 `collector_implemented=true`，只表示代码能力，不表示 Worker 在线。前端保存三级采集许可并通过 HTTP 查询库存，不连接 Redis。完整页面/状态说明见 [`../docs/frontend.md`](../docs/frontend.md)，联调速查见 [`../docs/frontend-collection-sync.md`](../docs/frontend-collection-sync.md)。
