import { isAllLocationsSelected, state } from "../state";
import { escapeHtml } from "../ui/format";
import { isPlatformManagedMenu } from "@lattelink/contracts-catalog";
import { renderItemsTab, renderMenuItemDialog, renderQuickCreateDialog } from "./menu-items";
import { renderCategoriesTab, renderCategoryDialog } from "./menu-categories";
import { renderModifierGroupDialog, renderModifierGroupsTab } from "./menu-modifier-groups";

const tabs = [
  { id: "items", label: "Items" },
  { id: "categories", label: "Categories" },
  { id: "modifier-groups", label: "Modifier Groups" }
] as const;

function renderMenuTabs() {
  return `
    <div class="dash-menu-tabs" role="tablist" aria-label="Menu management">
      ${tabs.map((tab) => `<button class="dash-menu-tab${state.menuActiveTab === tab.id ? " dash-menu-tab--active" : ""}" id="menu-tab-${tab.id}" type="button" role="tab" aria-selected="${state.menuActiveTab === tab.id}" aria-controls="menu-panel-${tab.id}" tabindex="${state.menuActiveTab === tab.id ? "0" : "-1"}" data-action="set-menu-tab" data-menu-tab="${tab.id}">${escapeHtml(tab.label)}</button>`).join("")}
    </div>
  `;
}

function renderMenuTabPanels() {
  return tabs.map((tab) => {
    const content = tab.id === "categories"
      ? renderCategoriesTab()
      : tab.id === "modifier-groups"
        ? renderModifierGroupsTab()
        : renderItemsTab();
    return `<div class="dash-menu-panel" id="menu-panel-${tab.id}" role="tabpanel" aria-labelledby="menu-tab-${tab.id}" tabindex="0" ${state.menuActiveTab === tab.id ? "" : "hidden"}>${content}</div>`;
  }).join("");
}

function renderReadOnlyNotice() {
  if (isPlatformManagedMenu(state.appConfig)) return "";
  return `<div class="dash-menu-readonly-note" role="status"><span>Managed by connected source</span><span>Menu changes are made in the connected system.</span></div>`;
}

export function renderMenuSection() {
  const allLocationsSelected = isAllLocationsSelected();
  return `
    <section class="dash-section dash-section--menu">
      ${renderMenuTabs()}
      ${renderReadOnlyNotice()}
      ${state.menuLoadError ? `<div class="dash-menu-error" role="alert"><span>${escapeHtml(state.menuLoadError)}</span><button class="button button--ghost" type="button" data-action="retry-menu-load">Try again</button></div>` : ""}
      ${allLocationsSelected
        ? `<div class="dash-menu-empty"><strong>Choose one location</strong><span>Menu items, category membership, pricing, and modifier assignments are managed per location.</span></div>`
        : renderMenuTabPanels()}
      ${state.menuDialogKind === "item" ? renderMenuItemDialog() : ""}
      ${state.menuDialogKind === "create-item" ? renderQuickCreateDialog() : ""}
      ${state.menuDialogKind === "category" || state.menuDialogKind === "create-category" ? renderCategoryDialog() : ""}
      ${state.menuDialogKind === "modifier-group" || state.menuDialogKind === "create-modifier-group" ? renderModifierGroupDialog() : ""}
    </section>
  `;
}
