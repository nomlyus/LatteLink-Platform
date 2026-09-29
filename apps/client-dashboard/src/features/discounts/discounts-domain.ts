import {
  createDiscountCodeRequestSchema,
  updateDiscountCodeRequestSchema
} from "@lattelink/contracts-orders";
import { z } from "zod";
import type { OperatorDiscountCode } from "../../model";

const createDiscountFormSchema = createDiscountCodeRequestSchema.transform(({ locationId, ...input }) => {
  void locationId;
  return input;
});
const updateDiscountFormSchema = updateDiscountCodeRequestSchema.transform(({ locationId, ...input }) => {
  void locationId;
  return input;
});

export type CreateDiscountCodeInput = Omit<z.input<typeof createDiscountCodeRequestSchema>, "locationId">;
export type UpdateDiscountCodeInput = Omit<z.input<typeof updateDiscountCodeRequestSchema>, "locationId">;
export type DiscountCodeStatus = "active" | "inactive" | "upcoming" | "expired" | "exhausted";
export type DiscountCodeStatusFilter = "all" | DiscountCodeStatus;
export type DiscountCodeFormValidation<TInput> =
  | { valid: true; input: TInput }
  | { valid: false; errors: Record<string, string> };

export function getDiscountCodeStatus(code: OperatorDiscountCode, nowMs = Date.now()): DiscountCodeStatus {
  if (!code.active) return "inactive";
  if (code.startsAt && Date.parse(code.startsAt) > nowMs) return "upcoming";
  if (code.expiresAt && Date.parse(code.expiresAt) <= nowMs) return "expired";
  if (code.maxTotalRedemptions !== undefined && code.redeemedCount + code.reservedCount >= code.maxTotalRedemptions) {
    return "exhausted";
  }
  return "active";
}

export function filterDiscountCodes(
  discountCodes: readonly OperatorDiscountCode[],
  search: string,
  status: DiscountCodeStatusFilter,
  nowMs = Date.now()
) {
  const query = search.trim().toLocaleLowerCase();
  return discountCodes.filter((code) => {
    const matchesSearch = !query || code.code.toLocaleLowerCase().includes(query) || code.name.toLocaleLowerCase().includes(query);
    return matchesSearch && (status === "all" || getDiscountCodeStatus(code, nowMs) === status);
  });
}

export function toDiscountDateTimeInputValue(value: string | undefined) {
  if (!value) return "";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  const local = new Date(timestamp - new Date(timestamp).getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIsoInstant(value: string) {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function readOptionalInteger(formData: FormData, field: string) {
  const rawValue = formData.get(field);
  if (typeof rawValue !== "string" || rawValue.trim() === "") return undefined;
  return Number(rawValue);
}

function readDate(formData: FormData, field: string) {
  const rawValue = formData.get(field);
  return typeof rawValue === "string" ? toIsoInstant(rawValue.trim()) : undefined;
}

function getValidationErrors(issues: readonly z.ZodIssue[]) {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field === "string" && errors[field] === undefined) errors[field] = issue.message;
  }
  return errors;
}

function getCommonDiscountFormCandidate(formData: FormData, mode: "create" | "update") {
  const type = formData.get("type") === "fixed_cents" ? "fixed_cents" : "percent";
  const maxDiscountCents = type === "fixed_cents"
    ? undefined
    : readOptionalInteger(formData, "maxDiscountCents");
  const maxTotalRedemptions = readOptionalInteger(formData, "maxTotalRedemptions");
  const startsAt = readDate(formData, "startsAt");
  const expiresAt = readDate(formData, "expiresAt");

  return {
    name: String(formData.get("name") ?? "").trim(),
    type,
    value: readOptionalInteger(formData, "value"),
    maxDiscountCents: maxDiscountCents ?? (mode === "update" ? null : undefined),
    minSubtotalCents: readOptionalInteger(formData, "minSubtotalCents") ?? 0,
    eligibility: formData.get("eligibility"),
    oncePerCustomer: formData.get("oncePerCustomer") === "on",
    maxTotalRedemptions: maxTotalRedemptions ?? (mode === "update" ? null : undefined),
    active: formData.get("active") === "on",
    startsAt: startsAt ?? (mode === "update" ? null : undefined),
    expiresAt: expiresAt ?? (mode === "update" ? null : undefined)
  };
}

export function validateDiscountCodeForm(
  formData: FormData,
  mode: "create"
): DiscountCodeFormValidation<z.output<typeof createDiscountFormSchema>>;
export function validateDiscountCodeForm(
  formData: FormData,
  mode: "update"
): DiscountCodeFormValidation<z.output<typeof updateDiscountFormSchema>>;
export function validateDiscountCodeForm(
  formData: FormData,
  mode: "create" | "update"
): DiscountCodeFormValidation<z.output<typeof createDiscountFormSchema> | z.output<typeof updateDiscountFormSchema>>;
export function validateDiscountCodeForm(
  formData: FormData,
  mode: "create" | "update"
): DiscountCodeFormValidation<z.output<typeof createDiscountFormSchema> | z.output<typeof updateDiscountFormSchema>> {
  const common = getCommonDiscountFormCandidate(formData, mode);
  const candidate = mode === "create"
    ? { ...common, code: String(formData.get("code") ?? "").trim() }
    : common;
  const locationId = "discount-form-validation";
  const result = mode === "create"
    ? createDiscountFormSchema.safeParse({ locationId, ...candidate })
    : updateDiscountFormSchema.safeParse({ locationId, ...candidate });

  return result.success
    ? { valid: true, input: result.data }
    : { valid: false, errors: getValidationErrors(result.error.issues) };
}

export function getDiscountEligibilityLabel(eligibility: OperatorDiscountCode["eligibility"]) {
  switch (eligibility) {
    case "first_order_only": return "First order only";
    case "existing_customers_only": return "Returning customers only";
    case "everyone": return "Everyone";
  }
}
