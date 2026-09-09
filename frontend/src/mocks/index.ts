export async function enableMocking(): Promise<void> {
  if (import.meta.env.VITE_MOCK_API !== 'true') {
    return;
  }

  const { worker } = await import('./browser');
  await worker.start({
    onUnhandledRequest: 'bypass',
    serviceWorker: {
      url: '/mockServiceWorker.js',
    },
  });
}
