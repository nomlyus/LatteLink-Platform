import { state } from "../state";
import { escapeHtml } from "../ui/format";
import { canCreateMenuItems, type OperatorMenuCategory, type OperatorMenuItem } from "../model";
import { getUniqueMenuItems } from "../menu-page-model";

function checked(value: boolean) {
  return value ? "checked" : "";
}

function renderCategoryRow(category: OperatorMenuCategory, index: number, canWrite: boolean) {
  return `
    <div class="dash-menu-management-row">
      <button class="dash-menu-management-row__main" type="button" data-action="open-menu-category" data-category-id="${escapeHtml(category.categoryId)}" aria-label="Edit ${escapeHtml(category.title)}">
        <span class="dash-menu-management-row__name">${escapeHtml(category.title)}</span>
        <span class="dash-menu-management-row__meta">${category.items.length} item${category.items.length === 1 ? "" : "s"}</span>
      </button>
      ${canWrite ? `<div class="dash-menu-order-controls"><button type="button" data-action="reorder-menu-category" data-category-id="${escapeHtml(category.categoryId)}" data-direction="up" aria-label="Move ${escapeHtml(category.title)} up" ${index === 0 ? "disabled" : ""}>Up</button><button type="button" data-action="reorder-menu-category" data-category-id="${escapeHtml(category.categoryId)}" data-direction="down" aria-label="Move ${escapeHtml(category.title)} down" ${index === state.menuCategories.length - 1 ? "disabled" : ""}>Down</button><button class="dash-menu-remove-assignment" type="button" data-action="delete-menu-category" data-category-id="${escapeHtml(category.categoryId)}">Delete</button></div>` : ""}
    </div>
  `;
}

export function renderCategoriesTab() {
  const canWrite = canCreateMenuItems(state.session?.operator ?? null, state.appConfig);
  return `
    <div class="dash-menu-list-toolbar"><div><h3>Categories</h3><p>Organize the menu that customers browse.</p></div>${canWrite ? '<button class="button button--secondary" type="button" data-action="open-menu-create-category">Add category</button>' : ""}</div>
    ${state.menuCategories.length ? `<div class="dash-menu-management-list" role="list">${state.menuCategories.map((category, index) => renderCategoryRow(category, index, canWrite)).join("")}</div>` : `<div class="dash-menu-empty"><strong>No categories yet</strong><span>Create a category before adding menu items.</span>${canWrite ? '<button class="button button--secondary" type="button" data-action="open-menu-create-category">Add category</button>' : ""}</div>`}
  `;
}

function categoryItems(categoryId: string) {
  const category = state.menuCategories.find((candidate) => candidate.categoryId === categoryId);
  const items = getUniqueMenuItems(state.menuCategories);
  const memberIds = new Set(category?.items.map((item) => item.itemId) ?? []);
  return [
    ...items.filter((item) => memberIds.has(item.itemId)),
    ...items.filter((item) => !memberIds.has(item.itemId)).sort((left, right) => left.name.localeCompare(right.name))
  ];
}

function renderCategoryMembershipRow(categoryId: string, item: OperatorMenuItem, canWrite: boolean) {
  const categoryIds = item.categoryIds?.length ? item.categoryIds : [item.categoryId];
  const isMember = categoryIds.includes(categoryId);
  const isPrimary = item.categoryId === categoryId;
  const membershipLocked = isMember && categoryIds.length <= 1;
  const primaryItems = state.menuCategories.find((category) => category.categoryId === categoryId)?.items.filter((candidate) => candidate.categoryId === categoryId) ?? [];
  const primaryItemIndex = primaryItems.findIndex((candidate) => candidate.itemId === item.itemId);
  return `
    <div class="dash-menu-category-item" data-category-item-row data-item-name="${escapeHtml(item.name.toLocaleLowerCase())}">
      <label class="dash-menu-check-row" title="${membershipLocked ? "Items must stay in at least one category." : ""}">
        <input type="checkbox" name="categoryMemberItemIds" value="${escapeHtml(item.itemId)}" ${checked(isMember)} ${canWrite && !membershipLocked ? "" : "disabled"} />
        <span>${escapeHtml(item.name)}${isPrimary ? '<small class="dash-menu-primary-note">Primary category</small>' : ""}</span>
      </label>
      ${isMember && isPrimary && canWrite ? `<div class="dash-menu-order-controls"><button type="button" data-action="move-category-item" data-category-id="${escapeHtml(categoryId)}" data-item-id="${escapeHtml(item.itemId)}" data-direction="up" aria-label="Move ${escapeHtml(item.name)} up in this category" ${primaryItemIndex <= 0 ? "disabled" : ""}>Up</button><button type="button" data-action="move-category-item" data-category-id="${escapeHtml(categoryId)}" data-item-id="${escapeHtml(item.itemId)}" data-direction="down" aria-label="Move ${escapeHtml(item.name)} down in this category" ${primaryItemIndex < 0 || primaryItemIndex >= primaryItems.length - 1 ? "disabled" : ""}>Down</button></div>` : isMember ? '<span class="dash-menu-primary-note">Order follows primary category</span>' : ""}
    </div>
  `;
}

