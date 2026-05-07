"use client";

import { useEffect, useState } from "react";
import type { LaunchReadinessResponse } from "@lattelink/contracts-catalog";

type LaunchReadinessChecklistProps = {
  readiness: LaunchReadinessResponse;
};

export function LaunchReadinessChecklist({ readiness }: LaunchReadinessChecklistProps) {
  const storageKey = `launch-readiness:${readiness.locationId}:test-order-confirmed`;
  const [testOrderConfirmed, setTestOrderConfirmed] = useState(false);

  useEffect(() => {
    setTestOrderConfirmed(window.localStorage.getItem(storageKey) === "true");
  }, [storageKey]);

  const checks = readiness.checks.map((check) =>
    check.id === "test_order_confirmed"
      ? {
          ...check,
          passed: testOrderConfirmed
        }
      : check
  );
  const allChecksPassed = checks.every((check) => check.passed);
  const remaining = checks.filter((check) => !check.passed).length;

  function updateTestOrderConfirmed(nextValue: boolean) {
    setTestOrderConfirmed(nextValue);
    window.localStorage.setItem(storageKey, String(nextValue));
  }

  return (
    <div className="launch-checklist">
      <div className="launch-checklist__summary">
        <div>
          <span className="eyebrow">Launch Readiness</span>
          <h4>{allChecksPassed ? "Ready to go live" : `Not ready - ${remaining} item${remaining === 1 ? "" : "s"} remaining`}</h4>
          <p className="subtle-copy">
            Automated checks come from the backend readiness endpoint. Confirm the test order manually after a successful end-to-end checkout.
          </p>
        </div>
        <span className={`status-badge is-${allChecksPassed ? "healthy" : "warning"}`}>
          {allChecksPassed ? "Checks passed" : "Blocked"}
        </span>
      </div>

      <div className="checklist">
        {checks.map((check) => (
          <div key={check.id} className={check.passed ? "check-item is-ready" : "check-item is-blocked"}>
            <div className="check-item__heading">
              <strong>{check.label}</strong>
              <span>{check.passed ? "Passed" : "Needs attention"}</span>
            </div>
            {check.detail ? <p className="subtle-copy">{check.detail}</p> : null}
            {check.id === "test_order_confirmed" ? (
              <label className="manual-check">
                <input
                  type="checkbox"
                  checked={testOrderConfirmed}
                  onChange={(event) => updateTestOrderConfirmed(event.target.checked)}
                />
                <span>Test order completed and fulfilled successfully</span>
              </label>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
