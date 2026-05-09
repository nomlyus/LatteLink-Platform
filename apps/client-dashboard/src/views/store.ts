import { isAllLocationsSelected, state } from "../state.js";
import { escapeHtml } from "../ui/format.js";
import { canUpdateStoreSettings, isOwnerOperator } from "../model.js";
import { renderLocationSelectionNotice, renderSectionHeading } from "./common.js";
import { renderOnboardingSection } from "./onboarding.js";

function renderOwnerSetupSettings() {
  if (!isOwnerOperator(state.session?.operator ?? null) || !state.onboardingSummary) {
    return "";
  }

  return `
    <section class="dash-section dash-section--settings-setup">
      ${renderOnboardingSection()}
    </section>
  `;
}

export function renderStoreSection() {
  const ownerSetup = renderOwnerSetupSettings();

  if (isAllLocationsSelected()) {
    return `
      ${ownerSetup}
      <section class="dash-section">
        ${renderSectionHeading({
          eyebrow: "Settings",
          title: "Choose a location",
          description: "Store configuration is managed one location at a time."
        })}
        ${renderLocationSelectionNotice("Pick a specific location from the workspace selector to update store hours, pickup instructions, and storefront labels.")}
      </section>
    `;
  }

  if (!state.storeConfig) {
    return `
      ${ownerSetup}
      <section class="dash-section">
        ${renderSectionHeading({
          eyebrow: "Settings",
          title: "Store configuration",
          description: "Loading the latest store configuration."
        })}
        <article class="dash-surface dash-empty-surface"><p class="muted-copy">Loading store configuration…</p></article>
      </section>
    `;
  }

  const canWrite = canUpdateStoreSettings(state.session?.operator ?? null);

  return `
    ${ownerSetup}
    <section class="dash-section">
      ${renderSectionHeading({
        eyebrow: "Settings",
        title: state.storeConfig.storeName,
        description: "Update the storefront title, location label, hours, and customer pickup instructions."
      })}
      <article class="dash-surface">
        <div class="dash-surface-head">
          <div>
            <div class="dash-panel-title">Store</div>
            <h3 class="dash-surface-title">${escapeHtml(state.storeConfig.locationName)}</h3>
          </div>
        </div>
        ${
          canWrite
            ? ""
            : `<p class="muted-copy">Store settings are read-only for your current role. Contact a store owner to make changes.</p>`
        }
        ${
          canWrite
            ? `
                <form class="dash-store-form" data-form="store-config">
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
                    <span>Tax rate basis points</span>
                    <input name="taxRateBasisPoints" type="number" min="0" max="10000" step="1" value="${state.storeConfig.taxRateBasisPoints}" required />
                  </label>
                  <label class="field dash-store-form__wide">
                    <span>Pickup instructions</span>
                    <textarea name="pickupInstructions" rows="4" required>${escapeHtml(state.storeConfig.pickupInstructions)}</textarea>
                  </label>
                  <div class="dash-form-actions dash-store-form__wide">
                    <button class="button button--primary" type="submit" ${state.savingStore ? "disabled" : ""}>
                      ${state.savingStore ? '<span class="spinner"></span>' : "Save store settings"}
                    </button>
                  </div>
                </form>
              `
            : `
                <div class="dash-detail-grid">
                  <div class="dash-detail-metric">
                    <span>Store name</span>
                    <strong>${escapeHtml(state.storeConfig.storeName)}</strong>
                  </div>
                  <div class="dash-detail-metric">
                    <span>Location name</span>
                    <strong>${escapeHtml(state.storeConfig.locationName)}</strong>
                  </div>
                  <div class="dash-detail-metric">
                    <span>Hours</span>
                    <strong>${escapeHtml(state.storeConfig.hours)}</strong>
                  </div>
                  <div class="dash-detail-metric">
                    <span>Tax rate basis points</span>
                    <strong>${state.storeConfig.taxRateBasisPoints}</strong>
                  </div>
                  <div class="dash-detail-metric dash-detail-metric--wide">
                    <span>Pickup instructions</span>
                    <strong>${escapeHtml(state.storeConfig.pickupInstructions)}</strong>
                  </div>
                </div>
              `
        }
      </article>
    </section>
  `;
}
