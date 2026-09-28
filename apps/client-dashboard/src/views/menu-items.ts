import { isAllLocationsSelected, state } from "../state";
import { escapeHtml, formatMoney } from "../ui/format";
import {
  canCreateMenuItems,
  canToggleMenuItemVisibility,
  type OperatorMenuItem
} from "../model";
import { getItemCategories, getPageRange, getUniqueMenuItems, filterMenuItems } from "../menu-page-model";
import { renderModifierGroupForm } from "./menu-modifier-groups";

const menuItemsPageSize = 25;

function checked(value: boolean) {
  return value ? "checked" : "";
}

function renderItemCategories(item: OperatorMenuItem) {
  const memberships = getItemCategories(item, state.menuCategories);
  const primary = memberships.find((category) => category.categoryId === item.categoryId) ?? memberships[0];
  if (!primary) return `<span class="dash-menu-muted">Uncategorized</span>`;
  const additional = memberships.filter((category) => category.categoryId !== primary.categoryId);
  const title = memberships.map((category) => category.title).join(", ");
  return `<span class="dash-menu-category-value" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${escapeHtml(primary.title)}${additional.length ? `<span class="dash-menu-category-extra">+${additional.length}</span>` : ""}</span>`;
}

function renderItemActions(item: OperatorMenuItem, canWrite: boolean, canToggleVisibility: boolean) {
  if (!canWrite && !canToggleVisibility) return `<span class="dash-menu-muted">—</span>`;
  return `
    <details class="dash-menu-row-actions">
      <summary data-action="stop-menu-row-action" aria-label="Actions for ${escapeHtml(item.name)}">Actions</summary>
      <div class="dash-menu-row-actions__popover" role="group" aria-label="${escapeHtml(item.name)} actions">
        ${canWrite ? `<button type="button" data-action="toggle-menu-availability" data-item-id="${escapeHtml(item.itemId)}" data-available="${item.available ? "false" : "true"}" ${state.busyMenuItemId === item.itemId ? "disabled" : ""}>Mark ${item.available ? "sold out" : "available"}</button>` : ""}
        ${canToggleVisibility ? `<button type="button" data-action="toggle-menu-visibility" data-item-id="${escapeHtml(item.itemId)}" data-visible="${item.visible ? "false" : "true"}" ${state.busyMenuVisibilityItemId === item.itemId ? "disabled" : ""}>${item.visible ? "Hide" : "Show"}</button>` : ""}
        ${canWrite ? `<button class="dash-menu-row-actions__danger" type="button" data-action="delete-menu-item" data-item-id="${escapeHtml(item.itemId)}" ${state.busyDeleteMenuItemId === item.itemId ? "disabled" : ""}>Delete item</button>` : ""}
      </div>
    </details>
  `;
}

function renderMenuPagination(page: number, pageCount: number, total: number) {
  if (pageCount <= 1) return `<span class="dash-menu-pagination__range">${total} item${total === 1 ? "" : "s"}</span>`;
  const { start, end } = getPageRange(page, menuItemsPageSize, total);
  const first = Math.max(1, Math.min(page - 2, pageCount - 4));
  const last = Math.min(pageCount, first + 4);
  return `
    <div class="dash-menu-pagination">
      <span class="dash-menu-pagination__range">${start}–${end} of ${total}</span>
      <nav aria-label="Menu items pages" class="dash-menu-pagination__pages">
        <button type="button" data-action="set-menu-items-page" data-menu-items-page="${page - 1}" aria-label="Previous page" ${page === 1 ? "disabled" : ""}>Previous</button>
        ${Array.from({ length: last - first + 1 }, (_, index) => first + index).map((number) => `<button type="button" data-action="set-menu-items-page" data-menu-items-page="${number}" aria-label="Page ${number}" ${number === page ? 'aria-current="page"' : ""}>${number}</button>`).join("")}
        <button type="button" data-action="set-menu-items-page" data-menu-items-page="${page + 1}" aria-label="Next page" ${page === pageCount ? "disabled" : ""}>Next</button>
      </nav>
    </div>
  `;
}

