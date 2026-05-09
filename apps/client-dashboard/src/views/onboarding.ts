import { isOnboardingIncomplete } from "../model.js";
import { state } from "../state.js";
import { escapeHtml } from "../ui/format.js";
import { renderSectionHeading } from "./common.js";

const clientSetupSteps = [
  {
    id: "business_profile_complete",
    label: "Store profile",
    shortLabel: "Profile",
    action: "Review store details"
  },
  {
    id: "store_operations_complete",
    label: "Hours and pickup",
    shortLabel: "Details",
    action: "Review store details"
  },
  {
    id: "payments_connected",
    label: "Payments",
    shortLabel: "Payments",
    action: "Connect Stripe"
  },
  {
    id: "menu_ready",
    label: "Menu",
    shortLabel: "Menu",
    action: "Review menu"
  },
  {
    id: "team_configured_or_skipped",
    label: "Team access",
    shortLabel: "Team",
    action: "Review team"
  },
  {
    id: "test_order_completed",
    label: "Test order",
    shortLabel: "Test order",
    action: "Run test order"
  }
] as const;

const mobileReleaseTimeline = [
  { status: "not_started", label: "Not started" },
  { status: "metadata_ready", label: "App profile ready" },
  { status: "metadata_pending", label: "App profile pending" },
  { status: "build_configuring", label: "Build in progress" },
  { status: "build_ready", label: "Build ready" },
  { status: "submitted_for_review", label: "Submitted to App Store" },
  { status: "approved", label: "Approved" },
  { status: "ready_for_launch", label: "Ready for launch" },
  { status: "live", label: "Live" }
];

function checklistItem(id: string) {
  return state.onboardingSummary?.checklist.find((item) => item.id === id) ?? null;
}

function isStepComplete(id: string) {
  return checklistItem(id)?.passed === true;
}

function remainingClientSteps() {
  return clientSetupSteps.filter((step) => !isStepComplete(step.id));
}

function mobileReleaseStatusLabel(status: string | undefined, statusLabel?: string) {
  return statusLabel ?? mobileReleaseTimeline.find((item) => item.status === status)?.label ?? "Not started";
}

function renderSetupStepPills() {
  return `
    <div class="onboarding-pill-row">
      ${clientSetupSteps
        .map(
          (step) => `
            <span class="onboarding-pill ${isStepComplete(step.id) ? "onboarding-pill--complete" : ""}">
              ${escapeHtml(step.shortLabel)}
            </span>
          `
        )
        .join("")}
    </div>
  `;
}

function renderPrimarySetupAction() {
  const remaining = remainingClientSteps();
  const next = remaining[0];
  const summary = state.onboardingSummary;

  if (summary?.readyForReview && summary.status !== "ready_for_review" && !summary.submittedForReviewAt) {
    return `
      <button class="button button--primary" type="button" data-action="submit-onboarding-review" ${state.updatingOnboarding ? "disabled" : ""}>
        Submit to Nomly
      </button>
    `;
  }

  if (!next && summary?.readyForReview) {
    return `
      <button class="button button--primary" type="button" data-action="submit-onboarding-review" ${state.updatingOnboarding ? "disabled" : ""}>
        Submit to Nomly
      </button>
    `;
  }

  if (!next) {
    return "";
  }

  if (next.id === "business_profile_complete" || next.id === "store_operations_complete") {
    return `
      <button class="button button--primary" type="button" data-action="open-onboarding-wizard" data-onboarding-step="2">
        ${escapeHtml(next.action)}
      </button>
    `;
  }

  if (next.id === "payments_connected") {
    return `
      <button class="button button--primary" type="button" data-action="start-stripe-onboarding" ${state.updatingOnboarding ? "disabled" : ""}>
        Connect Stripe
      </button>
    `;
  }

  const targetSection =
    next.id === "menu_ready" ? "menu" : next.id === "team_configured_or_skipped" ? "team" : "orders";

  return `
    <button class="button button--primary" type="button" data-action="set-section" data-section="${targetSection}">
      ${escapeHtml(next.action)}
    </button>
  `;
}

