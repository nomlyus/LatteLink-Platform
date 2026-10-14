import React from "react";
import type { OperatorDiscountCode } from "../../../model";
import { formatDateTime, formatMoney } from "../../../ui/format";
import { getDiscountCodeStatus, getDiscountEligibilityLabel } from "../discounts-domain";
import { DiscountStatusBadge } from "./DiscountStatusBadge";

function formatDiscountValue(discountCode: OperatorDiscountCode) {
  return discountCode.type === "percent" ? `${discountCode.value}% off` : `${formatMoney(discountCode.value)} off`;
}

function formatUsage(discountCode: OperatorDiscountCode) {
  const usage = `${discountCode.redeemedCount} redeemed · ${discountCode.reservedCount} reserved`;
  return discountCode.maxTotalRedemptions === undefined
    ? usage
    : `${usage} · ${discountCode.maxTotalRedemptions} total limit`;
}

function formatWindow(discountCode: OperatorDiscountCode) {
  const parts = [`Created ${formatDateTime(discountCode.createdAt)}`];
  if (discountCode.startsAt) parts.push(`Starts ${formatDateTime(discountCode.startsAt)}`);
  if (discountCode.expiresAt) parts.push(`Expires ${formatDateTime(discountCode.expiresAt)}`);
  if (!discountCode.expiresAt) parts.push("No scheduled end");
  return parts.join(" · ");
}

export function DiscountsList({
  discountCodes,
  canWrite,
  pending,
  nowMs,
  onOpen
}: {
  discountCodes: readonly OperatorDiscountCode[];
  canWrite: boolean;
  pending: boolean;
  nowMs: number;
  onOpen: (discountCode: OperatorDiscountCode) => void;
}) {
  return (
    <table className="dash-order-table dash-management-table dash-discounts-table" aria-label="Discount codes">
      <thead><tr><th scope="col">Code</th><th scope="col">Name</th><th scope="col">Discount</th><th scope="col">Status</th><th scope="col">Usage</th><th scope="col"><span className="visually-hidden">Details</span></th></tr></thead>
      <tbody>
      {discountCodes.map((discountCode) => {
        const status = getDiscountCodeStatus(discountCode, nowMs);
        return (
          <tr className="dash-order-table__row" key={discountCode.discountCodeId} tabIndex={pending ? -1 : 0}
            aria-label={`${canWrite ? "Edit" : "View"} ${discountCode.code}`} aria-haspopup="dialog"
            onClick={() => { if (!pending) onOpen(discountCode); }}
            onKeyDown={(event) => { if (event.target === event.currentTarget && !pending && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onOpen(discountCode); } }}>
            <td><strong>{discountCode.code}</strong></td>
            <td title={`${discountCode.name} · ${getDiscountEligibilityLabel(discountCode.eligibility)} · ${discountCode.oncePerCustomer ? "Once per customer" : "Multiple uses per customer"} · Minimum ${formatMoney(discountCode.minSubtotalCents)}`}>{discountCode.name}</td>
            <td>{formatDiscountValue(discountCode)}</td>
            <td><DiscountStatusBadge status={status} /></td>
            <td title={`${formatUsage(discountCode)} · ${formatWindow(discountCode)}`}>{formatUsage(discountCode)}</td>
            <td className="dash-management-table__actions" onClick={(event) => event.stopPropagation()}>
            <button
              className="dash-order-table__details-button"
              type="button"
              disabled={pending}
              onClick={() => onOpen(discountCode)}
              aria-label={`${canWrite ? "Edit" : "View"} ${discountCode.code}`}
            >
              View
            </button>
            </td>
          </tr>
        );
      })}
      </tbody>
    </table>
  );
}
