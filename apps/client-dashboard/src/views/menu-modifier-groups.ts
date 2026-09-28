import { state } from "../state";
import { escapeHtml } from "../ui/format";
import { canCreateMenuItems, type OperatorModifierGroup } from "../model";
import { getModifierGroupUsage } from "../menu-page-model";

function checked(value: boolean) {
  return value ? "checked" : "";
}

function dollarInputValue(cents: number) {
  return (cents / 100).toFixed(2);
}

function renderModifierGroupRow(group: OperatorModifierGroup, usageCount: number) {
  return `
    <div class="dash-menu-management-row" data-modifier-group-row data-group-search="${escapeHtml(`${group.label} ${group.description ?? ""} ${group.selectionType}`.toLocaleLowerCase())}">
      <button class="dash-menu-management-row__main" type="button" data-action="open-modifier-group" data-modifier-group-id="${escapeHtml(group.id)}" aria-label="Edit ${escapeHtml(group.label)}">
        <span class="dash-menu-management-row__name">${escapeHtml(group.label)}</span>
        <span class="dash-menu-management-row__meta">${usageCount} item${usageCount === 1 ? "" : "s"} · ${group.selectionType === "multiple" ? "Multiple selection" : "Single selection"}${group.required ? " · Required" : ""}</span>
      </button>
    </div>
  `;
}

export function renderModifierGroupsTab() {
  const canWrite = canCreateMenuItems(state.session?.operator ?? null, state.appConfig);
  const usage = getModifierGroupUsage(state.menuCategories);
  const query = state.menuModifierGroupSearch.trim().toLocaleLowerCase();
  const groups = state.menuModifierGroups.filter((group) => !query || `${group.label} ${group.description} ${group.selectionType}`.toLocaleLowerCase().includes(query));
  return `
    <div class="dash-menu-list-toolbar"><div><h3>Modifier Groups</h3><p>Define reusable choices once, then assign them to items.</p></div><div class="dash-menu-list-toolbar__actions"><label class="field dash-menu-search"><span class="visually-hidden">Search modifier groups</span><input type="search" data-control="modifier-group-search" value="${escapeHtml(state.menuModifierGroupSearch)}" placeholder="Search groups…" /></label>${canWrite ? '<button class="button button--secondary" type="button" data-action="open-menu-create-modifier-group">Add modifier group</button>' : ""}</div></div>
    ${groups.length ? `<div class="dash-menu-management-list" role="list">${groups.map((group) => renderModifierGroupRow(group, usage.get(group.id)?.length ?? 0)).join("")}</div>` : `<div class="dash-menu-empty"><strong>${state.menuModifierGroups.length ? "No groups match this search" : "No modifier groups yet"}</strong><span>${state.menuModifierGroups.length ? "Try another search." : "Create a reusable group such as size, milk, or sweetness."}</span>${canWrite && !state.menuModifierGroups.length ? '<button class="button button--secondary" type="button" data-action="open-menu-create-modifier-group">Add modifier group</button>' : ""}</div>`}
  `;
}

export function renderModifierOptionEditorRow(group: OperatorModifierGroup | null, option: OperatorModifierGroup["options"][number] | null, index: number, canWrite: boolean, optionCount = group?.options.length ?? 1) {
  const disabled = canWrite ? "" : "disabled";
  const id = option?.id ?? "";
  return `
    <div class="dash-menu-option-editor" data-modifier-option-row>
      <label class="field"><span>Option</span><input name="optionLabel" value="${escapeHtml(option?.label ?? "")}" ${disabled} required /></label>
      <label class="field"><span>Description</span><input name="optionDescription" value="${escapeHtml(option?.description ?? "")}" ${disabled} /></label>
      <label class="field"><span>Price change</span><span class="dash-menu-price-input"><span>$</span><input name="optionPriceDelta" type="number" step="0.01" inputmode="decimal" value="${dollarInputValue(option?.priceDeltaCents ?? 0)}" ${disabled} /></span></label>
      <div class="dash-menu-option-editor__toggles"><label class="dash-menu-toggle"><input name="optionDefault" type="checkbox" ${checked(option?.default ?? false)} ${disabled} /><span>Default</span></label><label class="dash-menu-toggle"><input name="optionAvailable" type="checkbox" ${checked(option?.available ?? true)} ${disabled} /><span>Available</span></label></div>
      <input type="hidden" name="optionId" value="${escapeHtml(id)}" /><input type="hidden" name="optionDisplayStyle" value="${escapeHtml(option?.displayStyle ?? "")}" /><input type="hidden" name="optionSortOrder" value="${option?.sortOrder ?? index}" />
      ${canWrite ? `<div class="dash-menu-order-controls"><button type="button" data-action="move-modifier-option" data-direction="up" aria-label="Move ${escapeHtml(option?.label || "option")} up" ${index === 0 ? "disabled" : ""}>Up</button><button type="button" data-action="move-modifier-option" data-direction="down" aria-label="Move ${escapeHtml(option?.label || "option")} down" ${index === optionCount - 1 ? "disabled" : ""}>Down</button><button class="dash-menu-remove-assignment" type="button" data-action="remove-modifier-option" aria-label="Remove ${escapeHtml(option?.label || "option")}" ${optionCount === 1 ? "disabled title=\"A modifier group needs at least one option.\"" : ""}>Remove</button></div>` : ""}
    </div>
  `;
}