function renderItemsTable(items: readonly OperatorMenuItem[], canWrite: boolean, canToggleVisibility: boolean) {
  if (state.loading && state.menuCategories.length === 0) {
    return `<div class="dash-menu-table-skeleton" aria-label="Loading menu items">${Array.from({ length: 6 }, () => '<span class="dash-menu-table-skeleton__row"></span>').join("")}</div>`;
  }
  if (items.length === 0) {
    const hasFilters = Boolean(state.menuSearch.trim()) || state.menuCategoryFilter !== "all" || state.menuAvailabilityFilter !== "all" || state.menuVisibilityFilter !== "all";
    if (hasFilters) return `<div class="dash-menu-empty"><strong>No items match these filters</strong><span>Try changing the search or filters.</span></div>`;
    if (getUniqueMenuItems(state.menuCategories).length === 0) {
      return `<div class="dash-menu-empty"><strong>No items yet</strong><span>Add your first item to start building this menu.</span>${canWrite && state.menuCategories.length ? '<button class="button button--secondary" type="button" data-action="open-menu-create-item">Add item</button>' : ""}</div>`;
    }
    return `<div class="dash-menu-empty"><strong>No items found</strong><span>There are no items in this location.</span></div>`;
  }

  const pageCount = Math.max(1, Math.ceil(items.length / menuItemsPageSize));
  const page = Math.min(Math.max(state.menuItemsPage, 1), pageCount);
  if (page !== state.menuItemsPage) state.menuItemsPage = page;
  const pageItems = items.slice((page - 1) * menuItemsPageSize, page * menuItemsPageSize);
  return `
    <div class="dash-order-table-wrap dash-menu-table-wrap">
      <table class="dash-order-table dash-order-table--menu dash-menu-table">
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Category</th>
            <th scope="col" class="dash-order-table__amount-heading">Price</th>
            <th scope="col">Availability</th>
            <th scope="col">Visibility</th>
            <th scope="col" class="dash-menu-table__actions-heading"><span class="visually-hidden">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          ${pageItems.map((item) => `
            <tr class="dash-order-table__row dash-menu-table__row" tabindex="0" aria-label="Open item editor for ${escapeHtml(item.name)}" aria-haspopup="dialog" data-menu-item-row="${escapeHtml(item.itemId)}" data-action="open-menu-item">
              <td>
                <div class="dash-order-table__order dash-menu-table__identity">
                  ${item.imageUrl ? `<img class="dash-menu-table__image" src="${escapeHtml(item.imageUrl)}" alt="" aria-hidden="true" loading="lazy" decoding="async" />` : '<span class="dash-menu-table__image dash-menu-table__image--empty" aria-hidden="true"></span>'}
                  <strong class="dash-menu-table__item-name">${escapeHtml(item.name)}</strong>
                  ${item.featured ? '<span class="dash-menu-featured">Featured</span>' : ""}
                </div>
              </td>
              <td>${renderItemCategories(item)}</td>
              <td class="dash-order-table__amount">${formatMoney(item.priceCents)}</td>
              <td><span class="dash-menu-state">${item.available ? "Available" : "Sold out"}</span></td>
              <td><span class="dash-menu-state">${item.visible ? "Visible" : "Hidden"}</span></td>
              <td class="dash-menu-table__actions">${renderItemActions(item, canWrite, canToggleVisibility)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    ${renderMenuPagination(page, pageCount, items.length)}
  `;
}

export function renderItemsTab() {
  const canWrite = canCreateMenuItems(state.session?.operator ?? null, state.appConfig);
  const canToggleVisibility = canToggleMenuItemVisibility(state.session?.operator ?? null, state.appConfig);
  const uniqueItems = getUniqueMenuItems(state.menuCategories);
  const filteredItems = filterMenuItems(uniqueItems, state.menuCategories, state.menuModifierGroups, {
    search: state.menuSearch,
    categoryId: state.menuCategoryFilter,
    availability: state.menuAvailabilityFilter,
    visibility: state.menuVisibilityFilter
  });
  const allLocationNotice = isAllLocationsSelected();
  return `
    ${allLocationNotice ? '<div class="dash-menu-readonly-note" role="status">Choose one location to manage menu items.</div>' : ""}
    ${!allLocationNotice ? `
      <div class="dash-menu-toolbar" role="search" aria-label="Filter menu items">
        <label class="dash-menu-search field"><span class="visually-hidden">Search items</span><input type="search" placeholder="Search items…" value="${escapeHtml(state.menuSearch)}" data-control="menu-search" /></label>
        <label class="dash-menu-filter"><span class="visually-hidden">Filter by category</span><select data-control="menu-category-filter"><option value="all" ${state.menuCategoryFilter === "all" ? "selected" : ""}>All categories</option>${state.menuCategories.map((category) => `<option value="${escapeHtml(category.categoryId)}" ${state.menuCategoryFilter === category.categoryId ? "selected" : ""}>${escapeHtml(category.title)}</option>`).join("")}</select></label>
        <label class="dash-menu-filter"><span class="visually-hidden">Filter by availability</span><select data-control="menu-availability-filter"><option value="all" ${state.menuAvailabilityFilter === "all" ? "selected" : ""}>All availability</option><option value="available" ${state.menuAvailabilityFilter === "available" ? "selected" : ""}>Available</option><option value="sold-out" ${state.menuAvailabilityFilter === "sold-out" ? "selected" : ""}>Sold out</option></select></label>
        <label class="dash-menu-filter"><span class="visually-hidden">Filter by visibility</span><select data-control="menu-visibility-filter"><option value="all" ${state.menuVisibilityFilter === "all" ? "selected" : ""}>All visibility</option><option value="visible" ${state.menuVisibilityFilter === "visible" ? "selected" : ""}>Visible</option><option value="hidden" ${state.menuVisibilityFilter === "hidden" ? "selected" : ""}>Hidden</option></select></label>
        ${canWrite ? `<button class="button button--secondary dash-menu-toolbar__add" type="button" data-action="open-menu-create-item">Add item</button>` : ""}
      </div>
      ${renderItemsTable(filteredItems, canWrite, canToggleVisibility)}
    ` : ""}
  `;
}

export function renderModifierAssignmentRow(itemId: string, groupId: string, sortOrder: number, assignmentCount: number, canWrite: boolean) {
  const group = state.menuModifierGroups.find((candidate) => candidate.id === groupId);
  const label = group?.label ?? "Unavailable modifier group";
  return `
    <div class="dash-menu-assignment-row" data-assignment-group-id="${escapeHtml(groupId)}">
      <input type="hidden" name="modifierGroupId" value="${escapeHtml(groupId)}" />
      <div class="dash-menu-assignment-row__name"><strong>${escapeHtml(label)}</strong><span>${group?.selectionType === "multiple" ? "Multiple" : "Single"}${group?.required ? " · Required" : " · Optional"}</span></div>
      <div class="dash-menu-order-controls">
        <button type="button" data-action="move-item-modifier-group" data-item-id="${escapeHtml(itemId)}" data-direction="up" aria-label="Move ${escapeHtml(label)} up" ${!canWrite || sortOrder === 0 ? "disabled" : ""}>Up</button>
        <button type="button" data-action="move-item-modifier-group" data-item-id="${escapeHtml(itemId)}" data-direction="down" aria-label="Move ${escapeHtml(label)} down" ${!canWrite || sortOrder === assignmentCount - 1 ? "disabled" : ""}>Down</button>
        ${canWrite ? `<button class="dash-menu-remove-assignment" type="button" data-action="remove-item-modifier-group" data-item-id="${escapeHtml(itemId)}" aria-label="Remove ${escapeHtml(label)} from this item">Remove</button>` : ""}
      </div>
    </div>
  `;
}

export function renderQuickCreateDialog() {
  if (state.menuDialogKind !== "create-item") return "";
  const canWrite = canCreateMenuItems(state.session?.operator ?? null, state.appConfig);
  const canToggleVisibility = canToggleMenuItemVisibility(state.session?.operator ?? null, state.appConfig);
  return `
    <div class="dash-modal dash-menu-modal dash-menu-modal--opening" data-menu-dialog-root>
      <button class="dash-modal__backdrop" type="button" data-action="close-menu-dialog" aria-label="Close add item"></button>
      <section class="dash-menu-modal__panel dash-menu-modal__panel--compact" role="dialog" aria-modal="true" aria-labelledby="menu-create-title" tabindex="-1">
        <header class="dash-menu-modal__header"><div><h3 id="menu-create-title">Add item</h3><p>Start with the basics. You can add an image and modifier groups next.</p></div><button class="dash-menu-modal__close" type="button" data-action="close-menu-dialog" aria-label="Close add item">Close</button></header>
        ${state.menuCategories.length ? `
          <form class="dash-menu-modal__body" data-form="menu-item-create-quick">
            <label class="field"><span>Name</span><input name="name" required maxlength="160" autocomplete="off" /></label>
            <label class="field"><span>Category</span><select name="categoryId" required>${state.menuCategories.map((category) => `<option value="${escapeHtml(category.categoryId)}">${escapeHtml(category.title)}</option>`).join("")}</select></label>
            <label class="field"><span>Base price</span><input name="price" type="number" min="0" step="0.01" inputmode="decimal" required /></label>
            <div class="dash-menu-toggle-grid"><label class="dash-menu-toggle"><input type="checkbox" name="visible" checked ${canToggleVisibility ? "" : "disabled"} /><span>Visible</span></label><label class="dash-menu-toggle"><input type="checkbox" name="available" checked ${canWrite ? "" : "disabled"} /><span>Available</span></label></div>
            <footer class="dash-menu-modal__footer"><button class="button button--ghost" type="button" data-action="close-menu-dialog">Cancel</button><button class="button button--secondary" type="submit" ${!canWrite || state.creatingMenuItem ? "disabled" : ""}>${state.creatingMenuItem ? "Creating…" : "Create and edit"}</button></footer>
          </form>
        ` : `<div class="dash-menu-empty"><strong>Create a category first</strong><span>Every item needs at least one category.</span><button class="button button--secondary" type="button" data-action="switch-menu-tab" data-menu-tab="categories">Go to categories</button></div>`}
      </section>
    </div>
  `;
}

function renderMenuItemEditorForm(item: OperatorMenuItem, canWrite: boolean, canToggleVisibility: boolean) {
  const categoryIds = new Set(item.categoryIds?.length ? item.categoryIds : [item.categoryId]);
  const assignments = [...(item.modifierGroupAssignments ?? [])].sort((left, right) => left.sortOrder - right.sortOrder);
  const assignedIds = new Set(assignments.map((assignment) => assignment.modifierGroupId));
  const unassignedGroups = state.menuModifierGroups.filter((group) => !assignedIds.has(group.id));
  return `
    <form class="dash-menu-editor-form" data-form="menu-item" data-item-id="${escapeHtml(item.itemId)}">
      <section class="dash-menu-editor-section">
        <h4>General</h4>
        <div class="dash-menu-editor-grid">
          <div class="dash-menu-image-editor">
            <div class="dash-menu-image-preview">${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" />` : '<div class="dash-menu-image-preview__empty">No image</div>'}</div>
            <label class="field"><span>${item.imageUrl ? "Replace image" : "Image"}</span><input name="imageFile" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" ${canWrite ? "" : "disabled"} /></label>
            ${item.imageUrl && canWrite ? '<label class="dash-menu-toggle"><input type="checkbox" name="removeImage" /><span>Remove current image</span></label>' : ""}
          </div>
          <div class="dash-menu-editor-fields">
            <label class="field"><span>Name</span><input name="name" value="${escapeHtml(item.name)}" maxlength="160" ${canWrite ? "" : "disabled"} required /></label>
            <label class="field"><span>Description</span><textarea name="description" rows="3" maxlength="2000" ${canWrite ? "" : "disabled"}>${escapeHtml(item.description ?? "")}</textarea></label>
            <label class="field"><span>Badges</span><input name="badgeCodes" value="${escapeHtml((item.badgeCodes ?? []).join(", "))}" placeholder="New, popular" ${canWrite ? "" : "disabled"} /></label>
            <label class="dash-menu-toggle"><input type="checkbox" name="featured" ${checked(item.featured)} ${canWrite ? "" : "disabled"} /><span>Featured on the customer menu</span></label>
          </div>
        </div>
      </section>
      <section class="dash-menu-editor-section">
        <h4>Pricing</h4>
        <label class="field dash-menu-price-field"><span>Base price</span><span class="dash-menu-price-input"><span>$</span><input name="price" type="number" min="0" step="0.01" inputmode="decimal" value="${(item.priceCents / 100).toFixed(2)}" ${canWrite ? "" : "disabled"} required /></span></label>
      </section>
      <section class="dash-menu-editor-section">
        <h4>Availability</h4>
        <div class="dash-menu-toggle-grid">
          <label class="dash-menu-toggle"><input type="checkbox" name="available" ${checked(item.available)} ${canWrite ? "" : "disabled"} /><span>Available to order</span></label>
          <label class="dash-menu-toggle"><input type="checkbox" name="visible" ${checked(item.visible)} ${canToggleVisibility ? "" : "disabled"} /><span>Visible in customer menu</span></label>
        </div>
        ${!canWrite && canToggleVisibility ? `<div class="dash-menu-editor-inline-action"><span>Visibility can be changed separately.</span><button class="button button--ghost" type="button" data-action="toggle-menu-visibility" data-item-id="${escapeHtml(item.itemId)}" data-visible="${item.visible ? "false" : "true"}">${item.visible ? "Hide item" : "Show item"}</button></div>` : ""}
      </section>
      <section class="dash-menu-editor-section">
        <h4>Categories</h4>
        <p class="dash-menu-section-help">An item can appear in more than one category. Choose which category appears first on the customer menu.</p>
        <div class="dash-menu-check-list">${state.menuCategories.map((category) => `<label class="dash-menu-check-row"><input type="checkbox" name="categoryIds" value="${escapeHtml(category.categoryId)}" ${checked(categoryIds.has(category.categoryId))} ${canWrite ? "" : "disabled"} /><span>${escapeHtml(category.title)}</span></label>`).join("")}</div>
        <label class="field dash-menu-primary-category"><span>Primary category</span><select name="primaryCategoryId" data-control="item-primary-category" ${canWrite ? "" : "disabled"} required>${(item.categoryIds?.length ? item.categoryIds : [item.categoryId]).filter((id) => categoryIds.has(id)).map((id) => state.menuCategories.find((category) => category.categoryId === id)).filter((category): category is NonNullable<typeof category> => Boolean(category)).map((category) => `<option value="${escapeHtml(category.categoryId)}" ${category.categoryId === (item.categoryIds?.[0] ?? item.categoryId) ? "selected" : ""}>${escapeHtml(category.title)}</option>`).join("")}</select></label>
      </section>
      <section class="dash-menu-editor-section">
        <h4>Modifier Groups</h4>
        <p class="dash-menu-section-help">Use reusable groups. Selection rules and option prices stay with each group.</p>
        <div class="dash-menu-assignment-list" data-assignment-list="${escapeHtml(item.itemId)}" data-can-write="${canWrite}">
          ${assignments.length ? assignments.map((assignment, index) => renderModifierAssignmentRow(item.itemId, assignment.modifierGroupId, index, assignments.length, canWrite)).join("") : '<p class="dash-menu-empty-inline">No modifier groups assigned.</p>'}
        </div>
        ${canWrite ? `<details class="dash-menu-group-picker"><summary>Add existing modifier group</summary><div class="dash-menu-group-picker__body"><label class="field"><span>Search groups</span><input type="search" data-control="item-modifier-search" placeholder="Search modifier groups…" /></label><div class="dash-menu-group-picker__options">${unassignedGroups.map((group) => `<div class="dash-menu-group-picker__option" data-modifier-group-id="${escapeHtml(group.id)}" data-group-search="${escapeHtml(`${group.label} ${group.selectionType}`.toLocaleLowerCase())}"><span><strong>${escapeHtml(group.label)}</strong><small>${group.selectionType === "multiple" ? "Multiple" : "Single"}${group.required ? " · Required" : " · Optional"}</small></span><button class="button button--ghost" type="button" data-action="add-item-modifier-group" data-item-id="${escapeHtml(item.itemId)}" data-modifier-group-id="${escapeHtml(group.id)}">Add</button></div>`).join("") || '<p class="dash-menu-empty-inline">All modifier groups are already assigned.</p>'}</div><button class="dash-menu-create-group-link" type="button" data-action="open-item-modifier-group-create" data-item-id="${escapeHtml(item.itemId)}">Create new modifier group</button></div></details>` : ""}
      </section>
      ${canWrite ? `<footer class="dash-menu-editor-footer"><button class="button button--ghost" type="button" data-action="delete-menu-item" data-item-id="${escapeHtml(item.itemId)}">Delete item</button><span></span><button class="button button--ghost" type="button" data-action="close-menu-dialog">Cancel</button><button class="button button--secondary" type="submit" ${state.busyMenuItemId === item.itemId ? "disabled" : ""}>${state.busyMenuItemId === item.itemId ? "Saving…" : "Save changes"}</button></footer>` : '<div class="dash-menu-readonly-note">This menu is read only for your account.</div>'}
    </form>
  `;
}

export function renderMenuItemDialog() {
  if (state.menuDialogKind !== "item" || !state.menuDialogEntityId) return "";
  const item = getUniqueMenuItems(state.menuCategories).find((candidate) => candidate.itemId === state.menuDialogEntityId);
  if (!item) return "";
  const canWrite = canCreateMenuItems(state.session?.operator ?? null, state.appConfig);
  const canToggleVisibility = canToggleMenuItemVisibility(state.session?.operator ?? null, state.appConfig);
  return `
    <div class="dash-modal dash-menu-modal dash-menu-modal--sheet${state.menuDialogOpening ? " dash-menu-modal--opening" : ""}${state.menuDialogClosing ? " dash-menu-modal--closing" : ""}" data-menu-dialog-root>
      <button class="dash-modal__backdrop" type="button" data-action="close-menu-dialog" aria-label="Close item editor"></button>
      <section class="dash-menu-modal__panel dash-menu-modal__panel--wide" role="dialog" aria-modal="true" aria-labelledby="menu-item-editor-title" tabindex="-1">
        <header class="dash-menu-modal__header"><div><h3 id="menu-item-editor-title">${escapeHtml(item.name)}</h3><p>${escapeHtml(item.categoryTitle)}</p></div><button class="dash-menu-modal__close" type="button" data-action="close-menu-dialog" aria-label="Close item editor">Close</button></header>
        <div class="dash-menu-modal__body dash-menu-editor-body">${renderMenuItemEditorForm(item, canWrite, canToggleVisibility)}</div>
        ${renderItemModifierGroupCreateDialog(item.itemId)}
      </section>
    </div>
  `;
}

function renderItemModifierGroupCreateDialog(itemId: string) {
  return `
    <div class="dash-menu-nested-modal" data-menu-group-create-dialog hidden>
      <button class="dash-modal__backdrop" type="button" data-action="close-item-modifier-group-create" aria-label="Close new modifier group"></button>
      <section class="dash-menu-modal__panel dash-menu-modal__panel--group" role="dialog" aria-modal="true" aria-labelledby="menu-new-group-title" tabindex="-1">
        <header class="dash-menu-modal__header"><div><h3 id="menu-new-group-title">Create modifier group</h3><p>It will be assigned to ${escapeHtml(getUniqueMenuItems(state.menuCategories).find((item) => item.itemId === itemId)?.name ?? "this item")} when you save the item.</p></div><button class="dash-menu-modal__close" type="button" data-action="close-item-modifier-group-create" aria-label="Close new modifier group">Close</button></header>
        <div class="dash-menu-modal__body">${renderModifierGroupForm(null, { itemId })}</div>
      </section>
    </div>
  `;
}
