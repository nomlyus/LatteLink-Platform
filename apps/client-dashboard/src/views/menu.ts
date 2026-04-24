import { isAllLocationsSelected, state } from "../state.js";
import { escapeHtml } from "../ui/format.js";
import {
  canCreateMenuItems,
  canToggleMenuItemVisibility,
  type OperatorMenuCategory
} from "../model.js";
import { isPlatformManagedMenu } from "@lattelink/contracts-catalog";
import { ensureMenuCustomizationDraft } from "../customizations.js";
import { renderLocationSelectionNotice, renderSectionHeading } from "./common.js";

function renderMenuCategory(
  category: OperatorMenuCategory,
  canWrite: boolean,
  canToggleVisibility: boolean
) {
  return `
    <section class="dash-data-group">
      <div class="dash-data-group__header">
        <div>
          <div class="dash-panel-title">Category</div>
          <h3 class="dash-surface-title">${escapeHtml(category.title)}</h3>
        </div>
        <span class="dash-inline-note">${category.items.length} items</span>
      </div>
      <div class="dash-data-group__rows">
        ${
          category.items.length > 0
            ? category.items
                .map((item) => {
                  const customizationGroups = ensureMenuCustomizationDraft(item.itemId);
                  const visibilityButton = canToggleVisibility
                    ? `
                        <button
                          class="button ${item.visible ? "button--secondary" : "button--ghost"}"
                          type="button"
                          data-action="toggle-menu-visibility"
                          data-item-id="${item.itemId}"
                          data-visible="${item.visible ? "false" : "true"}"
                          ${state.busyMenuVisibilityItemId === item.itemId ? "disabled" : ""}
                        >
                          ${state.busyMenuVisibilityItemId === item.itemId ? "Saving…" : item.visible ? "Hide" : "Show"}
                        </button>
                      `
                    : "";
                  const customizationGroupsMarkup =
                    customizationGroups.length > 0
                      ? customizationGroups
                          .map((group, groupIndex) => {
                            const optionRows =
                              group.options.length > 0
                                ? group.options
                                    .map(
                                      (option, optionIndex) => `
                                        <div class="dash-customization-option-row">
                                          <label class="field dash-field-inline">
                                            <span>Option label</span>
                                            <input
                                              value="${escapeHtml(option.label)}"
                                              data-customization-item-id="${item.itemId}"
                                              data-customization-group-index="${groupIndex}"
                                              data-customization-option-index="${optionIndex}"
                                              data-customization-field="label"
                                              ${canWrite ? "" : "disabled"}
                                              required
                                            />
                                          </label>
                                          <label class="field dash-field-inline">
                                            <span>Price delta (cents)</span>
                                            <input
                                              type="number"
                                              min="0"
                                              step="1"
                                              value="${option.priceDeltaCents}"
                                              data-customization-item-id="${item.itemId}"
                                              data-customization-group-index="${groupIndex}"
                                              data-customization-option-index="${optionIndex}"
                                              data-customization-field="priceDeltaCents"
                                              ${canWrite ? "" : "disabled"}
                                              required
                                            />
                                          </label>
                                          <label class="toggle dash-toggle-inline">
                                            <input
                                              type="checkbox"
                                              ${option.default ? "checked" : ""}
                                              data-customization-item-id="${item.itemId}"
                                              data-customization-group-index="${groupIndex}"
                                              data-customization-option-index="${optionIndex}"
                                              data-customization-field="default"
                                              ${canWrite ? "" : "disabled"}
                                            />
                                            <span>Default</span>
                                          </label>
                                          <label class="toggle dash-toggle-inline">
                                            <input
                                              type="checkbox"
                                              ${option.available ? "checked" : ""}
                                              data-customization-item-id="${item.itemId}"
                                              data-customization-group-index="${groupIndex}"
                                              data-customization-option-index="${optionIndex}"
                                              data-customization-field="available"
                                              ${canWrite ? "" : "disabled"}
                                            />
                                            <span>Available</span>
                                          </label>
                                          <label class="field dash-field-inline">
                                            <span>Sort order</span>
                                            <input
                                              type="number"
                                              step="1"
                                              value="${option.sortOrder ?? optionIndex}"
                                              data-customization-item-id="${item.itemId}"
                                              data-customization-group-index="${groupIndex}"
                                              data-customization-option-index="${optionIndex}"
                                              data-customization-field="sortOrder"
                                              ${canWrite ? "" : "disabled"}
                                              required
                                            />
                                          </label>
                                          ${
                                            canWrite
                                              ? `
                                                  <button
                                                    class="button button--ghost"
                                                    type="button"
                                                    data-action="delete-customization-option"
                                                    data-item-id="${item.itemId}"
                                                    data-group-index="${groupIndex}"
                                                    data-option-index="${optionIndex}"
                                                  >
                                                    Delete option
                                                  </button>
                                                `
                                              : ""
                                          }
                                        </div>
                                      `
                                    )
                                    .join("")
                                : `<p class="muted-copy">No options in this group yet.</p>`;
                            return `
                              <article class="dash-customization-group-card">
                                <div class="dash-customization-group-grid">
                                  <label class="field dash-field-inline">
                                    <span>Group label</span>
                                    <input
                                      value="${escapeHtml(group.label)}"
                                      data-customization-item-id="${item.itemId}"
                                      data-customization-group-index="${groupIndex}"
                                      data-customization-field="label"
                                      ${canWrite ? "" : "disabled"}
                                      required
                                    />
                                  </label>
                                  <label class="field dash-field-inline">
                                    <span>Selection type</span>
                                    <select
                                      data-customization-item-id="${item.itemId}"
                                      data-customization-group-index="${groupIndex}"
                                      data-customization-field="selectionType"
                                      ${canWrite ? "" : "disabled"}
                                    >
                                      <option value="single" ${group.selectionType === "single" ? "selected" : ""}>single</option>
                                      <option value="multiple" ${group.selectionType === "multiple" ? "selected" : ""}>multiple</option>
                                    </select>
                                  </label>
                                  <label class="toggle dash-toggle-inline">
                                    <input
                                      type="checkbox"
                                      ${group.required ? "checked" : ""}
                                      data-customization-item-id="${item.itemId}"
                                      data-customization-group-index="${groupIndex}"
                                      data-customization-field="required"
                                      ${canWrite ? "" : "disabled"}
                                    />
                                    <span>Required</span>
                                  </label>
                                  <label class="field dash-field-inline">
                                    <span>Sort order</span>
                                    <input
                                      type="number"
                                      step="1"
                                      value="${group.sortOrder ?? groupIndex}"
                                      data-customization-item-id="${item.itemId}"
                                      data-customization-group-index="${groupIndex}"
                                      data-customization-field="sortOrder"
                                      ${canWrite ? "" : "disabled"}
                                      required
                                    />
                                  </label>
                                </div>
                                <div class="dash-customization-options-stack">
                                  ${optionRows}
                                </div>
                                ${
                                  canWrite
                                    ? `
                                        <div class="dash-customization-group-actions">
                                          <button class="button button--secondary" type="button" data-action="add-customization-option" data-item-id="${item.itemId}" data-group-index="${groupIndex}">
                                            Add option
                                          </button>
                                          <button class="button button--ghost" type="button" data-action="delete-customization-group" data-item-id="${item.itemId}" data-group-index="${groupIndex}">
                                            Delete group
                                          </button>
                                        </div>
                                      `
                                    : ""
                                }
                              </article>
                            `;
                          })
                          .join("")
                      : `<p class="muted-copy">No customization groups configured.</p>`;

                  return `
                    <form class="dash-data-row" data-form="menu-item" data-item-id="${item.itemId}">
                      <div class="dash-data-row__identity">
                        <strong>${escapeHtml(item.name)}</strong>
                        <span>${escapeHtml(item.description ?? item.itemId)}</span>
                      </div>
                      <div class="dash-data-row__fields">
                        <label class="field dash-field-inline">
                          <span>Name</span>
                          <input name="name" value="${escapeHtml(item.name)}" ${canWrite ? "" : "disabled"} required />
                        </label>
                        <label class="field dash-field-inline">
                          <span>Price (cents)</span>
                          <input name="priceCents" type="number" min="0" step="1" value="${item.priceCents}" ${canWrite ? "" : "disabled"} required />
                        </label>
                        <label class="toggle dash-toggle-inline">
                          <input type="checkbox" name="visible" ${item.visible ? "checked" : ""} ${canWrite ? "" : "disabled"} />
                          <span>${item.visible ? "Visible" : "Hidden"}</span>
                        </label>
                        <div class="dash-menu-image-field">
                          <div class="dash-menu-image-preview">
                            ${
                              item.imageUrl
                                ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" loading="lazy" />`
                                : `<div class="dash-menu-image-preview__empty">No image uploaded</div>`
                            }
                          </div>
                          <div class="dash-menu-image-field__controls">
                            <label class="field dash-field-inline dash-field-span-full">
                              <span>${item.imageUrl ? "Replace image" : "Upload image"}</span>
                              <input name="imageFile" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" ${canWrite ? "" : "disabled"} />
                            </label>
                            ${
                              item.imageUrl
                                ? `
                                    <label class="toggle dash-toggle-inline">
                                      <input type="checkbox" name="removeImage" ${canWrite ? "" : "disabled"} />
                                      <span>Remove current image</span>
                                    </label>
                                  `
                                : ""
                            }
                          </div>
                        </div>
                      </div>
                      <details class="dash-customization-panel">
                        <summary>
                          <span>Customizations</span>
                          <span>${customizationGroups.length} group${customizationGroups.length === 1 ? "" : "s"}</span>
                        </summary>
                        <div class="dash-customization-panel__body">
                          ${customizationGroupsMarkup}
                          ${
                            canWrite
                              ? `
                                  <button class="button button--secondary" type="button" data-action="add-customization-group" data-item-id="${item.itemId}">
                                    Add customization group
                                  </button>
                                `
                              : ""
                          }
                        </div>
                      </details>
                      <div class="dash-data-row__actions">
                        <span class="dash-status-badge dash-status-badge--${item.visible ? "success" : "neutral"}">${item.visible ? "Visible" : "Hidden"}</span>
                        ${
                          canWrite
                            ? `
                                <button class="button button--secondary" type="submit" ${state.busyMenuItemId === item.itemId ? "disabled" : ""}>
                                  ${state.busyMenuItemId === item.itemId ? "Saving…" : "Save"}
                                </button>
                                <button class="button button--ghost" type="button" data-action="delete-menu-item" data-item-id="${item.itemId}" ${state.busyDeleteMenuItemId === item.itemId ? "disabled" : ""}>
                                  ${state.busyDeleteMenuItemId === item.itemId ? "Removing…" : "Remove"}
                                </button>
                              `
                            : ""
                        }
                        ${visibilityButton}
                      </div>
                    </form>
                  `;
                })
                .join("")
            : `<div class="dash-empty-surface"><p class="muted-copy">No items are in this category yet.</p></div>`
        }
      </div>
    </section>
  `;
}

