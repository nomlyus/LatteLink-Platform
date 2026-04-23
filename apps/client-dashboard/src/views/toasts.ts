import { state } from "../state.js";
import { escapeHtml } from "../ui/format.js";

export function renderToasts() {
  if (state.toasts.length === 0) return "";
  const items = state.toasts
    .map(
      (toast) => `
        <div class="toast toast--${toast.tone}" role="alert">
          <span class="toast__message">${escapeHtml(toast.message)}</span>
          <button class="toast__dismiss" type="button" data-action="dismiss-toast" data-toast-id="${toast.id}" aria-label="Dismiss">&times;</button>
        </div>
      `
    )
    .join("");
  return `<div class="toast-container">${items}</div>`;
}
