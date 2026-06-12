import { createOperatorDiscountCode, updateOperatorDiscountCode } from "../api.js";
import { canAccessCapability } from "../model.js";
import { handleOperatorActionError, loadDashboard } from "../lifecycle.js";
import { render } from "../render.js";
import { setError, state } from "../state.js";
import { addToast } from "../toast-runtime.js";

type CreateDiscountInput = Parameters<typeof createOperatorDiscountCode>[2];
type UpdateDiscountInput = Parameters<typeof updateOperatorDiscountCode>[3];

function optionalPositiveInteger(value: FormDataEntryValue | null) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function optionalNonnegativeInteger(value: FormDataEntryValue | null) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function optionalDateTime(value: FormDataEntryValue | null) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    return undefined;
  }

  const timestamp = Date.parse(trimmed);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function parseDiscountType(value: FormDataEntryValue | null): "percent" | "fixed_cents" {
  return value === "fixed_cents" ? "fixed_cents" : "percent";
}

function parseEligibility(
  value: FormDataEntryValue | null
): "everyone" | "first_order_only" | "existing_customers_only" {
  return value === "first_order_only" || value === "existing_customers_only" ? value : "everyone";
}

function parseOptionalRuleValue<T>(
  value: T | undefined,
  mode: "create" | "update"
): T | null | undefined {
  return value === undefined && mode === "update" ? null : value;
}

function parseDiscountRuleFields(form: HTMLFormElement, mode: "create" | "update"): UpdateDiscountInput {
  const formData = new FormData(form);
  const type = parseDiscountType(formData.get("type"));
  const maxDiscountCents =
    type === "percent"
      ? parseOptionalRuleValue(optionalPositiveInteger(formData.get("maxDiscountCents")), mode)
      : mode === "update"
        ? null
        : undefined;
  const maxTotalRedemptions = parseOptionalRuleValue(optionalPositiveInteger(formData.get("maxTotalRedemptions")), mode);
  const startsAt = parseOptionalRuleValue(optionalDateTime(formData.get("startsAt")), mode);
  const expiresAt = parseOptionalRuleValue(optionalDateTime(formData.get("expiresAt")), mode);

  return {
    name: String(formData.get("name") ?? "").trim(),
    type,
    value: optionalPositiveInteger(formData.get("value")) ?? 0,
    ...(maxDiscountCents === undefined ? {} : { maxDiscountCents }),
    minSubtotalCents: optionalNonnegativeInteger(formData.get("minSubtotalCents")) ?? 0,
    eligibility: parseEligibility(formData.get("eligibility")),
    oncePerCustomer: formData.get("oncePerCustomer") === "on",
    ...(maxTotalRedemptions === undefined ? {} : { maxTotalRedemptions }),
    active: formData.get("active") === "on",
    ...(startsAt === undefined ? {} : { startsAt }),
    ...(expiresAt === undefined ? {} : { expiresAt })
  };
}

function parseDiscountCodeCreateForm(form: HTMLFormElement): CreateDiscountInput {
  const formData = new FormData(form);
  return {
    ...parseDiscountRuleFields(form, "create"),
    code: String(formData.get("code") ?? "").trim()
  } as CreateDiscountInput;
}

export async function handleDiscountCodeCreateSubmit(form: HTMLFormElement) {
  if (!state.session) {
    return;
  }
  if (!canAccessCapability(state.session.operator, "menu:write")) {
    setError("Discount code creation is unavailable for your account.");
    render();
    return;
  }

  try {
    state.creatingDiscountCode = true;
    setError(null);
    render();
    await createOperatorDiscountCode(
      state.session,
      state.selectedLocationId === "all" ? null : state.selectedLocationId,
      parseDiscountCodeCreateForm(form)
    );
    addToast("Created discount code.", "success");
    form.reset();
    await loadDashboard();
  } catch (error) {
    await handleOperatorActionError(error, "Unable to create discount code.");
  } finally {
    state.creatingDiscountCode = false;
    render();
  }
}

export async function handleDiscountCodeSubmit(form: HTMLFormElement) {
  if (!state.session) {
    return;
  }
  if (!canAccessCapability(state.session.operator, "menu:write")) {
    setError("Discount code editing is unavailable for your account.");
    render();
    return;
  }

  const discountCodeId = form.dataset.discountCodeId;
  if (!discountCodeId) {
    return;
  }

  try {
    state.busyDiscountCodeId = discountCodeId;
    setError(null);
    render();
    await updateOperatorDiscountCode(
      state.session,
      state.selectedLocationId === "all" ? null : state.selectedLocationId,
      discountCodeId,
      parseDiscountRuleFields(form, "update")
    );
    addToast("Saved discount code.", "success");
    await loadDashboard();
  } catch (error) {
    await handleOperatorActionError(error, "Unable to save discount code.");
  } finally {
    state.busyDiscountCodeId = null;
    render();
  }
}