export function renderMenuSection() {
  if (isAllLocationsSelected()) {
    return `
      <section class="dash-section">
        ${renderSectionHeading({
          eyebrow: "Menu",
          title: "Location-specific menu management",
          description: "Choose one location to edit items, pricing, visibility, and customizations."
        })}
        ${renderLocationSelectionNotice("Menu controls stay scoped to a single location so edits do not accidentally affect the wrong storefront.")}
      </section>
    `;
  }

  const menuIsPlatformManaged = isPlatformManagedMenu(state.appConfig);
  const canWrite = canCreateMenuItems(state.session?.operator ?? null, state.appConfig);
  const canToggleVisibility = canToggleMenuItemVisibility(state.session?.operator ?? null, state.appConfig);
  const canCreateIntoExistingCategory = canWrite && state.menuCategories.length > 0;

  const accessNotice =
    menuIsPlatformManaged && !canWrite && !canToggleVisibility
      ? `<article class="dash-surface dash-empty-surface"><p class="muted-copy">Your account can review the menu, but menu editing and visibility controls are disabled for this role.</p></article>`
      : !menuIsPlatformManaged
        ? `<article class="dash-surface dash-empty-surface"><p class="muted-copy">This store is using an external menu sync, so dashboard edits stay disabled until the menu source is switched back to LatteLink.</p></article>`
        : "";

  const createForm = canCreateIntoExistingCategory
    ? `
        <article class="dash-surface">
          <div class="dash-surface-head">
            <div>
              <div class="dash-panel-title">Create item</div>
              <h3 class="dash-surface-title">Add menu items with a guided flow</h3>
              <p class="muted-copy">Pick a category, fill in the item details, then review pricing before you save.</p>
            </div>
            <button class="button button--primary" type="button" data-action="open-menu-create-wizard">
              Add menu item
            </button>
          </div>
          <div class="dash-empty-copy">The wizard opens in a popup so longer fields and pricing controls have enough space.</div>
        </article>
      `
    : canWrite
      ? `
          <article class="dash-surface dash-empty-surface">
            <p class="muted-copy">Add at least one synced menu category before creating dashboard-managed items for this store.</p>
          </article>
        `
      : "";

  return `
    <section class="dash-section">
      ${renderSectionHeading({
        eyebrow: "Menu",
        title: "Menu management",
        description: "Keep the live customer menu clean, available, and accurate."
      })}
      ${accessNotice}
      ${createForm}
      <article class="dash-surface">
        ${
          state.menuCategories.length > 0
            ? state.menuCategories.map((category) => renderMenuCategory(category, canWrite, canToggleVisibility)).join("")
            : `<div class="dash-empty-surface"><p class="muted-copy">No menu data is available yet.</p></div>`
        }
      </article>
    </section>
  `;
}
