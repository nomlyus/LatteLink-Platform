import {
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
import {
  canCreateMenuItems,
  canToggleMenuItemVisibility
} from "../model";
import { resetMenuItemDetails, setError, state } from "../state";
import { addToast } from "../toast-runtime";
import { handleOperatorActionError, loadDashboard } from "../lifecycle";
import { render } from "../render";
import { resetMenuCreateWizard } from "../menu-wizard";

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
    await createOperatorMenuItem(state.session, state.selectedLocationId === "all" ? null : state.selectedLocationId, {
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
            state.selectedLocationId === "all" ? null : state.selectedLocationId,
            itemId,
            imageFile
          )
        : removeImage && currentItem?.imageUrl
          ? null
          : undefined;
    await updateOperatorMenuItem(state.session, state.selectedLocationId === "all" ? null : state.selectedLocationId, itemId, {
      name: formData.get("name"),
      description: formData.get("description"),
      priceCents: formData.get("priceCents"),
      visible,
      available: (form.elements.namedItem("available") as HTMLInputElement | null)?.checked ?? currentItem?.available ?? true,
      featured: (form.elements.namedItem("featured") as HTMLInputElement | null)?.checked ?? currentItem?.featured ?? false,
      badgeCodes: formData.get("badgeCodes"),
      sortOrder: formData.get("sortOrder"),
      categoryIds: formData.getAll("categoryIds").map(String),
      modifierGroupAssignments: formData.getAll("modifierGroupIds").map((modifierGroupId, sortOrder) => ({
        modifierGroupId: String(modifierGroupId),
        sortOrder
      })),
      ...(imageUrl === undefined ? {} : { imageUrl }),
    });
    addToast(`Saved ${itemId}.`, "success");
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
    await createOperatorMenuCategory(state.session, state.selectedLocationId, {
      title: String(data.get("title") ?? ""),
      description: String(data.get("description") ?? ""),
      sortOrder: Number(data.get("sortOrder") ?? 0),
      visible: (form.elements.namedItem("visible") as HTMLInputElement | null)?.checked ?? true
    });
    addToast("Category created.", "success");
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
  try {
    await updateOperatorMenuCategory(state.session, state.selectedLocationId, categoryId, {
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
  }
}

export async function handleMenuCategoryDelete(categoryId: string) {
  if (!state.session || !canCreateMenuItems(state.session.operator, state.appConfig)) return;
  if (typeof window !== "undefined" && !window.confirm("Delete this category? Items will remain and must already belong to another category.")) return;
  try {
    await deleteOperatorMenuCategory(state.session, state.selectedLocationId, categoryId);
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
    await reorderOperatorMenuCategories(state.session, state.selectedLocationId, ids);
    await loadDashboard();
  } catch (error) {
    await handleOperatorActionError(error, "Unable to reorder categories.");
  }
}

function readModifierGroupForm(form: HTMLFormElement, id?: string) {
  const data = new FormData(form);
  const labels = data.getAll("optionLabel").map(String);
  const descriptions = data.getAll("optionDescription").map(String);
  const priceDeltas = data.getAll("optionPriceDeltaCents").map((value) => Number(value));
  const sortOrders = data.getAll("optionSortOrder").map((value) => Number(value));
  const optionIds = data.getAll("optionId").map(String);
  const optionRows = labels
    .map((label, index) => ({ label: label.trim(), index }))
    .filter(({ label, index }) => label.length > 0 && data.get(`optionRemove_${index}`) === null);
  return {
    ...(id ? { id } : {}),
    label: String(data.get("label") ?? ""),
    description: String(data.get("description") ?? ""),
    selectionType: String(data.get("selectionType") ?? "single") as "single" | "multiple",
    required: (form.elements.namedItem("required") as HTMLInputElement | null)?.checked ?? false,
    minSelections: Number(data.get("minSelections") ?? 0),
    maxSelections: Number(data.get("maxSelections") ?? 1),
    sortOrder: Number(data.get("sortOrder") ?? 0),
    options: optionRows.map(({ label, index }) => ({
      id: optionIds[index] || globalThis.crypto.randomUUID(),
      label,
      description: descriptions[index]?.trim() ?? "",
      priceDeltaCents: priceDeltas[index] ?? 0,
      default: data.get(`optionDefault_${index}`) !== null,
      available: data.get(`optionAvailable_${index}`) !== null,
      sortOrder: sortOrders[index] ?? index
    }))
  };
}

export async function handleModifierGroupSubmit(form: HTMLFormElement) {
  if (!state.session || !canCreateMenuItems(state.session.operator, state.appConfig)) return;
  const id = form.dataset.modifierGroupId || undefined;
  try {
    const input = readModifierGroupForm(form, id);
    if (id) await updateOperatorModifierGroup(state.session, state.selectedLocationId, id, { ...input, id });
    else await createOperatorModifierGroup(state.session, state.selectedLocationId, input);
    addToast(id ? "Modifier group saved." : "Modifier group created.", "success");
    await loadDashboard();
  } catch (error) {
    await handleOperatorActionError(error, "Unable to save modifier group.");
  }
}

export async function handleModifierGroupDelete(modifierGroupId: string) {
  if (!state.session || !canCreateMenuItems(state.session.operator, state.appConfig)) return;
  if (typeof window !== "undefined" && !window.confirm("Delete this modifier group? Remove it from every item first.")) return;
  try {
    await deleteOperatorModifierGroup(state.session, state.selectedLocationId, modifierGroupId);
    addToast("Modifier group deleted.", "success");
    await loadDashboard();
  } catch (error) {
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
      state.selectedLocationId === "all" ? null : state.selectedLocationId,
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

export async function handleMenuItemDelete(itemId: string) {
  if (!state.session) {
    return;
  }
  if (!canCreateMenuItems(state.session.operator, state.appConfig)) {
    setError("Menu item removal is unavailable until platform-managed menu editing is enabled for your account.");
    render();
    return;
  }
  if (typeof window !== "undefined" && !window.confirm("Remove this menu item from the client-managed menu?")) {
    return;
  }

  try {
    state.busyDeleteMenuItemId = itemId;
    setError(null);
    render();
    await deleteOperatorMenuItem(state.session, state.selectedLocationId === "all" ? null : state.selectedLocationId, itemId);
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
