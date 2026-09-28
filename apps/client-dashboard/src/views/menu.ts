import { isAllLocationsSelected, state } from "../state";
import { escapeHtml, formatMoney } from "../ui/format";
import {
  canCreateMenuItems,
  canToggleMenuItemVisibility,
  type OperatorMenuCategory,
  type OperatorMenuItem
} from "../model";
import { isPlatformManagedMenu } from "@lattelink/contracts-catalog";
import { ensureMenuCustomizationDraft } from "../customizations";
import { renderLocationSelectionNotice, renderSectionHeading } from "./common";

const menuItemsPageSize = 10;

type MenuTableEntry = {
  category: OperatorMenuCategory;
  item: OperatorMenuItem;
};

function getMenuTableEntries(): MenuTableEntry[] {
  return state.menuCategories.flatMap((category) =>
    category.items.map((item) => ({ category, item }))
  );
}

function paginateMenuItems(items: readonly MenuTableEntry[]) {
  const pageCount = Math.max(1, Math.ceil(items.length / menuItemsPageSize));
  const page = Math.min(Math.max(state.menuItemsPage, 1), pageCount);
  if (page !== state.menuItemsPage) {
    state.menuItemsPage = page;
  }

  const start = (page - 1) * menuItemsPageSize;
  return {
    items: items.slice(start, start + menuItemsPageSize),
    page,
    pageCount
  };
}

function renderMenuDetailsButton(item: OperatorMenuItem) {
  return `
    <button
      class="dash-order-table__details-button"
      type="button"
      data-action="open-menu-item-details"
      data-item-id="${escapeHtml(item.itemId)}"
      aria-label="${escapeHtml(`View menu item details for ${item.name}`)}"
      title="View item details"
    >
      <svg class="dash-order-table__details-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M4.25 2.25h5.5l2 2v9.5l-1.5-.8-1.5.8-1.5-.8-1.5.8-1.5-.8-1.5.8v-10a.7.7 0 0 1 .7-.7Z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M9.5 2.5v2h2M5.5 7h4.75M5.5 9.25h4.75M5.5 11.5h3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
  `;
}

