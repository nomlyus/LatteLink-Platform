import {
  createOperatorMenuItem,
  deleteOperatorMenuItem,
  uploadOperatorMenuItemImage,
  updateOperatorMenuItem,
  updateOperatorMenuItemVisibility
} from "../api.js";
import {
  canCreateMenuItems,
  canToggleMenuItemVisibility
} from "../model.js";
import { addToast, setError, state } from "../state.js";
import { handleOperatorActionError, loadDashboard } from "../lifecycle.js";
import { render } from "../render.js";
import {
  ensureMenuCustomizationDraft,
  sanitizeCustomizationGroupsForSubmit
} from "../customizations.js";
import { resetMenuCreateWizard } from "../menu-wizard.js";

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
  const customizationGroups = sanitizeCustomizationGroupsForSubmit(ensureMenuCustomizationDraft(itemId));
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
      priceCents: formData.get("priceCents"),
      visible,
      ...(imageUrl === undefined ? {} : { imageUrl }),
      customizationGroups
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
    addToast("Menu item removed.", "success");
    await loadDashboard();
  } catch (error) {
    await handleOperatorActionError(error, "Unable to remove the menu item.");
  } finally {
    state.busyDeleteMenuItemId = null;
    render();
  }
}
