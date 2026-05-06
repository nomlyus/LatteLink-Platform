import { isOnboardingIncomplete } from "../model.js";
import { state } from "../state.js";
import { escapeHtml } from "../ui/format.js";
import { renderSectionHeading } from "./common.js";

const editableStepFields: Record<string, string> = {
  business_profile_complete: "businessProfileComplete",
  store_operations_complete: "storeOperationsComplete",
  menu_ready: "menuReady",
  team_configured_or_skipped: "teamConfiguredOrSkipped",
  test_order_completed: "testOrderCompleted"
};

function checklistItem(id: string) {
  return state.onboardingSummary?.checklist.find((item) => item.id === id) ?? null;
}

function stepTone(status: string | undefined) {
  if (status === "complete") return "success";
  if (status === "blocked") return "danger";
  return "neutral";
}

function renderStepStatus(id: string) {
  const item = checklistItem(id);
  const tone = stepTone(item?.status);
  return `<span class="dash-status-badge dash-status-badge--${tone}">${escapeHtml(item?.status ?? "pending")}</span>`;
}

function renderMarkCompleteForm(id: string, label: string) {
  const item = checklistItem(id);
  const field = editableStepFields[id];
  if (!field || item?.passed) {
    return "";
  }

  return `
    <form data-form="onboarding-step" data-onboarding-field="${escapeHtml(field)}">
      <button class="button button--secondary" type="submit" ${state.updatingOnboarding ? "disabled" : ""}>${escapeHtml(label)}</button>
    </form>
  `;
}

function renderStep(config: {
  id: string;
  title: string;
  body: string;
  targetSection?: string;
  completeLabel?: string;
  optional?: boolean;
}) {
  const item = checklistItem(config.id);
  const detail = item?.detail ? `<p class="muted-copy">${escapeHtml(item.detail)}</p>` : "";
  const openAction = config.targetSection
    ? `
      <button class="button button--secondary" type="button" data-action="set-section" data-section="${escapeHtml(config.targetSection)}">
        Open
      </button>
    `
    : "";
  const completeAction = config.completeLabel ? renderMarkCompleteForm(config.id, config.completeLabel) : "";

  return `
    <article class="onboarding-step ${item?.passed ? "onboarding-step--complete" : ""}">
      <div class="onboarding-step__main">
        <div class="onboarding-step__status">${renderStepStatus(config.id)}</div>
        <h3>${escapeHtml(config.title)}</h3>
        <p>${escapeHtml(config.body)}</p>
        ${detail}
        ${config.optional ? `<span class="onboarding-step__optional">Optional</span>` : ""}
      </div>
      <div class="onboarding-step__actions">
        ${openAction}
        ${completeAction}
      </div>
    </article>
  `;
}

function renderOptionalConnectorsStep() {
  return `
    <article class="onboarding-step">
      <div class="onboarding-step__main">
        <div class="onboarding-step__status"><span class="dash-status-badge dash-status-badge--neutral">optional</span></div>
        <h3>Optional connectors</h3>
        <p>Clover, Toast, and Square can be connected when a location needs external menu or order sync.</p>
        <span class="onboarding-step__optional">Optional</span>
      </div>
    </article>
  `;
}

function renderLaunchReview() {
  const summary = state.onboardingSummary;
  if (!summary) return "";
  const submitted = summary.status === "ready_for_review" || Boolean(summary.submittedForReviewAt);
  const launchStatus = checklistItem("admin_launch_approved");
  const mobileStatus = checklistItem("mobile_release_ready");

  return `
    <article class="onboarding-review">
      <div>
        <div class="dash-panel-title">Launch review</div>
        <h3>${submitted ? "Setup submitted" : summary.readyForReview ? "Ready for review" : "Setup still in progress"}</h3>
        <p class="muted-copy">
          Mobile release: ${escapeHtml(mobileStatus?.status ?? "pending")} · Launch approval: ${escapeHtml(launchStatus?.status ?? "pending")}
        </p>
      </div>
      ${
        summary.readyForReview && !submitted
          ? `
            <button class="button button--primary" type="button" data-action="submit-onboarding-review" ${state.updatingOnboarding ? "disabled" : ""}>
              Submit for review
            </button>
          `
          : ""
      }
    </article>
  `;
}

export function renderOnboardingSection() {
  const summary = state.onboardingSummary;
  if (!summary || !isOnboardingIncomplete(summary.status)) {
    return `
      ${renderSectionHeading({
        eyebrow: "Setup",
        title: "Setup is complete",
        description: "Your launch setup is no longer waiting on client-side onboarding."
      })}
    `;
  }

  const completed = summary.checklist.filter((item) => item.passed).length;
  const total = summary.checklist.length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  return `
    ${renderSectionHeading({
      eyebrow: "Setup",
      title: `${summary.brandName} onboarding`,
      description: `${summary.locationName} · ${summary.marketLabel}`
    })}

    <section class="onboarding-hero">
      <div>
        <div class="dash-panel-title">Progress</div>
        <strong>${completed}/${total} complete</strong>
        <p class="muted-copy">Status: ${escapeHtml(summary.status.replaceAll("_", " "))}</p>
      </div>
      <div class="onboarding-progress" aria-label="Onboarding progress">
        <span style="width: ${progress}%"></span>
      </div>
    </section>

    <section class="onboarding-steps">
      ${renderStep({
        id: "business_profile_complete",
        title: "Business profile",
        body: "Confirm the client-facing business name and location identity.",
        targetSection: "store",
        completeLabel: "Mark complete"
      })}
      ${renderStep({
        id: "store_operations_complete",
        title: "Store operations",
        body: "Confirm pickup instructions, hours, and operational defaults.",
        targetSection: "store",
        completeLabel: "Mark complete"
      })}
      ${renderStep({
        id: "payments_connected",
        title: "Payments",
        body: "Connect and complete the required payment account before launch."
      })}
      ${renderOptionalConnectorsStep()}
      ${renderStep({
        id: "menu_ready",
        title: "Menu",
        body: "Review visible menu items and mark the launch menu ready.",
        targetSection: "menu",
        completeLabel: "Mark ready"
      })}
      ${renderStep({
        id: "team_configured_or_skipped",
        title: "Team",
        body: "Invite store users or skip team setup for launch.",
        targetSection: "team",
        completeLabel: "Complete or skip"
      })}
      ${renderStep({
        id: "test_order_completed",
        title: "Test order",
        body: "Run a full test order before submitting for review.",
        targetSection: "orders",
        completeLabel: "Mark tested"
      })}
    </section>

    ${renderLaunchReview()}
  `;
}
