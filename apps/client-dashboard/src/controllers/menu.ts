import {
  ApiRequestError,
  createOperatorMenuItem,
  createOperatorMenuCategory,
  createOperatorModifierGroup,
  deleteOperatorMenuCategory,
  deleteOperatorMenuItem,
  deleteOperatorModifierGroup,
  uploadOperatorMenuItemImage,
  reorderOperatorMenuCategories,
  updateOperatorMenuCategory,
  updateOperatorModifierGroup,
  updateOperatorMenuItem,
  updateOperatorMenuItemVisibility
} from "../api";
import { adminModifierGroupCreateSchema } from "@lattelink/contracts-catalog";
import {
  canCreateMenuItems,
  canToggleMenuItemVisibility
} from "../model";
import { resetMenuItemDetails, resetMenuDialog, setError, state } from "../state";
import { addToast } from "../toast-runtime";
import { handleOperatorActionError, loadDashboard } from "../lifecycle";
import { render } from "../render";
import { resetMenuCreateWizard } from "../menu-wizard";
import { getUniqueMenuItems } from "../menu-page-model";
import type { OperatorMenuItem } from "../model";
import { renderModifierAssignmentRow } from "../views/menu-items";

function readPriceCents(value: FormDataEntryValue | null, label: string) {
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0) throw new Error(`${label} must be a valid non-negative amount.`);
  const cents = Math.round(price * 100);
  if (!Number.isSafeInteger(cents)) throw new Error(`${label} is too large.`);
  return cents;
}

type MenuItemUpdateOverrides = Partial<Omit<OperatorMenuItem, "imageUrl">> & { imageUrl?: string | null };

function menuItemUpdatePayload(item: OperatorMenuItem, overrides: MenuItemUpdateOverrides = {}) {
  const next = { ...item, ...overrides };
  return {
    name: next.name,
    description: next.description ?? "",
    priceCents: next.priceCents,
    visible: next.visible,
    available: next.available,
    featured: next.featured,
    badgeCodes: next.badgeCodes ?? [],
    categoryIds: next.categoryIds?.length ? next.categoryIds : [next.categoryId],
    modifierGroupAssignments: [...(next.modifierGroupAssignments ?? [])].sort((left, right) => left.sortOrder - right.sortOrder),
    sortOrder: next.sortOrder,
    ...(next.imageUrl === undefined ? {} : { imageUrl: next.imageUrl })
  };
}

function selectedCategoryIds(data: FormData, item: OperatorMenuItem) {
  const selected = new Set(data.getAll("categoryIds").map(String));
  const current = item.categoryIds?.length ? item.categoryIds : [item.categoryId];
  const ordered = current.filter((id) => selected.has(id));
  for (const category of state.menuCategories) if (selected.has(category.categoryId) && !ordered.includes(category.categoryId)) ordered.push(category.categoryId);
  const primaryCategoryId = String(data.get("primaryCategoryId") ?? "");
  if (selected.has(primaryCategoryId)) return [primaryCategoryId, ...ordered.filter((id) => id !== primaryCategoryId)];
  return ordered;
}

