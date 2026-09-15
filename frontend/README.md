# VPS Monitor 前端

React + TypeScript + Vite 前端已对接当前 `/api/v1` 真实接口，包括公开目录、认证与找回密码、个人中心、商家/VPS/用户管理、冻结、站点设置和管理看板。

## 启动

```bash
cd frontend
npm ci
npm run dev
```

开发服务器将 `/api` 代理到 `http://127.0.0.1:8080`。如需直连其他后端，可设置 `VITE_API_BASE_URL`。请求始终携带 Cookie；Access Token 仅保存在内存，Refresh Token 由后端 HttpOnly Cookie 管理。

运行时默认不启用 MSW 或演示数据。`src/mocks` 只用于显式预览/测试，只有手工调用 `enableMocking()` 且设置 `VITE_MOCK_API=true` 才会启用。

## 验证

```bash
npm test
npm run build
```

业务类型和错误码应与 [`../docs/openapi.yaml`](../docs/openapi.yaml) 保持一致。当前采集器未接入：后台可以保存全局、商家和 VPS 三层采集许可，但 `collector_implemented=false` 时界面只说明配置已保存，不显示采集进度或成功状态。