export function renderCategoryDialog() {
  const creating = state.menuDialogKind === "create-category";
  if (!creating && state.menuDialogKind !== "category") return "";
  const category = creating ? null : state.menuCategories.find((candidate) => candidate.categoryId === state.menuDialogEntityId) ?? null;
  if (!creating && !category) return "";
  const canWrite = canCreateMenuItems(state.session?.operator ?? null, state.appConfig);
  return `
    <div class="dash-modal dash-menu-modal dash-menu-modal--sheet${state.menuDialogOpening ? " dash-menu-modal--opening" : ""}${state.menuDialogClosing ? " dash-menu-modal--closing" : ""}" data-menu-dialog-root>
      <button class="dash-modal__backdrop" type="button" data-action="close-menu-dialog" aria-label="Close category editor"></button>
      <section class="dash-menu-modal__panel dash-menu-modal__panel--wide" role="dialog" aria-modal="true" aria-labelledby="menu-category-editor-title" tabindex="-1">
        <header class="dash-menu-modal__header"><div><h3 id="menu-category-editor-title">${creating ? "Add category" : escapeHtml(category!.title)}</h3><p>${creating ? "Create a place to organize menu items." : `${category!.items.length} item${category!.items.length === 1 ? "" : "s"} in this category`}</p></div><button class="dash-menu-modal__close" type="button" data-action="close-menu-dialog" aria-label="Close category editor">Close</button></header>
        ${creating ? `
          <form class="dash-menu-modal__body dash-menu-simple-form" data-form="menu-category-create">
            <label class="field"><span>Name</span><input name="title" required maxlength="120" autocomplete="off" /></label>
            <label class="field"><span>Description</span><textarea name="description" rows="3" maxlength="1000"></textarea></label>
            <label class="dash-menu-toggle"><input type="checkbox" name="visible" checked /><span>Visible to customers</span></label>
            <input type="hidden" name="sortOrder" value="${state.menuCategories.length}" />
            <footer class="dash-menu-modal__footer"><button class="button button--ghost" type="button" data-action="close-menu-dialog">Cancel</button><button class="button button--secondary" type="submit">Create category</button></footer>
          </form>
        ` : `
          <form class="dash-menu-modal__body dash-menu-category-editor" data-form="menu-category" data-category-id="${escapeHtml(category!.categoryId)}">
            <section class="dash-menu-editor-section"><h4>Category details</h4><div class="dash-menu-editor-fields"><label class="field"><span>Name</span><input name="title" value="${escapeHtml(category!.title)}" ${canWrite ? "" : "disabled"} required /></label><label class="field"><span>Description</span><textarea name="description" rows="3" ${canWrite ? "" : "disabled"}>${escapeHtml(category!.description ?? "")}</textarea></label><label class="dash-menu-toggle"><input type="checkbox" name="visible" ${checked(category!.visible)} ${canWrite ? "" : "disabled"} /><span>Visible to customers</span></label></div><input type="hidden" name="sortOrder" value="${category!.sortOrder}" /></section>
            <section class="dash-menu-editor-section"><div class="dash-menu-section-heading"><div><h4>Items</h4><p class="dash-menu-section-help">Add items to this category or remove their membership. Removing a category membership keeps the item itself.</p></div><label class="field dash-menu-membership-search"><span class="visually-hidden">Search items</span><input type="search" data-control="category-item-search" value="${escapeHtml(state.menuCategoryItemSearch)}" placeholder="Search items…" /></label></div><div class="dash-menu-category-item-list">${categoryItems(category!.categoryId).map((item) => renderCategoryMembershipRow(category!.categoryId, item, canWrite)).join("")}</div><p class="dash-menu-section-help">Items must belong to at least one category. Reordering is available from an item’s primary category.</p></section>
            <p class="dash-menu-section-help dash-menu-delete-note">Deleting this category removes the category and its memberships, not the items themselves.</p>
            <footer class="dash-menu-editor-footer">${canWrite ? `<button class="button button--ghost dash-menu-delete-action" type="button" data-action="delete-menu-category" data-category-id="${escapeHtml(category!.categoryId)}">Delete category</button>` : ""}<span></span><button class="button button--ghost" type="button" data-action="close-menu-dialog">Close</button>${canWrite ? '<button class="button button--secondary" type="submit">Save category</button>' : ""}</footer>
          </form>
        `}
      </section>
    </div>
  `;
}
