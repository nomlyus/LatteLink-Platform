import { createToast, markToastDismissing, removeToast } from "./state.js";

export const toastVisibleDurationMs = 10_000;
export const toastFadeDurationMs = 300;

type ToastTimers = {
  visible: ReturnType<typeof setTimeout>;
  fade: ReturnType<typeof setTimeout> | null;
};

const toastTimers = new Map<string, ToastTimers>();
let renderToasts = () => {};

export function setToastRenderHandler(handler: () => void) {
  renderToasts = handler;
}

export function addToast(message: string, tone: "success" | "error" | "notice" = "notice") {
  const id = createToast(message, tone);
  const timers: ToastTimers = {
    visible: setTimeout(() => {
      markToastDismissing(id);
      renderToasts();
      timers.fade = setTimeout(() => {
        toastTimers.delete(id);
        removeToast(id);
        renderToasts();
      }, toastFadeDurationMs);
    }, toastVisibleDurationMs),
    fade: null
  };

  toastTimers.set(id, timers);
  return id;
}

export function dismissToast(id: string) {
  const timers = toastTimers.get(id);
  if (timers) {
    clearTimeout(timers.visible);
    if (timers.fade) {
      clearTimeout(timers.fade);
    }
    toastTimers.delete(id);
  }
  removeToast(id);
}

export function resetToastRuntime() {
  for (const timers of toastTimers.values()) {
    clearTimeout(timers.visible);
    if (timers.fade) {
      clearTimeout(timers.fade);
    }
  }
  toastTimers.clear();
  renderToasts = () => {};
}
