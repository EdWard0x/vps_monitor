/**
 * 清理仅属于当前项目的 mock Service Worker 注册
 * 绝不注销属于其他业务或 PWA 的 Service Worker
 */
export async function cleanupProjectMockServiceWorker(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      const scriptURL =
        registration.active?.scriptURL ||
        registration.installing?.scriptURL ||
        registration.waiting?.scriptURL ||
        '';

      if (scriptURL.includes('mockServiceWorker.js')) {
        await registration.unregister();
      }
    }
  } catch (err) {
    // 静默忽略清理异常，避免阻塞主入口加载
    console.warn('清理 Mock Service Worker 失败:', err);
  }
}
