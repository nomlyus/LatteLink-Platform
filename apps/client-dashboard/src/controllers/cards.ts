import { replaceOperatorNewsCards } from "../api.js";
import { canAccessCapability } from "../model.js";
import { addToast, setError, state } from "../state.js";
import { handleOperatorActionError } from "../lifecycle.js";
import { render } from "../render.js";

function createNewsCardId(title: string) {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug.length > 0 ? slug : "card"}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function handleNewsCardCreateSubmit(form: HTMLFormElement) {
  if (!state.session) {
    return;
  }
  if (!canAccessCapability(state.session.operator, "menu:write")) {
    setError("Home card creation is unavailable for your account.");
    render();
    return;
  }

  const formData = new FormData(form);
  const visibleField = form.elements.namedItem("visible");
  const title = String(formData.get("title") ?? "").trim();
  const sortOrderInput = Number(formData.get("sortOrder") ?? 0);
  const nextCard = {
    cardId: createNewsCardId(title || "card"),
    label: String(formData.get("label") ?? "").trim(),
    title,
    body: String(formData.get("body") ?? "").trim(),
    note: (() => {
      const next = String(formData.get("note") ?? "").trim();
      return next.length > 0 ? next : undefined;
    })(),
    sortOrder: Number.isFinite(sortOrderInput) ? Math.max(0, Math.trunc(sortOrderInput)) : 0,
    visible: visibleField instanceof HTMLInputElement ? visibleField.checked : true
  };

  try {
    state.creatingNewsCard = true;
    setError(null);
    render();
    const response = await replaceOperatorNewsCards(
      state.session,
      state.selectedLocationId === "all" ? null : state.selectedLocationId,
      [...state.newsCards, nextCard]
    );
    state.newsCards = response.cards;
    addToast("Created home card.", "success");
    form.reset();
  } catch (error) {
    await handleOperatorActionError(error, "Unable to create home card.");
  } finally {
    state.creatingNewsCard = false;
    render();
  }
}

export async function handleNewsCardSubmit(form: HTMLFormElement) {
  if (!state.session) {
    return;
  }
  if (!canAccessCapability(state.session.operator, "menu:write")) {
    setError("Home card editing is unavailable for your account.");
    render();
    return;
  }

  const cardId = form.dataset.cardId;
  if (!cardId) {
    return;
  }

  const formData = new FormData(form);
  const visibleField = form.elements.namedItem("visible");
  const visible = visibleField instanceof HTMLInputElement ? visibleField.checked : false;
  const sortOrder = Math.max(0, Math.trunc(Number(formData.get("sortOrder") ?? 0) || 0));
  const updatedCard = {
    cardId,
    label: String(formData.get("label") ?? "").trim(),
    title: String(formData.get("title") ?? "").trim(),
    body: String(formData.get("body") ?? "").trim(),
    note: (() => {
      const next = String(formData.get("note") ?? "").trim();
      return next.length > 0 ? next : undefined;
    })(),
    sortOrder,
    visible
  };

  try {
    state.busyNewsCardId = cardId;
    setError(null);
    render();
    const nextCards = state.newsCards
      .map((card) => (card.cardId === cardId ? updatedCard : card))
      .sort((left, right) => left.sortOrder - right.sortOrder || left.cardId.localeCompare(right.cardId));
    const response = await replaceOperatorNewsCards(
      state.session,
      state.selectedLocationId === "all" ? null : state.selectedLocationId,
      nextCards
    );
    state.newsCards = response.cards;
    addToast(`Saved ${cardId}.`, "success");
  } catch (error) {
    await handleOperatorActionError(error, "Unable to save home card.");
  } finally {
    state.busyNewsCardId = null;
    render();
  }
}

export async function handleNewsCardVisibilityToggle(cardId: string, visible: boolean) {
  if (!state.session) {
    return;
  }
  if (!canAccessCapability(state.session.operator, "menu:visibility")) {
    setError("Home card visibility controls are unavailable for your account.");
    render();
    return;
  }

  try {
    state.busyNewsCardVisibilityId = cardId;
    setError(null);
    render();
    const nextCards = state.newsCards
      .map((card) => (card.cardId === cardId ? { ...card, visible } : card))
      .sort((left, right) => left.sortOrder - right.sortOrder || left.cardId.localeCompare(right.cardId));
    const response = await replaceOperatorNewsCards(
      state.session,
      state.selectedLocationId === "all" ? null : state.selectedLocationId,
      nextCards
    );
    state.newsCards = response.cards;
    addToast(visible ? "Home card is visible in the app." : "Home card was hidden from the app.", "success");
  } catch (error) {
    await handleOperatorActionError(error, "Unable to change home card visibility.");
  } finally {
    state.busyNewsCardVisibilityId = null;
    render();
  }
}

export async function handleNewsCardDelete(cardId: string) {
  if (!state.session) {
    return;
  }
  if (!canAccessCapability(state.session.operator, "menu:write")) {
    setError("Home card removal is unavailable for your account.");
    render();
    return;
  }
  if (typeof window !== "undefined" && !window.confirm("Remove this homepage card?")) {
    return;
  }

  try {
    state.busyDeleteNewsCardId = cardId;
    setError(null);
    render();
    const nextCards = state.newsCards.filter((card) => card.cardId !== cardId);
    const response = await replaceOperatorNewsCards(
      state.session,
      state.selectedLocationId === "all" ? null : state.selectedLocationId,
      nextCards
    );
    state.newsCards = response.cards;
    addToast("Home card removed.", "success");
  } catch (error) {
    await handleOperatorActionError(error, "Unable to remove the home card.");
  } finally {
    state.busyDeleteNewsCardId = null;
    render();
  }
}