function errorCode(error: unknown) {
  if (!(error instanceof ApiRequestError) || typeof error.payload !== "object" || error.payload === null) return undefined;
  const code = (error.payload as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function menuLocationId() {
  return state.selectedLocationId === "all" ? null : state.selectedLocationId;
}

export async function handleMenuCreateSubmit(form: HTMLFormElement) {
  void form;
  if (!state.session) {
    return;
  }
  if (!canCreateMenuItems(state.session.operator, state.appConfig)) {
    setError("Menu item creation is unavailable until platform-managed menu editing is enabled for your account.");
    render();
    return;
  }

  try {
    state.creatingMenuItem = true;
    setError(null);
    render();
    await createOperatorMenuItem(state.session, menuLocationId(), {
      categoryId: state.menuCreateDraft.categoryId,
      name: state.menuCreateDraft.name,
      description: state.menuCreateDraft.description,
      priceCents: state.menuCreateDraft.priceCents,
      visible: state.menuCreateDraft.visible
    });
    addToast("Created menu item.", "success");
    resetMenuCreateWizard();
    await loadDashboard();
  } catch (error) {
    await handleOperatorActionError(error, "Unable to create menu item.");
  } finally {
    state.creatingMenuItem = false;
    render();
  }
}

export async function handleMenuQuickCreateSubmit(form: HTMLFormElement) {
  if (!state.session || !canCreateMenuItems(state.session.operator, state.appConfig)) return;
  const data = new FormData(form);
  try {
    state.creatingMenuItem = true;
    setError(null);
    render();
    const item = await createOperatorMenuItem(state.session, menuLocationId(), {
      categoryId: String(data.get("categoryId") ?? ""),
      name: String(data.get("name") ?? "").trim(),
      priceCents: readPriceCents(data.get("price"), "Base price"),
      visible: (form.elements.namedItem("visible") as HTMLInputElement | null)?.checked ?? true,
      available: (form.elements.namedItem("available") as HTMLInputElement | null)?.checked ?? true
    });
    addToast("Item created. Add the details and choices next.", "success");
    await loadDashboard();
    state.menuDialogKind = "item";
    state.menuDialogEntityId = item.itemId;
    state.selectedMenuItemId = item.itemId;
    state.menuItemDetailsOpen = true;
    render();
  } catch (error) {
    await handleOperatorActionError(error, "Unable to create menu item.");
  } finally {
    state.creatingMenuItem = false;
    render();
  }
}

export async function handleMenuItemSubmit(form: HTMLFormElement) {
  if (!state.session) {
    return;
  }
  if (!canCreateMenuItems(state.session.operator, state.appConfig)) {
    setError("Menu editing is unavailable until platform-managed menu editing is enabled for your account.");
    render();
    return;
  }
  const itemId = form.dataset.itemId;
  if (!itemId) {
    return;
  }

  const formData = new FormData(form);
  const visibleField = form.elements.namedItem("visible");
  const removeImageField = form.elements.namedItem("removeImage");
  const visible = visibleField instanceof HTMLInputElement ? visibleField.checked : false;
  const removeImage = removeImageField instanceof HTMLInputElement ? removeImageField.checked : false;
  const currentItem = state.menuCategories.flatMap((category) => category.items).find((item) => item.itemId === itemId);
  const imageFile = formData.get("imageFile");

  try {
    state.busyMenuItemId = itemId;
    setError(null);
    render();
    const imageUrl =
      imageFile instanceof File && imageFile.size > 0
        ? await uploadOperatorMenuItemImage(
            state.session,
            menuLocationId(),
            itemId,
            imageFile
          )
        : removeImage && currentItem?.imageUrl
          ? null
          : undefined;
    if (!currentItem) throw new Error("This item is no longer in the current menu.");
    const categoryIds = selectedCategoryIds(formData, currentItem);
    if (categoryIds.length === 0) throw new Error("Choose at least one category for this item.");
    const modifierGroupAssignments = formData.getAll("modifierGroupId").map((modifierGroupId, sortOrder) => ({
      modifierGroupId: String(modifierGroupId),
      sortOrder
    }));
    const badgeCodes = String(formData.get("badgeCodes") ?? "").split(",").map((badge) => badge.trim()).filter(Boolean);
    const input = menuItemUpdatePayload(currentItem, {
      name: String(formData.get("name") ?? "").trim(),
      description: String(formData.get("description") ?? "").trim(),
      priceCents: readPriceCents(formData.get("price"), "Base price"),
      visible,
      available: (form.elements.namedItem("available") as HTMLInputElement | null)?.checked ?? currentItem.available,
      featured: (form.elements.namedItem("featured") as HTMLInputElement | null)?.checked ?? currentItem.featured,
      badgeCodes,
      categoryId: categoryIds[0]!,
      categoryIds,
      modifierGroupAssignments,
      imageUrl: imageUrl === undefined ? currentItem.imageUrl : imageUrl
    });
    await updateOperatorMenuItem(state.session, menuLocationId(), itemId, input);
    addToast(`Saved ${String(formData.get("name") ?? currentItem.name)}.`, "success");
    await loadDashboard();
  } catch (error) {
    await handleOperatorActionError(error, "Unable to save menu item.");
  } finally {
    state.busyMenuItemId = null;
    render();
  }
}

export async function handleMenuCategoryCreateSubmit(form: HTMLFormElement) {
  if (!state.session || !canCreateMenuItems(state.session.operator, state.appConfig)) return;
  const data = new FormData(form);
  try {
    await createOperatorMenuCategory(state.session, menuLocationId(), {
      title: String(data.get("title") ?? ""),
      description: String(data.get("description") ?? ""),
      sortOrder: Number(data.get("sortOrder") ?? 0),
      visible: (form.elements.namedItem("visible") as HTMLInputElement | null)?.checked ?? true
    });
    addToast("Category created.", "success");
    resetMenuDialog();
    await loadDashboard();
  } catch (error) {
    await handleOperatorActionError(error, "Unable to create category.");
  }
}

export async function handleMenuCategorySubmit(form: HTMLFormElement) {
  if (!state.session || !canCreateMenuItems(state.session.operator, state.appConfig)) return;
  const categoryId = form.dataset.categoryId;
  if (!categoryId) return;
  const data = new FormData(form);
  const category = state.menuCategories.find((candidate) => candidate.categoryId === categoryId);
  if (!category) return;
  const selectedItemIds = new Set(data.getAll("categoryMemberItemIds").map(String));
  const items = getUniqueMenuItems(state.menuCategories);
  for (const item of items) {
    const categoryIds = item.categoryIds?.length ? item.categoryIds : [item.categoryId];
    if (categoryIds.length === 1 && categoryIds[0] === categoryId && !selectedItemIds.has(item.itemId)) {
      setError(`${item.name} must stay in at least one category. Add another category before removing this membership.`);
      render();
      return;
    }
  }
  try {
    for (const item of items) {
      const currentIds = item.categoryIds?.length ? item.categoryIds : [item.categoryId];
      const shouldBelong = selectedItemIds.has(item.itemId) || (currentIds.length === 1 && currentIds[0] === categoryId);
      const currentlyBelongs = currentIds.includes(categoryId);
      if (shouldBelong === currentlyBelongs) continue;
      const nextIds = shouldBelong ? [...currentIds, categoryId] : currentIds.filter((id) => id !== categoryId);
      const primaryCategoryId = nextIds.includes(item.categoryId) ? item.categoryId : nextIds[0]!;
      await updateOperatorMenuItem(state.session, menuLocationId(), item.itemId, menuItemUpdatePayload(item, {
        categoryId: primaryCategoryId,
        categoryIds: [primaryCategoryId, ...nextIds.filter((id) => id !== primaryCategoryId)]
      }));
    }
    await updateOperatorMenuCategory(state.session, menuLocationId(), categoryId, {
      categoryId,
      title: String(data.get("title") ?? ""),
      description: String(data.get("description") ?? ""),
      sortOrder: Number(data.get("sortOrder") ?? 0),
      visible: (form.elements.namedItem("visible") as HTMLInputElement | null)?.checked ?? true
    });
    addToast("Category saved.", "success");
    await loadDashboard();
  } catch (error) {
    await handleOperatorActionError(error, "Unable to save category.");
    await loadDashboard({ silent: true });
    render();
  }
}

export async function handleMenuCategoryDelete(categoryId: string) {
  if (!state.session || !canCreateMenuItems(state.session.operator, state.appConfig)) return;
  const category = state.menuCategories.find((candidate) => candidate.categoryId === categoryId);
  if (!category) return;
  const orphaned = category.items.filter((item) => (item.categoryIds?.length ?? 1) <= 1);
  if (orphaned.length > 0) {
    setError(`Move ${orphaned.length} item${orphaned.length === 1 ? "" : "s"} to another category first. Deleting this category never deletes the underlying items.`);
    render();
    return;
  }
  if (typeof window !== "undefined" && !window.confirm(`Delete “${category.title}”? The category and its memberships will be removed. Its ${category.items.length} item${category.items.length === 1 ? "" : "s"} will remain in their other categories.`)) return;
  try {
    await deleteOperatorMenuCategory(state.session, menuLocationId(), categoryId);
    resetMenuDialog();
    addToast("Category deleted.", "success");
    await loadDashboard();
  } catch (error) {
    await handleOperatorActionError(error, "Unable to delete category.");
  }
}

export async function handleMenuCategoryReorder(categoryId: string, direction: "up" | "down") {
  if (!state.session || !canCreateMenuItems(state.session.operator, state.appConfig)) return;
  const ids = state.menuCategories.map((category) => category.categoryId);
  const index = ids.indexOf(categoryId);
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || nextIndex < 0 || nextIndex >= ids.length) return;
  [ids[index], ids[nextIndex]] = [ids[nextIndex]!, ids[index]!];
  try {
    await reorderOperatorMenuCategories(state.session, menuLocationId(), ids);
    await loadDashboard();
  } catch (error) {
    await handleOperatorActionError(error, "Unable to reorder categories.");
  }
}

export async function handleMenuCategoryItemReorder(categoryId: string, itemId: string, direction: "up" | "down") {
  if (!state.session || !canCreateMenuItems(state.session.operator, state.appConfig)) return;
  const category = state.menuCategories.find((candidate) => candidate.categoryId === categoryId);
  const ordered = category?.items.filter((item) => item.categoryId === categoryId) ?? [];
  const index = ordered.findIndex((item) => item.itemId === itemId);
  const neighborIndex = direction === "up" ? index - 1 : index + 1;
  const current = ordered[index];
  const neighbor = ordered[neighborIndex];
  if (!current || !neighbor || current.categoryId !== categoryId || neighbor.categoryId !== categoryId) return;
  try {
    await updateOperatorMenuItem(state.session, menuLocationId(), current.itemId, menuItemUpdatePayload(current, { sortOrder: neighbor.sortOrder }));
    await updateOperatorMenuItem(state.session, menuLocationId(), neighbor.itemId, menuItemUpdatePayload(neighbor, { sortOrder: current.sortOrder }));
    await loadDashboard();
  } catch (error) {
    await handleOperatorActionError(error, "Unable to reorder items in this category.");
    await loadDashboard({ silent: true });
    render();
  }
}

function readModifierGroupForm(form: HTMLFormElement, id?: string) {
  const data = new FormData(form);
  const selectionType = String(data.get("selectionType") ?? "single") as "single" | "multiple";
  const rows = [...form.querySelectorAll<HTMLElement>("[data-modifier-option-row]")];
  const options = rows.map((row, index) => {
    const value = (name: string) => row.querySelector<HTMLInputElement>(`[name="${name}"]`);
    const label = value("optionLabel")?.value.trim() ?? "";
    const price = Number(value("optionPriceDelta")?.value ?? 0);
    if (!label) throw new Error("Every modifier option needs a name.");
    if (!Number.isFinite(price)) throw new Error("Modifier price changes must be valid amounts.");
    const displayStyle = value("optionDisplayStyle")?.value;
    const optionId = value("optionId")?.value;
    return {
      id: optionId || globalThis.crypto.randomUUID(),
      label,
      description: value("optionDescription")?.value.trim() ?? "",
      priceDeltaCents: Math.round(price * 100),
      default: row.querySelector<HTMLInputElement>('[name="optionDefault"]')?.checked ?? false,
      available: row.querySelector<HTMLInputElement>('[name="optionAvailable"]')?.checked ?? true,
      sortOrder: index,
      ...(displayStyle ? { displayStyle } : {})
    };
  });
  const displayStyle = data.get("displayStyle");
  const sourceGroupId = data.get("sourceGroupId");
  const maxSelections = selectionType === "single" ? 1 : Number(data.get("maxSelections") ?? 1);
  const minSelections = Number(data.get("minSelections") ?? 0);
  if (minSelections > maxSelections) throw new Error("Minimum selections cannot exceed maximum selections.");
  return adminModifierGroupCreateSchema.parse({
    ...(id ? { id } : {}),
    ...(typeof sourceGroupId === "string" && sourceGroupId ? { sourceGroupId } : {}),
    label: String(data.get("label") ?? "").trim(),
    description: String(data.get("description") ?? "").trim(),
    selectionType,
    required: (form.elements.namedItem("required") as HTMLInputElement | null)?.checked ?? false,
    minSelections,
    maxSelections,
    sortOrder: Number(data.get("sortOrder") ?? 0),
    ...(typeof displayStyle === "string" && displayStyle ? { displayStyle } : {}),
    options
  });
}

export async function handleModifierGroupSubmit(form: HTMLFormElement) {
  if (!state.session || !canCreateMenuItems(state.session.operator, state.appConfig)) return;
  const id = form.dataset.modifierGroupId || undefined;
  const itemId = form.dataset.itemId;
  try {
    const input = readModifierGroupForm(form, id);
    if (id) {
      await updateOperatorModifierGroup(state.session, menuLocationId(), id, { ...input, id });
    } else {
      const created = await createOperatorModifierGroup(state.session, menuLocationId(), input);
      if (itemId) {
        state.menuModifierGroups = [...state.menuModifierGroups, created];
        const assignmentList = [...document.querySelectorAll<HTMLElement>("[data-assignment-list]")].find((element) => element.dataset.assignmentList === itemId);
        const assignmentCount = assignmentList?.querySelectorAll("[data-assignment-group-id]").length ?? 0;
        assignmentList?.insertAdjacentHTML("beforeend", renderModifierAssignmentRow(itemId, created.id, assignmentCount, assignmentCount + 1, true));
        const nestedDialog = form.closest<HTMLElement>("[data-menu-group-create-dialog]");
        if (nestedDialog) nestedDialog.hidden = true;
        state.menuCreateModifierGroupForItemId = null;
        addToast("Group created. Save the item to keep the assignment.", "success");
        return;
      }
    }
    addToast(id ? "Modifier group saved." : "Modifier group created.", "success");
    resetMenuDialog();
    await loadDashboard();
  } catch (error) {
    await handleOperatorActionError(error, "Unable to save modifier group.");
    render();
  }
}

export async function handleModifierGroupDelete(modifierGroupId: string) {
  if (!state.session || !canCreateMenuItems(state.session.operator, state.appConfig)) return;
  if (typeof window !== "undefined" && !window.confirm("Delete this modifier group? Groups in use cannot be deleted; remove their assignments first.")) return;
  try {
    await deleteOperatorModifierGroup(state.session, menuLocationId(), modifierGroupId);
    resetMenuDialog();
    addToast("Modifier group deleted.", "success");
    await loadDashboard();
  } catch (error) {
    if (errorCode(error) === "MODIFIER_GROUP_IN_USE") {
      setError("This modifier group is assigned to one or more items. Remove those assignments before deleting the group.");
      render();
      return;
    }
    await handleOperatorActionError(error, "Unable to delete modifier group.");
  }
}

export async function handleMenuVisibilityToggle(itemId: string, visible: boolean) {
  if (!state.session) {
    return;
  }
  if (!canToggleMenuItemVisibility(state.session.operator, state.appConfig)) {
    setError("Menu visibility controls are unavailable until platform-managed menu visibility is enabled for your account.");
    render();
    return;
  }

  try {
    state.busyMenuVisibilityItemId = itemId;
    setError(null);
    render();
    await updateOperatorMenuItemVisibility(
      state.session,
      menuLocationId(),
      itemId,
      visible
    );
    addToast(visible ? "Item is visible in the app." : "Item was hidden from the app.", "success");
    await loadDashboard();
  } catch (error) {
    await handleOperatorActionError(error, "Unable to change item visibility.");
  } finally {
    state.busyMenuVisibilityItemId = null;
    render();
  }
}

export async function handleMenuAvailabilityToggle(itemId: string, available: boolean) {
  if (!state.session || !canCreateMenuItems(state.session.operator, state.appConfig)) return;
  const item = getUniqueMenuItems(state.menuCategories).find((candidate) => candidate.itemId === itemId);
  if (!item || item.available === available) return;
  try {
    state.busyMenuItemId = itemId;
    setError(null);
    render();
    await updateOperatorMenuItem(state.session, menuLocationId(), itemId, menuItemUpdatePayload(item, { available }));
    addToast(available ? `${item.name} is available to order.` : `${item.name} is marked sold out.`, "success");
    await loadDashboard();
  } catch (error) {
    await handleOperatorActionError(error, "Unable to change item availability.");
  } finally {
    state.busyMenuItemId = null;
    render();
  }
}

export async function handleMenuItemDelete(itemId: string) {
  if (!state.session) {
    return;
  }
  if (!canCreateMenuItems(state.session.operator, state.appConfig)) {
    setError("Menu item removal is unavailable until platform-managed menu editing is enabled for your account.");
    render();
    return;
  }
  const item = getUniqueMenuItems(state.menuCategories).find((candidate) => candidate.itemId === itemId);
  if (!item) return;
  if (typeof window !== "undefined" && !window.confirm(`Delete “${item.name}” from this menu? This removes the item and its category memberships.`)) {
    return;
  }

  try {
    state.busyDeleteMenuItemId = itemId;
    setError(null);
    render();
    await deleteOperatorMenuItem(state.session, menuLocationId(), itemId);
    resetMenuItemDetails();
    addToast("Menu item removed.", "success");
    await loadDashboard();
  } catch (error) {
    await handleOperatorActionError(error, "Unable to remove the menu item.");
  } finally {
    state.busyDeleteMenuItemId = null;
    render();
  }
}
