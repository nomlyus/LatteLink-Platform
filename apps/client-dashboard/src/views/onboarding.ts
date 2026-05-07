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

function renderBusinessProfileStep() {
  const item = checklistItem("business_profile_complete");
  if (!state.storeConfig) {
    return renderStep({
      id: "business_profile_complete",
      title: "Business profile",
      body: "Confirm the client-facing business name and location identity.",
      targetSection: "store",
      completeLabel: "Mark complete"
    });
  }

  return `
    <article class="onboarding-step ${item?.passed ? "onboarding-step--complete" : ""}">
      <div class="onboarding-step__main">
        <div class="onboarding-step__status">${renderStepStatus("business_profile_complete")}</div>
        <h3>Business profile</h3>
        <p>Confirm the client-facing business name and location identity.</p>
        <form class="onboarding-inline-form" data-form="onboarding-business-profile">
          <label class="field">
            <span>Store name</span>
            <input name="storeName" value="${escapeHtml(state.storeConfig.storeName)}" required />
          </label>
          <label class="field">
            <span>Location name</span>
            <input name="locationName" value="${escapeHtml(state.storeConfig.locationName)}" required />
          </label>
          <button class="button button--primary" type="submit" ${state.updatingOnboarding ? "disabled" : ""}>Save profile</button>
        </form>
      </div>
    </article>
  `;
}

function renderStoreOperationsStep() {
  const item = checklistItem("store_operations_complete");
  if (!state.storeConfig) {
    return renderStep({
      id: "store_operations_complete",
      title: "Store operations",
      body: "Confirm pickup instructions, hours, and operational defaults.",
      targetSection: "store",
      completeLabel: "Mark complete"
    });
  }

  return `
    <article class="onboarding-step ${item?.passed ? "onboarding-step--complete" : ""}">
      <div class="onboarding-step__main">
        <div class="onboarding-step__status">${renderStepStatus("store_operations_complete")}</div>
        <h3>Store operations</h3>
        <p>Confirm pickup instructions, hours, and tax defaults.</p>
        <form class="onboarding-inline-form onboarding-inline-form--wide" data-form="onboarding-store-operations">
          <label class="field">
            <span>Hours</span>
            <input name="hours" value="${escapeHtml(state.storeConfig.hours)}" required />
          </label>
          <label class="field">
            <span>Tax rate basis points</span>
            <input name="taxRateBasisPoints" type="number" min="0" max="10000" step="1" value="${state.storeConfig.taxRateBasisPoints}" required />
          </label>
          <label class="field onboarding-inline-form__wide">
            <span>Pickup instructions</span>
            <textarea name="pickupInstructions" rows="3" required>${escapeHtml(state.storeConfig.pickupInstructions)}</textarea>
          </label>
          <button class="button button--primary" type="submit" ${state.updatingOnboarding ? "disabled" : ""}>Save operations</button>
        </form>
      </div>
    </article>
  `;
}