function renderLaunchSetupCard() {
  const summary = state.onboardingSummary;
  if (!summary) return "";

  const remaining = remainingClientSteps();
  const submitted = summary.status === "ready_for_review" || Boolean(summary.submittedForReviewAt);
  const title = submitted
    ? "Setup submitted"
    : remaining.length === 0 && summary.readyForReview
      ? "Ready for Nomly review"
      : remaining.length === 0
        ? "Client setup complete"
      : `${remaining.length} setup ${remaining.length === 1 ? "item" : "items"} left`;
  const description = submitted
    ? "Nomly is reviewing your launch details and preparing the mobile release."
    : remaining.length === 0 && summary.readyForReview
      ? "Everything client-side is complete. Send it to Nomly for launch review."
      : remaining.length === 0
        ? "Everything client-side is complete. Nomly is checking launch readiness."
      : `Next: ${remaining[0]?.action ?? "Finish setup"}.`;

  return `
    ${renderSectionHeading({
      eyebrow: "Launch setup",
      title: summary.status === "live" ? "App is live" : summary.status === "approved" ? "Launch approved" : title,
      description
    })}
    <article class="dash-surface onboarding-summary-card">
      <div class="onboarding-summary-card__main">
        ${renderSetupStepPills()}
        ${
          remaining.length > 0 && !submitted
            ? `
              <ul class="onboarding-short-list">
                ${remaining.map((step) => `<li>${escapeHtml(step.label)}</li>`).join("")}
              </ul>
            `
            : `<p class="muted-copy">Nomly handles App Store setup, build submission, launch approval, and release updates from here.</p>`
        }
      </div>
      <div class="onboarding-summary-card__actions">
        ${submitted || summary.status === "approved" || summary.status === "live" ? "" : renderPrimarySetupAction()}
        <button class="button button--secondary" type="button" data-action="open-onboarding-wizard">
          Open setup
        </button>
      </div>
    </article>
  `;
}

function shouldShowLaunchStatus() {
  const summary = state.onboardingSummary;
  return Boolean(
    summary?.mobileRelease ||
      summary?.status === "ready_for_review" ||
      summary?.status === "approved" ||
      summary?.status === "live" ||
      summary?.submittedForReviewAt
  );
}

function renderLaunchStatusCard() {
  if (!shouldShowLaunchStatus()) {
    return "";
  }

  const summary = state.onboardingSummary;
  const release = summary?.mobileRelease;
  const status = summary?.status === "live" ? "live" : release?.status ?? "not_started";
  const label = mobileReleaseStatusLabel(status, release?.statusLabel);
  const updatedAt = release?.updatedAt ? new Date(release.updatedAt).toLocaleString() : null;

  return `
    <article class="dash-surface onboarding-status-card">
      <div>
        <div class="dash-panel-title">Mobile release</div>
        <h3 class="dash-surface-title">${escapeHtml(label)}</h3>
        <p class="muted-copy">
          ${updatedAt ? `Updated ${escapeHtml(updatedAt)}.` : "Nomly updates this as the app moves through release."}
        </p>
      </div>
      <div class="onboarding-status-card__meta">
        ${release?.buildNumber ? `<div><span>Build</span><strong>${escapeHtml(release.buildNumber)}</strong></div>` : ""}
        ${release?.testFlightUrl ? `<a class="button button--secondary" href="${escapeHtml(release.testFlightUrl)}">TestFlight</a>` : ""}
        ${release?.appStoreUrl ? `<a class="button button--secondary" href="${escapeHtml(release.appStoreUrl)}">App Store</a>` : ""}
        ${release?.blockedReason ? `<p class="muted-copy">Blocked: ${escapeHtml(release.blockedReason)}</p>` : ""}
      </div>
    </article>
  `;
}

function renderIntegrationsCard() {
  return `
    <article class="dash-surface onboarding-integrations-card">
      <div>
        <div class="dash-panel-title">Integrations</div>
        <h3 class="dash-surface-title">Optional connectors</h3>
        <p class="muted-copy">Clover, Toast, and Square are optional and can be connected later when a location needs external sync.</p>
      </div>
      <span class="dash-status-badge dash-status-badge--neutral">Optional</span>
    </article>
  `;
}

