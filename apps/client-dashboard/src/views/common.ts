import { state } from "../state.js";
import { escapeHtml } from "../ui/format.js";
import type { OperatorOrder } from "../model.js";
import { formatOrderStatus } from "../model.js";

export function renderBanner() {
  if (!state.errorMessage && !state.notice) {
    return "";
  }
  const toneClass = state.errorMessage ? "banner banner--error" : "banner banner--notice";
  const message = state.errorMessage ?? state.notice ?? "";
  return `<div class="${toneClass}">${escapeHtml(message)}</div>`;
}

export function renderSectionHeading(config: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: string;
}) {
  return `
    <div class="dash-section-heading">
      <div>
        <div class="dash-panel-title">${escapeHtml(config.eyebrow)}</div>
        <h2 class="dash-section-title">${escapeHtml(config.title)}</h2>
        ${config.description ? `<p class="muted-copy">${escapeHtml(config.description)}</p>` : ""}
      </div>
      ${config.actions ? `<div class="dash-section-actions">${config.actions}</div>` : ""}
    </div>
  `;
}

export function renderLocationSelectionNotice(message: string) {
  return `<article class="dash-surface dash-empty-surface"><p class="muted-copy">${escapeHtml(message)}</p></article>`;
}

function getOrderStatusTone(status: OperatorOrder["status"]) {
  switch (status) {
    case "READY":
    case "COMPLETED":
      return "success";
    case "CANCELED":
      return "danger";
    case "IN_PREP":
      return "warning";
    case "PENDING_PAYMENT":
    default:
      return "neutral";
  }
}

export function renderOrderStatusBadge(status: OperatorOrder["status"]) {
  return `<span class="dash-status-badge dash-status-badge--${getOrderStatusTone(status)}">${escapeHtml(formatOrderStatus(status))}</span>`;
}