function renderPaymentsStep() {
  const item = checklistItem("payments_connected");
  const readiness = state.onboardingSummary?.paymentReadiness;
  const stripe = state.appConfig?.paymentCapabilities.stripe;
  const dashboardAvailable = stripe?.dashboardEnabled === true;
  const onboardingLabel =
    readiness?.onboardingState && readiness.onboardingState !== "unconfigured"
      ? "Continue Stripe onboarding"
      : "Connect Stripe";

  return `
    <article class="onboarding-step ${item?.passed ? "onboarding-step--complete" : ""}">
      <div class="onboarding-step__main">
        <div class="onboarding-step__status">${renderStepStatus("payments_connected")}</div>
        <h3>Payments</h3>
        <p>Connect and complete the required payment account before launch.</p>
        ${
          readiness
            ? `<p class="muted-copy">Stripe status: ${escapeHtml(readiness.onboardingState)}${readiness.missingRequiredFields.length > 0 ? ` · Missing ${escapeHtml(readiness.missingRequiredFields.join(", "))}` : ""}</p>`
            : ""
        }
      </div>
      <div class="onboarding-step__actions">
        <button class="button button--primary" type="button" data-action="start-stripe-onboarding" ${state.updatingOnboarding ? "disabled" : ""}>
          ${escapeHtml(onboardingLabel)}
        </button>
        <button class="button button--secondary" type="button" data-action="open-stripe-dashboard" ${state.updatingOnboarding || !dashboardAvailable ? "disabled" : ""}>
          Open Stripe Express
        </button>
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

const mobileReleaseTimeline = [
  { status: "not_started", label: "Release profile pending" },
  { status: "metadata_ready", label: "App metadata configured" },
  { status: "metadata_pending", label: "Apple identifiers pending" },
  { status: "build_configuring", label: "Build queued" },
  { status: "build_ready", label: "Build uploaded to TestFlight" },
  { status: "submitted_for_review", label: "Submitted for App Store review" },
  { status: "approved", label: "Approved" },
  { status: "ready_for_launch", label: "Ready for launch" },
  { status: "live", label: "Live" }
];

function mobileReleaseStatusLabel(status: string | undefined, statusLabel?: string) {
  return statusLabel ?? mobileReleaseTimeline.find((item) => item.status === status)?.label ?? "Release profile pending";
}

function renderMobileReleaseTimeline() {
  const release = state.onboardingSummary?.mobileRelease;
  const status = release?.status ?? "not_started";
  const activeIndex = mobileReleaseTimeline.findIndex((item) => item.status === status);
  const normalizedActiveIndex = activeIndex >= 0 ? activeIndex : 0;
  const currentLabel = mobileReleaseStatusLabel(status, release?.statusLabel);
  const updatedAt = release?.updatedAt ? new Date(release.updatedAt).toLocaleString() : null;

  return `
    <article class="onboarding-release">
      <div class="onboarding-release__header">
        <div>
          <div class="dash-panel-title">Mobile release</div>
          <h3>${escapeHtml(currentLabel)}</h3>
          <p class="muted-copy">
            Nomly manages App Store setup, build submission, and launch approval. This timeline is read-only.
            ${updatedAt ? `Updated ${escapeHtml(updatedAt)}.` : ""}
          </p>
        </div>
        <span class="dash-status-badge dash-status-badge--${status === "blocked" ? "danger" : ["approved", "ready_for_launch", "live"].includes(status) ? "success" : "warning"}">
          ${escapeHtml(status === "blocked" ? "blocked" : currentLabel)}
        </span>
      </div>
      <div class="timeline-stack onboarding-release__timeline">
        ${mobileReleaseTimeline
          .map((item, index) => {
            const passed = status === "live" || index < normalizedActiveIndex;
            const current = item.status === status;
            const tone = passed ? "success" : current ? "warning" : "neutral";
            return `
              <div class="timeline-row">
                <span class="dash-status-badge dash-status-badge--${tone}">${passed ? "done" : current ? "current" : "pending"}</span>
                <strong>${escapeHtml(item.label)}</strong>
              </div>
            `;
          })
          .join("")}
      </div>
      ${
        release?.buildNumber || release?.testFlightUrl || release?.appStoreUrl || release?.blockedReason
          ? `
            <dl class="onboarding-release__meta">
              ${release.buildNumber ? `<div><dt>Build</dt><dd>${escapeHtml(release.buildNumber)}</dd></div>` : ""}
              ${release.testFlightUrl ? `<div><dt>TestFlight</dt><dd><a href="${escapeHtml(release.testFlightUrl)}">${escapeHtml(release.testFlightUrl)}</a></dd></div>` : ""}
              ${release.appStoreUrl ? `<div><dt>App Store</dt><dd><a href="${escapeHtml(release.appStoreUrl)}">${escapeHtml(release.appStoreUrl)}</a></dd></div>` : ""}
              ${release.blockedReason ? `<div><dt>Blocker</dt><dd>${escapeHtml(release.blockedReason)}</dd></div>` : ""}
            </dl>
          `
          : ""
      }
    </article>
  `;
}

function renderLaunchReview() {
  const summary = state.onboardingSummary;
  if (!summary) return "";
  const submitted = summary.status === "ready_for_review" || Boolean(summary.submittedForReviewAt);
  const launchStatus = checklistItem("admin_launch_approved");
  const mobileStatus = checklistItem("mobile_release_ready");
  const clientBlockers = new Set(["owner_invited", "owner_activated", "mobile_release_ready", "admin_launch_approved"]);
  const blockers = summary.checklist.filter((item) => !item.passed && !clientBlockers.has(item.id));

  return `
    <article class="onboarding-review">
      <div>
        <div class="dash-panel-title">Launch review</div>
        <h3>${submitted ? "Setup submitted" : summary.readyForReview ? "Ready for review" : "Setup still in progress"}</h3>
        <p class="muted-copy">
          Mobile release: ${escapeHtml(mobileStatus?.status ?? "pending")} · Launch approval: ${escapeHtml(launchStatus?.status ?? "pending")}
        </p>
        ${
          blockers.length > 0
            ? `
              <ul class="onboarding-blockers">
                ${blockers.map((item) => `<li>${escapeHtml(item.label)}${item.detail ? ` · ${escapeHtml(item.detail)}` : ""}</li>`).join("")}
              </ul>
            `
            : ""
        }
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
    const launchStatus = summary?.status === "live" ? "live" : summary?.status === "approved" ? "approved" : "complete";
    return `
      ${renderSectionHeading({
        eyebrow: "Setup",
        title: launchStatus === "live" ? "App is live" : launchStatus === "approved" ? "Launch approved" : "Setup is complete",
        description:
          launchStatus === "live"
            ? "Your app has been marked live by Nomly."
            : launchStatus === "approved"
              ? "Nomly approved this launch and is coordinating the live release."
              : "Your launch setup is no longer waiting on client-side onboarding."
      })}
      ${summary ? renderMobileReleaseTimeline() : ""}
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
      ${renderBusinessProfileStep()}
      ${renderStoreOperationsStep()}
      ${renderPaymentsStep()}
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

    ${renderMobileReleaseTimeline()}

    ${renderLaunchReview()}
  `;
}