export function renderModifierGroupForm(group: OperatorModifierGroup | null, options: { itemId?: string } = {}) {
  const canWrite = canCreateMenuItems(state.session?.operator ?? null, state.appConfig);
  const id = group?.id ?? "";
  const isEmbedded = Boolean(options.itemId);
  const initialOptions = group?.options ?? [null];
  return `
    <form class="dash-menu-modifier-form" data-form="modifier-group" data-modifier-group-id="${escapeHtml(id)}" ${options.itemId ? `data-item-id="${escapeHtml(options.itemId)}"` : ""}>
      <div class="dash-menu-editor-section"><h4>Group details</h4><div class="dash-menu-editor-grid dash-menu-editor-grid--modifier"><label class="field"><span>Name</span><input name="label" value="${escapeHtml(group?.label ?? "")}" ${canWrite ? "" : "disabled"} required /></label><label class="field"><span>Description</span><input name="description" value="${escapeHtml(group?.description ?? "")}" ${canWrite ? "" : "disabled"} /></label><label class="field"><span>Selection type</span><select name="selectionType" ${canWrite ? "" : "disabled"}><option value="single" ${group?.selectionType !== "multiple" ? "selected" : ""}>Single</option><option value="multiple" ${group?.selectionType === "multiple" ? "selected" : ""}>Multiple</option></select></label><label class="dash-menu-toggle"><input name="required" type="checkbox" ${checked(group?.required ?? false)} ${canWrite ? "" : "disabled"} /><span>Required</span></label><label class="field"><span>Minimum selections</span><input name="minSelections" type="number" min="0" step="1" value="${group?.minSelections ?? 0}" ${canWrite ? "" : "disabled"} /></label><label class="field"><span>Maximum selections</span><input name="maxSelections" type="number" min="1" step="1" value="${group?.maxSelections ?? 1}" ${group?.selectionType !== "multiple" || !canWrite ? "disabled" : ""} /></label><input type="hidden" name="sortOrder" value="${group?.sortOrder ?? state.menuModifierGroups.length}" /><input type="hidden" name="sourceGroupId" value="${escapeHtml(group?.sourceGroupId ?? "")}" /><input type="hidden" name="displayStyle" value="${escapeHtml(group?.displayStyle ?? "")}" /></div><p class="dash-menu-section-help">Single groups allow one choice. Multiple groups use the minimum and maximum you set.</p></div>
      <div class="dash-menu-editor-section"><div class="dash-menu-section-heading"><div><h4>Options</h4><p class="dash-menu-section-help">Price changes may be positive, zero, or negative.</p></div>${canWrite ? '<button class="button button--ghost" type="button" data-action="add-modifier-option">Add option</button>' : ""}</div><div class="dash-menu-option-list" data-modifier-options data-can-write="${canWrite}">${initialOptions.map((option, index) => renderModifierOptionEditorRow(group, option, index, canWrite, initialOptions.length)).join("")}</div></div>
      ${canWrite ? `<footer class="dash-menu-editor-footer">${group && !isEmbedded ? `<button class="button button--ghost dash-menu-delete-action" type="button" data-action="delete-modifier-group" data-modifier-group-id="${escapeHtml(group.id)}">Delete group</button>` : '<span></span>'}<span></span><button class="button button--ghost" type="button" data-action="${isEmbedded ? "close-item-modifier-group-create" : "close-menu-dialog"}">Cancel</button><button class="button button--secondary" type="submit">${group ? "Save group" : "Create group"}</button></footer>` : '<p class="dash-menu-readonly-note">This modifier group is read only for your account.</p>'}
    </form>
  `;
}

function renderUsedBy(group: OperatorModifierGroup) {
  const usedBy = getModifierGroupUsage(state.menuCategories).get(group.id) ?? [];
  if (!usedBy.length) return `<div class="dash-menu-used-by"><h4>Used by</h4><p class="dash-menu-section-help">Not assigned to any items.</p></div>`;
  return `<div class="dash-menu-used-by"><h4>Used by</h4><div class="dash-menu-used-by__items">${usedBy.map((item) => `<button type="button" data-action="open-menu-item" data-item-id="${escapeHtml(item.itemId)}">${escapeHtml(item.name)}</button>`).join("")}</div></div>`;
}

export function renderModifierGroupDialog() {
  const creating = state.menuDialogKind === "create-modifier-group";
  if (!creating && state.menuDialogKind !== "modifier-group") return "";
  const group = creating ? null : state.menuModifierGroups.find((candidate) => candidate.id === state.menuDialogEntityId) ?? null;
  if (!creating && !group) return "";
  const usage = group ? getModifierGroupUsage(state.menuCategories).get(group.id)?.length ?? 0 : 0;
  return `
    <div class="dash-modal dash-menu-modal dash-menu-modal--sheet${state.menuDialogOpening ? " dash-menu-modal--opening" : ""}${state.menuDialogClosing ? " dash-menu-modal--closing" : ""}" data-menu-dialog-root>
      <button class="dash-modal__backdrop" type="button" data-action="close-menu-dialog" aria-label="Close modifier group editor"></button>
      <section class="dash-menu-modal__panel dash-menu-modal__panel--wide" role="dialog" aria-modal="true" aria-labelledby="menu-modifier-editor-title" tabindex="-1">
        <header class="dash-menu-modal__header"><div><h3 id="menu-modifier-editor-title">${creating ? "Add modifier group" : escapeHtml(group!.label)}</h3><p>${creating ? "Create a reusable set of customer choices." : `${usage} item${usage === 1 ? "" : "s"} use this group`}</p></div><button class="dash-menu-modal__close" type="button" data-action="close-menu-dialog" aria-label="Close modifier group editor">Close</button></header>
        <div class="dash-menu-modal__body">${renderModifierGroupForm(group)}${group ? renderUsedBy(group) : ""}</div>
      </section>
    </div>
  `;
}
