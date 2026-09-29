import React from "react";
import type { OperatorDiscountCode } from "../../../model";
import { formatDateTime, formatMoney } from "../../../ui/format";
import { getDiscountCodeStatus, getDiscountEligibilityLabel, type DiscountCodeStatus } from "../discounts-domain";
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
    <div className="dash-discounts-list" role="list" aria-label="Discount codes">
      {discountCodes.map((discountCode) => {
        const status: DiscountCodeStatus = getDiscountCodeStatus(discountCode, nowMs);
        return (
          <article className="dash-discounts-row" role="listitem" key={discountCode.discountCodeId}>
            <div className="dash-discounts-row__identity">
              <div className="dash-discounts-row__title-line">
                <strong>{discountCode.code}</strong>
                <span>{formatDiscountValue(discountCode)}</span>
              </div>
              <p>{discountCode.name}</p>
              <div className="dash-discounts-row__details">
                <span>{getDiscountEligibilityLabel(discountCode.eligibility)}</span>
                <span>{discountCode.oncePerCustomer ? "Once per customer" : "Multiple uses per customer"}</span>
                <span>Minimum {formatMoney(discountCode.minSubtotalCents)}</span>
              </div>
            </div>
            <div className="dash-discounts-row__usage">
              <DiscountStatusBadge status={status} />
              <span>{formatUsage(discountCode)}</span>
              <span>{formatWindow(discountCode)}</span>
            </div>
            <button
              className="button button--secondary dash-discounts-row__action"
              type="button"
              disabled={pending}
              onClick={() => onOpen(discountCode)}
              aria-label={`${canWrite ? "Edit" : "View"} ${discountCode.code}`}
            >
              {canWrite ? "Edit" : "View"}
            </button>
          </article>
        );
      })}
    </div>
  );
}
