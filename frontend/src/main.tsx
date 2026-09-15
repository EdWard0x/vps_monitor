import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles/index.css';
import { cleanupProjectMockServiceWorker } from './lib/cleanMockWorker';

// 启动时清理以前可能注册的本项目 mock Service Worker，确保全链路走真实 API 请求
cleanupProjectMockServiceWorker();

// 默认直接挂载真实 API 应用，不启用 mock 或伪造认证态
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

