"use client";

import React, { useState, type FormEvent } from "react";
import type { OperatorDiscountCode } from "../../../model";
import { DashboardDialog } from "../../../components/dashboard/DashboardDialog";
import {
  toDiscountDateTimeInputValue,
  validateDiscountCodeForm,
  type CreateDiscountCodeInput,
  type UpdateDiscountCodeInput
} from "../discounts-domain";

type DiscountEditorDialogProps = {
  discountCode: OperatorDiscountCode | null;
  canWrite: boolean;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onCreate: (input: CreateDiscountCodeInput) => Promise<boolean>;
  onUpdate: (discountCodeId: string, input: UpdateDiscountCodeInput) => Promise<boolean>;
};

export function DiscountEditorDialog({
  discountCode,
  canWrite,
  pending,
  error,
  onClose,
  onCreate,
  onUpdate
}: DiscountEditorDialogProps) {
  const [discountType, setDiscountType] = useState<"percent" | "fixed_cents">(discountCode?.type ?? "percent");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite || pending) return;
    const formData = new FormData(event.currentTarget);
    if (discountCode) {
      const validation = validateDiscountCodeForm(formData, "update");
      if (!validation.valid) {
        setFieldErrors(validation.errors);
        return;
      }
      setFieldErrors({});
      if (await onUpdate(discountCode.discountCodeId, validation.input)) onClose();
      return;
    }

    const validation = validateDiscountCodeForm(formData, "create");
    if (!validation.valid) {
      setFieldErrors(validation.errors);
      return;
    }
    setFieldErrors({});
    const saved = await onCreate(validation.input);
    if (saved) onClose();
  }

  function clearFieldError(field: string) {
    setFieldErrors((current) => {
      if (!(field in current)) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  const title = discountCode ? (canWrite ? "Edit discount code" : "Discount code") : "Create discount code";

  return (
    <DashboardDialog
      title={title}
      subtitle={discountCode ? `${discountCode.code} · ${discountCode.name}` : "Codes are scoped to the selected location."}
      onClose={onClose}
      panelClassName="dash-discounts-editor-panel"
    >
      <form className="dash-discounts-editor" noValidate onSubmit={(event) => { void submit(event); }}>
        {!canWrite ? <p className="dash-discounts-readonly" role="status">You can review this code, but editing is disabled for your role.</p> : null}
        {error ? <p className="dash-discounts-form-error" role="alert">{error}</p> : null}
        <div className="dash-discounts-editor-grid">
          {discountCode ? (
            <div className="field">
              <span>Code</span>
              <strong className="dash-discounts-editor-code">{discountCode.code}</strong>
            </div>
          ) : (
            <label className="field" htmlFor="discount-code-value">
              <span>Code</span>
              <input
                id="discount-code-value"
                name="code"
                autoComplete="off"
                placeholder="LAUNCH10"
                required
                disabled={!canWrite || pending}
                aria-invalid={Boolean(fieldErrors.code)}
                onChange={() => clearFieldError("code")}
              />
              {fieldErrors.code ? <span className="dash-discounts-field-error">{fieldErrors.code}</span> : null}
            </label>
          )}
          <label className="field" htmlFor="discount-code-name">
            <span>Name</span>
            <input
              id="discount-code-name"
              name="name"
              defaultValue={discountCode?.name ?? ""}
              placeholder="Launch week offer"
              required
              maxLength={80}
              disabled={!canWrite || pending}
              aria-invalid={Boolean(fieldErrors.name)}
              onChange={() => clearFieldError("name")}
            />
            {fieldErrors.name ? <span className="dash-discounts-field-error">{fieldErrors.name}</span> : null}
          </label>
          <label className="field" htmlFor="discount-code-type">
            <span>Discount type</span>
            <select
              id="discount-code-type"
              name="type"
              value={discountType}
              disabled={!canWrite || pending}
              onChange={(event) => { setDiscountType(event.target.value === "fixed_cents" ? "fixed_cents" : "percent"); clearFieldError("maxDiscountCents"); }}
            >
              <option value="percent">Percent off</option>
              <option value="fixed_cents">Fixed amount off</option>
            </select>
          </label>
          <label className="field" htmlFor="discount-code-amount">
            <span>{discountType === "percent" ? "Value (%)" : "Value (cents)"}</span>
            <input
              id="discount-code-amount"
              name="value"
              type="number"
              min="1"
              max={discountType === "percent" ? 100 : undefined}
              step="1"
              defaultValue={discountCode?.value ?? ""}
              required
              disabled={!canWrite || pending}
              aria-invalid={Boolean(fieldErrors.value)}
              onChange={() => clearFieldError("value")}
            />
            {fieldErrors.value ? <span className="dash-discounts-field-error">{fieldErrors.value}</span> : null}
          </label>
          <label className="field" htmlFor="discount-code-max-discount">
            <span>Maximum discount (cents)</span>
            <input
              id="discount-code-max-discount"
              name="maxDiscountCents"
              type="number"
              min="1"
              step="1"
              defaultValue={discountCode?.maxDiscountCents ?? ""}
              placeholder="Percent codes only"
              disabled={!canWrite || pending || discountType === "fixed_cents"}
              aria-invalid={Boolean(fieldErrors.maxDiscountCents)}
              onChange={() => clearFieldError("maxDiscountCents")}
            />
            {fieldErrors.maxDiscountCents ? <span className="dash-discounts-field-error">{fieldErrors.maxDiscountCents}</span> : null}
          </label>
          <label className="field" htmlFor="discount-code-min-subtotal">
            <span>Minimum subtotal (cents)</span>
            <input
              id="discount-code-min-subtotal"
              name="minSubtotalCents"
              type="number"
              min="0"
              step="1"
              defaultValue={discountCode?.minSubtotalCents ?? 0}
              disabled={!canWrite || pending}
              aria-invalid={Boolean(fieldErrors.minSubtotalCents)}
              onChange={() => clearFieldError("minSubtotalCents")}
            />
            {fieldErrors.minSubtotalCents ? <span className="dash-discounts-field-error">{fieldErrors.minSubtotalCents}</span> : null}
          </label>
          <label className="field" htmlFor="discount-code-eligibility">
            <span>Customer eligibility</span>
            <select
              id="discount-code-eligibility"
              name="eligibility"
              defaultValue={discountCode?.eligibility ?? "everyone"}
              disabled={!canWrite || pending}
              aria-invalid={Boolean(fieldErrors.eligibility)}
              onChange={() => clearFieldError("eligibility")}
            >
              <option value="everyone">Everyone</option>
              <option value="first_order_only">First order only</option>
              <option value="existing_customers_only">Returning customers only</option>
            </select>
            {fieldErrors.eligibility ? <span className="dash-discounts-field-error">{fieldErrors.eligibility}</span> : null}
          </label>
          <label className="field" htmlFor="discount-code-max-redemptions">
            <span>Maximum total redemptions</span>
            <input
              id="discount-code-max-redemptions"
              name="maxTotalRedemptions"
              type="number"
              min="1"
              step="1"
              defaultValue={discountCode?.maxTotalRedemptions ?? ""}
              placeholder="Unlimited"
              disabled={!canWrite || pending}
              aria-invalid={Boolean(fieldErrors.maxTotalRedemptions)}
              onChange={() => clearFieldError("maxTotalRedemptions")}
            />
            {fieldErrors.maxTotalRedemptions ? <span className="dash-discounts-field-error">{fieldErrors.maxTotalRedemptions}</span> : null}
          </label>
          <label className="field" htmlFor="discount-code-starts-at">
            <span>Starts at</span>
            <input
              id="discount-code-starts-at"
              name="startsAt"
              type="datetime-local"
              defaultValue={toDiscountDateTimeInputValue(discountCode?.startsAt)}
              disabled={!canWrite || pending}
              aria-invalid={Boolean(fieldErrors.startsAt)}
              onChange={() => clearFieldError("startsAt")}
            />
            {fieldErrors.startsAt ? <span className="dash-discounts-field-error">{fieldErrors.startsAt}</span> : null}
          </label>
          <label className="field" htmlFor="discount-code-expires-at">
            <span>Expires at</span>
            <input
              id="discount-code-expires-at"
              name="expiresAt"
              type="datetime-local"
              defaultValue={toDiscountDateTimeInputValue(discountCode?.expiresAt)}
              disabled={!canWrite || pending}
              aria-invalid={Boolean(fieldErrors.expiresAt)}
              onChange={() => clearFieldError("expiresAt")}
            />
            {fieldErrors.expiresAt ? <span className="dash-discounts-field-error">{fieldErrors.expiresAt}</span> : null}
          </label>
        </div>
        <p className="dash-discounts-time-note">Schedule times use your browser’s local timezone and are saved as exact timestamps.</p>
        <div className="dash-discounts-editor-options">
          <label className="dash-checkbox-row">
            <input name="oncePerCustomer" type="checkbox" defaultChecked={discountCode?.oncePerCustomer ?? false} disabled={!canWrite || pending} />
            <span>Limit to once per customer</span>
          </label>
          <label className="dash-checkbox-row">
            <input name="active" type="checkbox" defaultChecked={discountCode?.active ?? true} disabled={!canWrite || pending} />
            <span>Active</span>
          </label>
        </div>
        {canWrite ? (
          <footer className="dash-discounts-editor-actions">
            <button className="button button--ghost" type="button" disabled={pending} onClick={onClose}>Cancel</button>
            <button className="button button--primary" type="submit" disabled={pending}>
              {pending ? "Saving…" : discountCode ? "Save changes" : "Create code"}
            </button>
          </footer>
        ) : null}
      </form>
    </DashboardDialog>
  );
}