function renderMenuTable(items: readonly MenuTableEntry[]) {
  if (items.length === 0) {
    return `<div class="dash-empty-surface"><p class="muted-copy">No menu items are available for this location.</p></div>`;
  }

  return `
    <div class="dash-order-table-wrap">
      <table class="dash-order-table dash-order-table--menu">
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Category</th>
            <th scope="col" class="dash-order-table__amount-heading">Price</th>
            <th scope="col">Visibility</th>
            <th scope="col" class="dash-order-table__details-heading">Details</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              ({ category, item }) => `
                <tr class="dash-order-table__row">
                  <td>
                    <div class="dash-order-table__order">
                      ${item.imageUrl
                        ? `<img class="dash-menu-table__image" data-item-id="${escapeHtml(item.itemId)}" src="${escapeHtml(item.imageUrl)}" alt="" aria-hidden="true" loading="lazy" decoding="async" />`
                        : `<span class="dash-menu-table__image dash-menu-table__image--empty" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none"><rect x="2.25" y="2.25" width="11.5" height="11.5" rx="2" stroke="currentColor" stroke-width="1.2"/><circle cx="5.5" cy="5.5" r="1.1" fill="currentColor"/><path d="m3.5 11 3-3 2 2 1.5-1.5 2.5 2.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`}
                      <strong class="dash-menu-table__item-name">${escapeHtml(item.name)}</strong>
                    </div>
                  </td>
                  <td><span class="dash-order-table__location">${escapeHtml(category.title)}</span></td>
                  <td class="dash-order-table__amount">${formatMoney(item.priceCents)}</td>
                  <td><span class="dash-status-badge dash-status-badge--${item.visible ? "success" : "neutral"}">${item.visible ? "Visible" : "Hidden"}</span></td>
                  <td class="dash-order-table__details">${renderMenuDetailsButton(item)}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderMenuPagination(page: number, pageCount: number) {
  if (pageCount <= 1) {
    return "";
  }

  return `
    <nav class="dash-order-pagination" aria-label="Menu items pagination">
      <button class="dash-order-pagination__control" type="button" data-action="set-menu-items-page" data-menu-items-page="1" aria-label="First page" title="First page" ${page === 1 ? "disabled" : ""}>
        <span aria-hidden="true">&laquo;</span>
      </button>
      <button class="dash-order-pagination__control" type="button" data-action="set-menu-items-page" data-menu-items-page="${page - 1}" aria-label="Previous page" title="Previous page" ${page === 1 ? "disabled" : ""}>
        <span aria-hidden="true">&lsaquo;</span>
      </button>
      <span class="dash-order-pagination__page" aria-current="page">${page} / ${pageCount}</span>
      <button class="dash-order-pagination__control" type="button" data-action="set-menu-items-page" data-menu-items-page="${page + 1}" aria-label="Next page" title="Next page" ${page === pageCount ? "disabled" : ""}>
        <span aria-hidden="true">&rsaquo;</span>
      </button>
      <button class="dash-order-pagination__control" type="button" data-action="set-menu-items-page" data-menu-items-page="${pageCount}" aria-label="Last page" title="Last page" ${page === pageCount ? "disabled" : ""}>
        <span aria-hidden="true">&raquo;</span>
      </button>
    </nav>
  `;
}

function renderCustomizationGroups(item: OperatorMenuItem, canWrite: boolean) {
  const customizationGroups = ensureMenuCustomizationDraft(item.itemId);
  if (customizationGroups.length === 0) {
    return `<p class="muted-copy">No customization groups configured.</p>`;
  }

  return customizationGroups
    .map((group, groupIndex) => {
      const optionRows =
        group.options.length > 0
          ? group.options
              .map(
                (option, optionIndex) => `
                  <div class="dash-customization-option-row">
                    <label class="field dash-field-inline">
                      <span>Option label</span>
                      <input value="${escapeHtml(option.label)}" data-customization-item-id="${escapeHtml(item.itemId)}" data-customization-group-index="${groupIndex}" data-customization-option-index="${optionIndex}" data-customization-field="label" ${canWrite ? "" : "disabled"} required />
                    </label>
                    <label class="field dash-field-inline">
                      <span>Price delta (cents)</span>
                      <input type="number" min="0" step="1" value="${option.priceDeltaCents}" data-customization-item-id="${escapeHtml(item.itemId)}" data-customization-group-index="${groupIndex}" data-customization-option-index="${optionIndex}" data-customization-field="priceDeltaCents" ${canWrite ? "" : "disabled"} required />
                    </label>
                    <label class="toggle dash-toggle-inline">
                      <input type="checkbox" ${option.default ? "checked" : ""} data-customization-item-id="${escapeHtml(item.itemId)}" data-customization-group-index="${groupIndex}" data-customization-option-index="${optionIndex}" data-customization-field="default" ${canWrite ? "" : "disabled"} />
                      <span>Default</span>
                    </label>
                    <label class="toggle dash-toggle-inline">
                      <input type="checkbox" ${option.available ? "checked" : ""} data-customization-item-id="${escapeHtml(item.itemId)}" data-customization-group-index="${groupIndex}" data-customization-option-index="${optionIndex}" data-customization-field="available" ${canWrite ? "" : "disabled"} />
                      <span>Available</span>
                    </label>
                    <label class="field dash-field-inline">
                      <span>Sort order</span>
                      <input type="number" step="1" value="${option.sortOrder ?? optionIndex}" data-customization-item-id="${escapeHtml(item.itemId)}" data-customization-group-index="${groupIndex}" data-customization-option-index="${optionIndex}" data-customization-field="sortOrder" ${canWrite ? "" : "disabled"} required />
                    </label>
                    ${canWrite ? `<button class="button button--ghost" type="button" data-action="delete-customization-option" data-item-id="${escapeHtml(item.itemId)}" data-group-index="${groupIndex}" data-option-index="${optionIndex}">Delete option</button>` : ""}
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
              <input value="${escapeHtml(group.label)}" data-customization-item-id="${escapeHtml(item.itemId)}" data-customization-group-index="${groupIndex}" data-customization-field="label" ${canWrite ? "" : "disabled"} required />
            </label>
            <label class="field dash-field-inline">
              <span>Selection type</span>
              <select data-customization-item-id="${escapeHtml(item.itemId)}" data-customization-group-index="${groupIndex}" data-customization-field="selectionType" ${canWrite ? "" : "disabled"}>
                <option value="single" ${group.selectionType === "single" ? "selected" : ""}>single</option>
                <option value="multiple" ${group.selectionType === "multiple" ? "selected" : ""}>multiple</option>
              </select>
            </label>
            <label class="toggle dash-toggle-inline">
              <input type="checkbox" ${group.required ? "checked" : ""} data-customization-item-id="${escapeHtml(item.itemId)}" data-customization-group-index="${groupIndex}" data-customization-field="required" ${canWrite ? "" : "disabled"} />
              <span>Required</span>
            </label>
            <label class="field dash-field-inline">
              <span>Sort order</span>
              <input type="number" step="1" value="${group.sortOrder ?? groupIndex}" data-customization-item-id="${escapeHtml(item.itemId)}" data-customization-group-index="${groupIndex}" data-customization-field="sortOrder" ${canWrite ? "" : "disabled"} required />
            </label>
          </div>
          <div class="dash-customization-options-stack">${optionRows}</div>
          ${canWrite ? `
            <div class="dash-customization-group-actions">
              <button class="button button--secondary" type="button" data-action="add-customization-option" data-item-id="${escapeHtml(item.itemId)}" data-group-index="${groupIndex}">Add option</button>
              <button class="button button--ghost" type="button" data-action="delete-customization-group" data-item-id="${escapeHtml(item.itemId)}" data-group-index="${groupIndex}">Delete group</button>
            </div>
          ` : ""}
        </article>
      `;
    })
    .join("");
}

function renderMenuItemForm(
  item: OperatorMenuItem,
  canWrite: boolean,
  canToggleVisibility: boolean
) {
  const customizationGroups = ensureMenuCustomizationDraft(item.itemId);
  const categoryIds = new Set(item.categoryIds?.length ? item.categoryIds : [item.categoryId]);
  const modifierGroupIds = new Set(item.modifierGroupAssignments.map((assignment) => assignment.modifierGroupId));
  const visibilityButton = canToggleVisibility
    ? `
        <button class="button button--secondary" type="button" data-action="toggle-menu-visibility" data-item-id="${escapeHtml(item.itemId)}" data-visible="${item.visible ? "false" : "true"}" ${state.busyMenuVisibilityItemId === item.itemId ? "disabled" : ""}>
          ${state.busyMenuVisibilityItemId === item.itemId ? '<span class="spinner"></span> Saving…' : item.visible ? "Hide" : "Show"}
        </button>
      `
    : "";

  return `
    <form class="dash-data-row dash-menu-item-detail__form" data-form="menu-item" data-item-id="${escapeHtml(item.itemId)}">
      <div class="dash-order-detail__customer-heading">Item Details</div>
      <p class="dash-menu-item-detail__description">${escapeHtml(item.description || "No description provided.")}</p>
      <div class="dash-data-row__fields">
        <label class="field dash-field-inline">
          <span>Name</span>
          <input name="name" value="${escapeHtml(item.name)}" ${canWrite ? "" : "disabled"} required />
        </label>
        <label class="field dash-field-inline">
          <span>Price (cents)</span>
          <input name="priceCents" type="number" min="0" step="1" value="${item.priceCents}" ${canWrite ? "" : "disabled"} required />
        </label>
        <label class="field dash-field-inline">
          <span>Description</span>
          <input name="description" value="${escapeHtml(item.description ?? "")}" ${canWrite ? "" : "disabled"} />
        </label>
        <label class="field dash-field-inline">
          <span>Badges</span>
          <input name="badgeCodes" value="${escapeHtml(item.badgeCodes.join(", "))}" ${canWrite ? "" : "disabled"} placeholder="new, popular" />
        </label>
        <label class="field dash-field-inline">
          <span>Item order</span>
          <input name="sortOrder" type="number" min="0" step="1" value="${item.sortOrder}" ${canWrite ? "" : "disabled"} />
        </label>
        <label class="toggle dash-toggle-inline">
          <input type="checkbox" name="visible" ${item.visible ? "checked" : ""} ${canWrite ? "" : "disabled"} />
          <span>${item.visible ? "Visible in app" : "Hidden from app"}</span>
        </label>
        <label class="toggle dash-toggle-inline">
          <input type="checkbox" name="available" ${item.available ? "checked" : ""} ${canWrite ? "" : "disabled"} />
          <span>Available to order</span>
        </label>
        <label class="toggle dash-toggle-inline">
          <input type="checkbox" name="featured" ${item.featured ? "checked" : ""} ${canWrite ? "" : "disabled"} />
          <span>Featured</span>
        </label>
        <div class="dash-menu-assignment-field">
          <strong>Categories</strong>
          ${state.menuCategories
            .map(
              (category) => `<label class="toggle dash-toggle-inline"><input type="checkbox" name="categoryIds" value="${escapeHtml(category.categoryId)}" ${categoryIds.has(category.categoryId) ? "checked" : ""} ${canWrite ? "" : "disabled"} /><span>${escapeHtml(category.title)}</span></label>`
            )
            .join("")}
        </div>
        <div class="dash-menu-assignment-field">
          <strong>Modifier groups</strong>
          ${state.menuModifierGroups.length > 0
            ? state.menuModifierGroups
                .map(
                  (group) => `<label class="toggle dash-toggle-inline"><input type="checkbox" name="modifierGroupIds" value="${escapeHtml(group.id)}" ${modifierGroupIds.has(group.id) ? "checked" : ""} ${canWrite ? "" : "disabled"} /><span>${escapeHtml(group.label)}</span></label>`
                )
                .join("")
            : `<span class="muted-copy">Create a modifier group below first.</span>`}
        </div>
        <div class="dash-menu-image-field dash-field-span-full">
          <div class="dash-menu-image-preview">
            ${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" loading="lazy" />` : `<div class="dash-menu-image-preview__empty">No image uploaded</div>`}
          </div>
          <div class="dash-menu-image-field__controls">
            <label class="field dash-field-inline dash-field-span-full">
              <span>${item.imageUrl ? "Replace image" : "Upload image"}</span>
              <input name="imageFile" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" ${canWrite ? "" : "disabled"} />
            </label>
            ${item.imageUrl ? `
              <label class="toggle dash-toggle-inline">
                <input type="checkbox" name="removeImage" ${canWrite ? "" : "disabled"} />
                <span>Remove current image</span>
              </label>
            ` : ""}
          </div>
        </div>
      </div>
      <details class="dash-customization-panel">
        <summary>
          <span>Customizations</span>
          <span>${customizationGroups.length} group${customizationGroups.length === 1 ? "" : "s"}</span>
        </summary>
        <div class="dash-customization-panel__body">
          ${renderCustomizationGroups(item, canWrite)}
          ${canWrite ? `<button class="button button--secondary" type="button" data-action="add-customization-group" data-item-id="${escapeHtml(item.itemId)}">Add customization group</button>` : ""}
        </div>
      </details>
      <div class="dash-data-row__actions">
        <span class="dash-status-badge dash-status-badge--${item.visible ? "success" : "neutral"}">${item.visible ? "Visible" : "Hidden"}</span>
        ${canWrite ? `
          <button class="button button--secondary" type="submit" ${state.busyMenuItemId === item.itemId ? "disabled" : ""}>
            ${state.busyMenuItemId === item.itemId ? '<span class="spinner"></span> Saving…' : "Save changes"}
          </button>
          <button class="button button--ghost" type="button" data-action="delete-menu-item" data-item-id="${escapeHtml(item.itemId)}" ${state.busyDeleteMenuItemId === item.itemId ? "disabled" : ""}>
            ${state.busyDeleteMenuItemId === item.itemId ? '<span class="spinner"></span> Removing…' : "Remove item"}
          </button>
        ` : ""}
        ${visibilityButton}
      </div>
    </form>
  `;
}

function renderMenuItemDetailsModal(canWrite: boolean, canToggleVisibility: boolean) {
  if (!state.menuItemDetailsOpen || !state.selectedMenuItemId) {
    return "";
  }
  const entry = getMenuTableEntries().find(({ item }) => item.itemId === state.selectedMenuItemId);
  if (!entry) {
    return "";
  }

  return `
    <div class="dash-modal dash-order-detail-modal dash-menu-item-detail-modal${state.menuItemDetailsOpening ? " dash-order-detail-modal--opening" : ""}${state.menuItemDetailsClosing ? " dash-order-detail-modal--closing" : ""}" role="presentation">
      <button class="dash-modal__backdrop" type="button" data-action="close-menu-item-details" aria-label="Close menu item details"></button>
      <div class="dash-modal__dialog dash-modal__dialog--order dash-modal__dialog--menu-item" role="dialog" aria-modal="true" aria-labelledby="menu-item-detail-title">
        <div class="dash-modal__header">
          <div class="dash-order-detail__title-group">
            <h3 class="dash-order-detail__title" id="menu-item-detail-title">${escapeHtml(entry.item.name)}</h3>
            <div class="dash-order-detail__date">${escapeHtml(entry.category.title)}</div>
          </div>
          <button class="dash-order-detail__close" type="button" data-action="close-menu-item-details" aria-label="Close menu item details">
            <svg class="dash-order-detail__close-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 3v10M4.5 9.5 8 13l3.5-3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </div>
        <div class="dash-order-detail__body dash-menu-item-detail__body">
          ${renderMenuItemForm(entry.item, canWrite, canToggleVisibility)}
        </div>
      </div>
    </div>
  `;
}

function checked(value: boolean) {
  return value ? "checked" : "";
}

function uniqueMenuItems() {
  const items = new Map<string, OperatorMenuItem>();
  for (const category of state.menuCategories) {
    for (const item of category.items) {
      if (!items.has(item.itemId)) items.set(item.itemId, item);
    }
  }
  return [...items.values()];
}

function renderCategoryPanel(canWrite: boolean) {
  const categories = state.menuCategories;
  return `
    <article class="dash-surface">
      <div class="dash-surface-head"><div><div class="dash-panel-title">Categories</div><h3 class="dash-surface-title">Organize the customer menu</h3><p class="muted-copy">Categories are presentation containers. Removing one never removes its items.</p></div></div>
      ${canWrite ? `<form class="dash-data-row" data-form="menu-category-create"><div class="dash-data-row__identity"><strong>New category</strong><span>Add a category without creating any items.</span></div><div class="dash-data-row__fields"><label class="field dash-field-inline"><span>Name</span><input name="title" required placeholder="Seasonal drinks" /></label><label class="field dash-field-inline"><span>Description</span><input name="description" placeholder="Optional description" /></label><label class="field dash-field-inline"><span>Order</span><input name="sortOrder" type="number" min="0" step="1" value="${categories.length}" /></label><label class="toggle dash-toggle-inline"><input type="checkbox" name="visible" checked /><span>Visible</span></label></div><div class="dash-data-row__actions"><button class="button button--primary" type="submit">Create category</button></div></form>` : ""}
      <div class="dash-data-group__rows">
        ${categories.length === 0 ? `<div class="dash-empty-surface"><p class="muted-copy">No categories have been configured.</p></div>` : categories.map((category, index) => `
          <form class="dash-data-row" data-form="menu-category" data-category-id="${escapeHtml(category.categoryId)}">
            <div class="dash-data-row__identity"><strong>${escapeHtml(category.title)}</strong><span>${category.items.length} item${category.items.length === 1 ? "" : "s"}</span></div>
            <div class="dash-data-row__fields"><label class="field dash-field-inline"><span>Name</span><input name="title" value="${escapeHtml(category.title)}" ${canWrite ? "" : "disabled"} required /></label><label class="field dash-field-inline"><span>Description</span><input name="description" value="${escapeHtml(category.description)}" ${canWrite ? "" : "disabled"} /></label><label class="field dash-field-inline"><span>Order</span><input name="sortOrder" type="number" min="0" step="1" value="${category.sortOrder}" ${canWrite ? "" : "disabled"} /></label><label class="toggle dash-toggle-inline"><input type="checkbox" name="visible" ${checked(category.visible)} ${canWrite ? "" : "disabled"} /><span>${category.visible ? "Visible" : "Hidden"}</span></label></div>
            <div class="dash-data-row__actions">${canWrite ? `<button class="button button--secondary" type="submit">Save</button>${index > 0 ? `<button class="button button--ghost" type="button" data-action="reorder-menu-category" data-category-id="${escapeHtml(category.categoryId)}" data-direction="up">Move up</button>` : ""}${index < categories.length - 1 ? `<button class="button button--ghost" type="button" data-action="reorder-menu-category" data-category-id="${escapeHtml(category.categoryId)}" data-direction="down">Move down</button>` : ""}<button class="button button--ghost" type="button" data-action="delete-menu-category" data-category-id="${escapeHtml(category.categoryId)}">Delete</button>` : ""}</div>
          </form>`).join("")}
      </div>
    </article>
  `;
}

function renderModifierGroupForm(group: (typeof state.menuModifierGroups)[number] | null, itemCount = 0, canWrite = true) {
  const id = group?.id ?? "";
  const disabled = canWrite ? "" : "disabled";
  const options = group?.options ?? [{ id: `option-${Date.now()}`, label: "New option", description: "", priceDeltaCents: 0, default: false, available: true, sortOrder: 0 }];
  return `
    <form class="dash-data-row" data-form="modifier-group" data-modifier-group-id="${escapeHtml(id)}">
      <div class="dash-data-row__identity"><strong>${escapeHtml(group?.label ?? "New modifier group")}</strong><span>${itemCount ? `Used by ${itemCount} item${itemCount === 1 ? "" : "s"}` : "Not assigned to items"}</span></div>
      <div class="dash-data-row__fields"><label class="field dash-field-inline"><span>Group name</span><input name="label" value="${escapeHtml(group?.label ?? "")}" ${disabled} required /></label><label class="field dash-field-inline"><span>Description</span><input name="description" value="${escapeHtml(group?.description ?? "")}" ${disabled} /></label><label class="field dash-field-inline"><span>Selection</span><select name="selectionType" ${disabled}><option value="single" ${group?.selectionType === "single" ? "selected" : ""}>Single</option><option value="multiple" ${group?.selectionType === "multiple" ? "selected" : ""}>Multiple</option></select></label><label class="toggle dash-toggle-inline"><input type="checkbox" name="required" ${checked(group?.required ?? false)} ${disabled} /><span>Required</span></label><label class="field dash-field-inline"><span>Minimum</span><input name="minSelections" type="number" min="0" step="1" value="${group?.minSelections ?? 0}" ${disabled} /></label><label class="field dash-field-inline"><span>Maximum</span><input name="maxSelections" type="number" min="1" step="1" value="${group?.maxSelections ?? 1}" ${disabled} /></label><label class="field dash-field-inline"><span>Order</span><input name="sortOrder" type="number" min="0" step="1" value="${group?.sortOrder ?? 0}" ${disabled} /></label></div>
      <div class="dash-customization-options-stack">${options.map((option, index) => `<div class="dash-customization-option-row"><label class="field dash-field-inline"><span>Option</span><input name="optionLabel" value="${escapeHtml(option.label)}" ${disabled} /></label><label class="field dash-field-inline"><span>Description</span><input name="optionDescription" value="${escapeHtml(option.description ?? "")}" ${disabled} /></label><label class="field dash-field-inline"><span>Price delta (cents)</span><input name="optionPriceDeltaCents" type="number" step="1" value="${option.priceDeltaCents}" ${disabled} /></label><label class="field dash-field-inline"><span>Order</span><input name="optionSortOrder" type="number" min="0" step="1" value="${option.sortOrder ?? index}" ${disabled} /></label><label class="toggle dash-toggle-inline"><input name="optionDefault_${index}" type="checkbox" ${checked(option.default ?? false)} ${disabled} /><span>Default</span></label><label class="toggle dash-toggle-inline"><input name="optionAvailable_${index}" type="checkbox" ${checked(option.available ?? true)} ${disabled} /><span>Available</span></label><label class="toggle dash-toggle-inline"><input name="optionRemove_${index}" type="checkbox" ${disabled} /><span>Remove</span></label><input type="hidden" name="optionId" value="${escapeHtml(option.id)}" /></div>`).join("")}</div>${canWrite ? `<button class="button button--ghost" type="button" data-action="add-modifier-option">Add option</button>` : ""}
      <div class="dash-data-row__actions">${canWrite ? `<button class="button button--secondary" type="submit">${id ? "Save group" : "Create group"}</button>${id ? `<button class="button button--ghost" type="button" data-action="delete-modifier-group" data-modifier-group-id="${escapeHtml(id)}">Delete</button>` : ""}` : `<span class="muted-copy">Read only</span>`}</div>
    </form>
  `;
}

function renderModifierGroupPanel(canWrite: boolean) {
  const usage = new Map<string, number>();
  for (const item of uniqueMenuItems()) for (const assignment of item.modifierGroupAssignments) usage.set(assignment.modifierGroupId, (usage.get(assignment.modifierGroupId) ?? 0) + 1);
  return `<article class="dash-surface"><div class="dash-surface-head"><div><div class="dash-panel-title">Modifier Groups</div><h3 class="dash-surface-title">Reusable customer choices</h3><p class="muted-copy">Create a group once, then assign it to as many items as need it.</p></div></div>${canWrite ? renderModifierGroupForm(null, 0, true) : ""}<div class="dash-data-group__rows">${state.menuModifierGroups.length === 0 ? `<div class="dash-empty-surface"><p class="muted-copy">No modifier groups have been configured.</p></div>` : state.menuModifierGroups.map((group) => renderModifierGroupForm(group, usage.get(group.id) ?? 0, canWrite)).join("")}</div></article>`;
}

export function renderMenuSection() {
  if (isAllLocationsSelected()) {
    return `
      <section class="dash-section">
        ${renderSectionHeading({
          eyebrow: "Menu",
          title: "Location-specific menu management",
          description: "Choose one location to edit items, categories, pricing, visibility, and reusable modifiers."
        })}
        ${renderLocationSelectionNotice("Menu controls stay scoped to a single location so edits do not accidentally affect the wrong storefront.")}
      </section>
    `;
  }

  const canWrite = canCreateMenuItems(state.session?.operator ?? null, state.appConfig);
  const canToggleVisibility = canToggleMenuItemVisibility(state.session?.operator ?? null, state.appConfig);
  const accessNotice = !isPlatformManagedMenu(state.appConfig)
    ? `<article class="dash-surface dash-empty-surface"><p class="muted-copy">This store is using an external menu sync. Dashboard catalog mutations are disabled until the source is platform-managed.</p></article>`
    : "";
  const entries = getMenuTableEntries();
  const paginatedItems = paginateMenuItems(entries);
  const canCreateIntoExistingCategory = canWrite && state.menuCategories.length > 0;

  return `
    <section class="dash-section dash-section--menu">
      ${accessNotice}
      <div class="dash-order-toolbar dash-menu-toolbar">
        ${canCreateIntoExistingCategory ? `
          <button class="button button--ghost dash-menu-add-button" type="button" data-action="open-menu-create-wizard" aria-label="Add menu item" title="Add menu item">
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
          </button>
        ` : ""}
      </div>
      <article class="dash-surface dash-order-table-surface">
        ${renderMenuTable(paginatedItems.items)}
      </article>
      ${renderMenuPagination(paginatedItems.page, paginatedItems.pageCount)}
      ${renderCategoryPanel(canWrite)}
      ${renderModifierGroupPanel(canWrite)}
    </section>
    ${renderMenuItemDetailsModal(canWrite, canToggleVisibility)}
  `;
}