function renderWizardSteps() {
  const labels = ["Start", "Details", "Payments", "Finish"];
  const step = state.onboardingWizardStep;
  return `
    <div class="dash-wizard-steps" aria-label="Setup progress">
      ${labels
        .map(
          (label, index) => `
            <div class="dash-wizard-step ${step === index + 1 ? "dash-wizard-step--active" : step > index + 1 ? "dash-wizard-step--complete" : ""}">
              <span>${index + 1}</span>
              <strong>${escapeHtml(label)}</strong>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderWizardWelcome() {
  return `
    <div class="dash-wizard-body dash-wizard-body--stacked onboarding-wizard-panel">
      <div>
        <div class="dash-panel-title">Launch setup</div>
        <h3 class="dash-surface-title">We only need the essentials first.</h3>
        <p class="muted-copy">Confirm store details, connect Stripe, then Nomly will review the launch and manage the mobile release.</p>
      </div>
      ${renderSetupStepPills()}
    </div>
    <div class="dash-wizard-actions">
      <button class="button button--ghost" type="button" data-action="close-onboarding-wizard">Close</button>
      <button class="button button--primary" type="button" data-action="onboarding-wizard-next">Continue</button>
    </div>
  `;
}

function renderWizardStoreDetails() {
  if (!state.storeConfig) {
    return `
      <div class="dash-wizard-body">
        <article class="dash-empty-surface">
          <p class="muted-copy">Store configuration is loading.</p>
        </article>
      </div>
      <div class="dash-wizard-actions">
        <button class="button button--secondary" type="button" data-action="onboarding-wizard-prev">Back</button>
      </div>
    `;
  }

  return `
    <form class="dash-wizard-form" data-form="onboarding-store-basics">
      <div class="dash-wizard-body dash-wizard-body--stacked">
        <label class="field">
          <span>Store name</span>
          <input name="storeName" value="${escapeHtml(state.storeConfig.storeName)}" required />
        </label>
        <label class="field">
          <span>Location name</span>
          <input name="locationName" value="${escapeHtml(state.storeConfig.locationName)}" required />
        </label>
        <label class="field">
          <span>Hours</span>
          <input name="hours" value="${escapeHtml(state.storeConfig.hours)}" required />
        </label>
        <label class="field">
          <span>Pickup instructions</span>
          <textarea name="pickupInstructions" rows="4" required>${escapeHtml(state.storeConfig.pickupInstructions)}</textarea>
        </label>
      </div>
      <div class="dash-wizard-actions">
        <button class="button button--secondary" type="button" data-action="onboarding-wizard-prev" ${state.updatingOnboarding ? "disabled" : ""}>Back</button>
        <button class="button button--primary" type="submit" ${state.updatingOnboarding ? "disabled" : ""}>
          ${state.updatingOnboarding ? "Saving..." : "Save and continue"}
        </button>
      </div>
    </form>
  `;
}

function renderWizardPayments() {
  const readiness = state.onboardingSummary?.paymentReadiness;
  const stripe = state.appConfig?.paymentCapabilities.stripe;
  const dashboardAvailable = stripe?.dashboardEnabled === true;
  const paymentsComplete = isStepComplete("payments_connected");
  const paymentCopy = paymentsComplete
    ? "Stripe is connected for this location."
    : readiness?.onboardingState && readiness.onboardingState !== "unconfigured"
      ? "Stripe needs a little more information before launch."
      : "Only owner accounts can connect payments.";

  return `
    <div class="dash-wizard-body dash-wizard-body--stacked onboarding-wizard-panel">
      <div>
        <div class="dash-panel-title">Payments</div>
        <h3 class="dash-surface-title">${paymentsComplete ? "Payments connected" : "Connect Stripe"}</h3>
        <p class="muted-copy">${escapeHtml(paymentCopy)}</p>
      </div>
      <div class="onboarding-payment-actions">
        <button class="button button--primary" type="button" data-action="start-stripe-onboarding" ${state.updatingOnboarding || paymentsComplete ? "disabled" : ""}>
          ${paymentsComplete ? "Stripe connected" : "Connect Stripe"}
        </button>
        <button class="button button--secondary" type="button" data-action="open-stripe-dashboard" ${state.updatingOnboarding || !dashboardAvailable ? "disabled" : ""}>
          Open Stripe Express
        </button>
      </div>
    </div>
    <div class="dash-wizard-actions">
      <button class="button button--secondary" type="button" data-action="onboarding-wizard-prev">Back</button>
      <button class="button button--primary" type="button" data-action="onboarding-wizard-next">Continue</button>
    </div>
  `;
}

function renderWizardFinish() {
  const summary = state.onboardingSummary;
  const remaining = remainingClientSteps();
  const canSubmit = summary?.readyForReview === true && summary.status !== "ready_for_review" && !summary.submittedForReviewAt;

  return `
    <div class="dash-wizard-body dash-wizard-body--stacked onboarding-wizard-panel">
      <div>
        <div class="dash-panel-title">Finish</div>
        <h3 class="dash-surface-title">${remaining.length === 0 ? "Ready for Nomly review" : "Setup is saved"}</h3>
        <p class="muted-copy">
          ${
            remaining.length === 0
              ? "Nomly will review the launch details, prepare the app build, and update release progress here."
              : `Still left: ${remaining.map((step) => step.label).join(", ")}.`
          }
        </p>
      </div>
      ${renderLaunchStatusCard()}
    </div>
    <div class="dash-wizard-actions">
      <button class="button button--secondary" type="button" data-action="onboarding-wizard-prev">Back</button>
      <div class="dash-wizard-actions__group">
        ${
          canSubmit
            ? `<button class="button button--primary" type="button" data-action="submit-onboarding-review" ${state.updatingOnboarding ? "disabled" : ""}>Submit to Nomly</button>`
            : ""
        }
        <button class="button button--primary" type="button" data-action="close-onboarding-wizard">Done</button>
      </div>
    </div>
  `;
}

function renderWizardBody() {
  switch (state.onboardingWizardStep) {
    case 2:
      return renderWizardStoreDetails();
    case 3:
      return renderWizardPayments();
    case 4:
      return renderWizardFinish();
    case 1:
    default:
      return renderWizardWelcome();
  }
}

export function renderOnboardingSection() {
  const summary = state.onboardingSummary;
  if (!summary) {
    return "";
  }

  if (!isOnboardingIncomplete(summary.status)) {
    return `
      ${renderSectionHeading({
        eyebrow: "Launch setup",
        title: summary.status === "live" ? "App is live" : summary.status === "approved" ? "Launch approved" : "Setup is complete",
        description: "Nomly manages release updates from here."
      })}
      ${renderLaunchStatusCard()}
      ${renderIntegrationsCard()}
    `;
  }

  return `
    ${renderLaunchSetupCard()}
    ${renderLaunchStatusCard()}
    ${renderIntegrationsCard()}
  `;
}

export function renderOnboardingWizard() {
  const summary = state.onboardingSummary;
  if (!state.onboardingWizardOpen || !summary || !isOnboardingIncomplete(summary.status)) {
    return "";
  }

  return `
    <div class="dash-modal" role="presentation">
      <button
        class="dash-modal__backdrop"
        type="button"
        data-action="close-onboarding-wizard"
        aria-label="Close setup wizard"
        ${state.updatingOnboarding ? "disabled" : ""}
      ></button>
      <div class="dash-modal__dialog dash-modal__dialog--onboarding" role="dialog" aria-modal="true" aria-labelledby="onboarding-wizard-title">
        <div class="dash-modal__header">
          <div>
            <div class="dash-panel-title">Setup wizard</div>
            <h3 class="dash-surface-title" id="onboarding-wizard-title">${escapeHtml(summary.brandName)} launch setup</h3>
          </div>
          <button class="button button--ghost" type="button" data-action="close-onboarding-wizard" ${state.updatingOnboarding ? "disabled" : ""}>
            Close
          </button>
        </div>
        ${renderWizardSteps()}
        ${renderWizardBody()}
      </div>
    </div>
  `;
}
