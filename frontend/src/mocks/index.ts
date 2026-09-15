/**
 * 依据需求文档，运行时完全禁用 MSW Service Worker 拦截与假数据回退
 */
export async function enableMocking(): Promise<void> {
  // 核心要求：不使用 mock、MSW 拦截，开发和生产均不注册 mock Service Worker
  return;
}

