export function registerLegacyBrowserLifecycle(
  signal: AbortSignal,
  handlers: {
    online: () => void;
    offline: () => void;
    visible: () => void;
  }
) {
  window.addEventListener("online", handlers.online, { signal });
  window.addEventListener("offline", handlers.offline, { signal });
  document.addEventListener("visibilitychange", handlers.visible, { signal });
}
