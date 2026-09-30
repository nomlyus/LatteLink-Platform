import { subscribeToAdminOrderStream, type AdminOrderStreamEvent, type AdminOrderStreamState, type OperatorSession } from "../../api";

export function mountOrdersRealtime(params: {
  session: OperatorSession;
  locationId: string;
  onEvent: (event: AdminOrderStreamEvent) => void;
  onStateChange: (state: AdminOrderStreamState) => void;
  subscribe?: typeof subscribeToAdminOrderStream;
}) {
  let active = true;
  const subscribe = params.subscribe ?? subscribeToAdminOrderStream;
  const unsubscribe = subscribe({
    session: params.session,
    locationId: params.locationId,
    onEvent: (event) => { if (active) params.onEvent(event); },
    onStateChange: (state) => { if (active) params.onStateChange(state); }
  });
  return () => {
    if (!active) return;
    active = false;
    unsubscribe();
  };
}

export function startOrdersPolling(
  refresh: () => void,
  intervalMs = 30_000,
  schedule: (callback: () => void, delay: number) => ReturnType<typeof setInterval> = setInterval,
  cancel: (handle: ReturnType<typeof setInterval>) => void = clearInterval
) {
  const timer = schedule(refresh, intervalMs);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    cancel(timer);
  };
}

export function createOrdersRequestEpoch() {
  let current = 0;
  return {
    begin() { current += 1; return current; },
    invalidate() { current += 1; },
    isCurrent(request: number) { return request === current; }
  };
}

export function registerOrdersBrowserLifecycle(handlers: { online: () => void; offline: () => void; visible: () => void }) {
  const controller = new AbortController();
  window.addEventListener("online", handlers.online, { signal: controller.signal });
  window.addEventListener("offline", handlers.offline, { signal: controller.signal });
  document.addEventListener("visibilitychange", handlers.visible, { signal: controller.signal });
  return () => controller.abort();
}
