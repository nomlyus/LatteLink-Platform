import { isAllLocationsSelected, state } from "../state.js";
import { escapeHtml } from "../ui/format.js";
import { canAccessCapability, type OperatorNewsCard } from "../model.js";
import { renderLocationSelectionNotice, renderSectionHeading } from "./common.js";

function renderNewsCard(
  card: OperatorNewsCard,
  canWrite: boolean,
  canToggleVisibility: boolean
) {
  const visibilityButton = canToggleVisibility
    ? `
        <button
          class="button ${card.visible ? "button--secondary" : "button--ghost"}"
          type="button"
          data-action="toggle-news-card-visibility"
          data-card-id="${card.cardId}"
          data-visible="${card.visible ? "false" : "true"}"
          ${state.busyNewsCardVisibilityId === card.cardId ? "disabled" : ""}
        >
          ${state.busyNewsCardVisibilityId === card.cardId ? "Saving…" : card.visible ? "Hide" : "Show"}
        </button>
      `
    : "";

  return `
    <form class="dash-data-row dash-data-row--news-card" data-form="news-card" data-card-id="${card.cardId}">
      <div class="dash-data-row__identity dash-data-row__identity--news-card">
        <strong>${escapeHtml(card.title)}</strong>
        <span>${escapeHtml(card.label)} · ${escapeHtml(card.cardId)}</span>
      </div>
      <div class="dash-data-row__fields dash-data-row__fields--news-card">
        <label class="field dash-field-inline dash-field-span-1">
          <span>Label</span>
          <input name="label" value="${escapeHtml(card.label)}" ${canWrite ? "" : "disabled"} required />
        </label>
        <label class="field dash-field-inline dash-field-span-1">
          <span>Title</span>
          <input name="title" value="${escapeHtml(card.title)}" ${canWrite ? "" : "disabled"} required />
        </label>
        <label class="field dash-field-inline dash-field-span-full">
          <span>Body</span>
          <textarea name="body" rows="3" ${canWrite ? "" : "disabled"} required>${escapeHtml(card.body)}</textarea>
        </label>
        <label class="field dash-field-inline dash-field-span-full">
          <span>Note</span>
          <textarea name="note" rows="2" ${canWrite ? "" : "disabled"}>${escapeHtml(card.note ?? "")}</textarea>
        </label>
        <label class="field dash-field-inline dash-field-span-1">
          <span>Sort order</span>
          <input name="sortOrder" type="number" min="0" step="1" value="${card.sortOrder}" ${canWrite ? "" : "disabled"} required />
        </label>
        <label class="toggle dash-toggle-inline dash-toggle-inline--news-card">
          <input type="checkbox" name="visible" ${card.visible ? "checked" : ""} ${canWrite ? "" : "disabled"} />
          <span>${card.visible ? "Visible" : "Hidden"}</span>
        </label>
      </div>
      <div class="dash-data-row__actions dash-data-row__actions--news-card">
        <span class="dash-status-badge dash-status-badge--${card.visible ? "success" : "neutral"}">${card.visible ? "Visible" : "Hidden"}</span>
        ${
          canWrite
            ? `
                <button class="button button--secondary" type="submit" ${state.busyNewsCardId === card.cardId ? "disabled" : ""}>
                  ${state.busyNewsCardId === card.cardId ? "Saving…" : "Save"}
                </button>
                <button class="button button--ghost" type="button" data-action="delete-news-card" data-card-id="${card.cardId}" ${state.busyDeleteNewsCardId === card.cardId ? "disabled" : ""}>
                  ${state.busyDeleteNewsCardId === card.cardId ? "Removing…" : "Remove"}
                </button>
              `
            : ""
        }
        ${visibilityButton}
      </div>
    </form>
  `;
}

export function renderCardsSection() {
  if (isAllLocationsSelected()) {
    return `
      <section class="dash-section">
        ${renderSectionHeading({
          eyebrow: "Home",
          title: "Location-specific news cards",
          description: "Choose one location to edit the rotating cards shown in the mobile app."
        })}
        ${renderLocationSelectionNotice("News cards are managed per location because promotions and announcements vary by store.")}
      </section>
    `;
  }

  const canWrite = canAccessCapability(state.session?.operator ?? null, "menu:write");
  const canToggleVisibility = canAccessCapability(state.session?.operator ?? null, "menu:visibility");
  const accessNotice = !canWrite
    ? `<article class="dash-surface dash-empty-surface"><p class="muted-copy">Your account can review home cards, but editing is disabled for this role.</p></article>`
    : "";

  return `
    <section class="dash-section">
      ${renderSectionHeading({
        eyebrow: "Home",
        title: "News cards",
        description: "Manage the rotating cards shown on the mobile home page."
      })}
      ${accessNotice}
      ${
        canWrite
          ? `
              <article class="dash-surface">
                <div class="dash-surface-head">
                  <div>
                    <div class="dash-panel-title">Create card</div>
                    <h3 class="dash-surface-title">Add a homepage card</h3>
                  </div>
                </div>
                <form class="dash-inline-form dash-inline-form--news-card" data-form="news-card-create">
                  <label class="field dash-field-inline dash-field-span-1">
                    <span>Label</span>
                    <input name="label" placeholder="NEW DRINK" required />
                  </label>
                  <label class="field dash-field-inline dash-field-span-1">
                    <span>Title</span>
                    <input name="title" placeholder="Seasonal highlight" required />
                  </label>
                  <label class="field dash-field-inline dash-field-span-full">
                    <span>Body</span>
                    <textarea name="body" rows="3" placeholder="Card body copy" required></textarea>
                  </label>
                  <label class="field dash-field-inline dash-field-span-full">
                    <span>Note</span>
                    <textarea name="note" rows="2" placeholder="Optional note"></textarea>
                  </label>
                  <label class="field dash-field-inline dash-field-span-1">
                    <span>Sort order</span>
                    <input
                      name="sortOrder"
                      type="number"
                      min="0"
                      step="1"
                      value="${state.newsCards.reduce((max, card) => Math.max(max, card.sortOrder), -1) + 1}"
                      required
                    />
                  </label>
                  <label class="toggle dash-toggle-inline dash-toggle-inline--news-card">
                    <input type="checkbox" name="visible" checked />
                    <span>Visible</span>
                  </label>
                  <div class="dash-form-actions dash-form-actions--news-card">
                    <button class="button button--primary" type="submit" ${state.creatingNewsCard ? "disabled" : ""}>
                      ${state.creatingNewsCard ? "Creating…" : "Create card"}
                    </button>
                  </div>
                </form>
              </article>
            `
          : ""
      }
      <article class="dash-surface">
        ${
          state.newsCards.length > 0
            ? state.newsCards.map((card) => renderNewsCard(card, canWrite, canToggleVisibility)).join("")
            : `<div class="dash-empty-surface"><p class="muted-copy">No homepage cards are configured yet.</p></div>`
        }
      </article>
    </section>
  `;
}
