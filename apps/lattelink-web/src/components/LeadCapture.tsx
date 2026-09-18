"use client";

import { type FormEvent, useState, useTransition } from "react";
import { trackAnalyticsEvent } from "@/lib/analytics";

type LeadCaptureResult =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export function LeadCapture() {
  const [result, setResult] = useState<LeadCaptureResult>({ status: "idle" });
  const [hasTrackedStart, setHasTrackedStart] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    startTransition(async () => {
      setResult({ status: "idle" });
      const formData = new FormData(form);

      try {
        const response = await fetch("/api/pilot-intro", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullName: String(formData.get("fullName") ?? ""),
            workEmail: String(formData.get("workEmail") ?? ""),
            shopName: String(formData.get("shopName") ?? ""),
            locations: String(formData.get("locations") ?? ""),
            orderingSetup: String(formData.get("orderingSetup") ?? ""),
            goals: String(formData.get("goals") ?? ""),
            website: String(formData.get("website") ?? ""),
          }),
        });

        const payload = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;

        if (!response.ok) {
          trackAnalyticsEvent("lead_form_failed", {
            placement: "contact_form",
            reason: response.status,
          });
          setResult({
            status: "error",
            message:
              payload?.message ??
              "Lead capture is unavailable right now. Please try again later.",
          });
          return;
        }

        form.reset();
        setHasTrackedStart(false);
        trackAnalyticsEvent("lead_form_submitted", {
          placement: "contact_form",
          destination: "pilot_intro",
        });
        setResult({
          status: "success",
          message:
            payload?.message ??
            "Intro request received. We will reply within one business day to confirm fit and schedule the walkthrough.",
        });
      } catch {
        trackAnalyticsEvent("lead_form_failed", {
          placement: "contact_form",
          reason: "network",
        });
        setResult({
          status: "error",
          message: "Lead capture is unavailable right now. Please try again later.",
        });
      }
    });
  }

  return (
    <div className="lead-card">
      <form
        className="lead-form"
        onSubmit={handleSubmit}
        onFocusCapture={() => {
          if (hasTrackedStart) return;
          setHasTrackedStart(true);
          trackAnalyticsEvent("lead_form_started", {
            placement: "contact_form",
            destination: "pilot_intro",
          });
        }}
      >
        <Field label="Full name">
          <input
            className="lead-input"
            type="text"
            name="fullName"
            autoComplete="name"
            placeholder="Yazan Daoud"
            maxLength={80}
            required
          />
        </Field>
        <Field label="Work email">
          <input
            className="lead-input"
            type="email"
            name="workEmail"
            autoComplete="email"
            placeholder="owner@shop.com"
            maxLength={120}
            required
          />
        </Field>
        <Field label="Shop name">
          <input
            className="lead-input"
            type="text"
            name="shopName"
            placeholder="Northside Coffee"
            maxLength={100}
            required
          />
        </Field>
        <Field label="Locations">
          <input
            className="lead-input"
            type="text"
            name="locations"
            placeholder="1 flagship, 1 kiosk"
            maxLength={80}
            required
          />
        </Field>
        <Field label="Current ordering setup" full>
          <textarea
            className="lead-input lead-textarea"
            name="orderingSetup"
            placeholder="POS only, Instagram DMs, third-party marketplace, no loyalty…"
            maxLength={500}
            rows={3}
            required
          />
        </Field>
        <Field label="What do you want Nomly to fix first?" full>
          <textarea
            className="lead-input lead-textarea"
            name="goals"
            placeholder="Repeat ordering, customer ownership, loyalty, better operator visibility…"
            maxLength={500}
            rows={3}
            required
          />
        </Field>

        <label className="lead-trap" aria-hidden="true">
          <span>Website</span>
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
          />
        </label>

        <button className="lead-submit" type="submit" disabled={isPending}>
          {isPending ? "Sending…" : "Request intro"}
        </button>
      </form>

      <div
        className={`lead-status${
          result.status === "success"
            ? " lead-status--success"
            : result.status === "error"
              ? " lead-status--error"
              : ""
        }`}
      >
        {result.status === "idle"
          ? "We reply within one business day with next steps and a proposed walkthrough time."
          : result.message}
      </div>

      <style jsx>{`
        .lead-card {
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: 28px;
        }
        .lead-form {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }
        .lead-trap {
          position: absolute;
          width: 1px;
          height: 1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
        }
        .lead-status {
          margin-top: 16px;
          padding: 12px 14px;
          border-radius: var(--radius-md);
          background: var(--color-bg-muted);
          border: 1px solid var(--color-border);
          color: var(--color-text-muted);
          font-size: 13px;
          line-height: 1.6;
        }
        .lead-status--success {
          background: var(--color-text);
          color: var(--color-text-invert);
          border-color: var(--color-text);
        }
        .lead-status--error {
          background: var(--color-bg-muted);
          color: var(--color-text);
          border-color: var(--color-text);
        }
        .lead-footnote {
          margin-top: 14px;
          font-size: 13px;
          color: var(--color-text-muted);
        }
        .lead-footnote :global(a) {
          color: var(--color-text);
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .lead-submit {
          grid-column: 1 / -1;
          height: 46px;
          border-radius: var(--radius-md);
          background: var(--color-text);
          color: var(--color-text-invert);
          font-size: 14px;
          font-weight: 500;
          transition: background-color 0.18s ease, opacity 0.18s ease;
        }
        .lead-submit:hover:enabled {
          background: #1f1f23;
        }
        .lead-submit:disabled {
          opacity: 0.6;
          cursor: wait;
        }
        @media (max-width: 560px) {
          .lead-form {
            grid-template-columns: 1fr;
          }
          .lead-card {
            padding: 22px;
          }
        }
      `}</style>

      <style jsx global>{`
        .lead-input {
          width: 100%;
          height: 44px;
          padding: 0 14px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          background: var(--color-bg);
          color: var(--color-text);
          font-size: 14.5px;
          line-height: 1.4;
          outline: none;
          transition: border-color 0.18s ease, box-shadow 0.18s ease;
        }
        .lead-input::placeholder {
          color: var(--color-text-subtle);
        }
        .lead-input:focus {
          border-color: var(--color-text);
          box-shadow: var(--shadow-focus);
        }
        .lead-textarea {
          height: auto;
          min-height: 96px;
          padding: 12px 14px;
          resize: vertical;
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        gridColumn: full ? "1 / -1" : undefined,
      }}
    >
      <span
        style={{
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--color-text-muted)",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
