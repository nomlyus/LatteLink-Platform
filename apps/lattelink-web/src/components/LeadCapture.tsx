"use client";

import Link from "next/link";
import { type FormEvent, useState, useTransition } from "react";
import { contactEmail } from "@/lib/site";

type LeadCaptureResult =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export function LeadCapture() {
  const [result, setResult] = useState<LeadCaptureResult>({ status: "idle" });
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
          setResult({
            status: "error",
            message:
              payload?.message ??
              "Lead capture is unavailable right now. Email hello@lattelink.app and we will take it from there.",
          });
          return;
        }

        form.reset();
        setResult({
          status: "success",
          message:
            payload?.message ??
            "Intro request received. We will reply within one business day to confirm fit and schedule the walkthrough.",
        });
      } catch {
        setResult({
          status: "error",
          message:
            "Lead capture is unavailable right now. Email hello@lattelink.app and we will take it from there.",
        });
      }
    });
  }

  return (
    <div className="lead-card">
      <div className="lead-card__head">
        <div className="lead-card__eyebrow">Pilot intro request</div>
        <h3 className="lead-card__title">Tell us about the shop.</h3>
        <p className="lead-card__copy">
          We use this to confirm fit before we schedule the walkthrough. No
          canned funnel, no hard sell.
        </p>
      </div>

      <form className="lead-form" onSubmit={handleSubmit}>
        <label className="lead-field">
          <span className="lead-field__label">Full name</span>
          <input
            className="lead-field__input"
            type="text"
            name="fullName"
            autoComplete="name"
            placeholder="Yazan Daoud"
            maxLength={80}
            required
          />
        </label>
        <label className="lead-field">
          <span className="lead-field__label">Work email</span>
          <input
            className="lead-field__input"
            type="email"
            name="workEmail"
            autoComplete="email"
            placeholder="owner@shop.com"
            maxLength={120}
            required
          />
        </label>
        <label className="lead-field">
          <span className="lead-field__label">Shop name</span>
          <input
            className="lead-field__input"
            type="text"
            name="shopName"
            placeholder="Northside Coffee"
            maxLength={100}
            required
          />
        </label>
        <label className="lead-field">
          <span className="lead-field__label">Locations</span>
          <input
            className="lead-field__input"
            type="text"
            name="locations"
            placeholder="1 flagship, 1 kiosk"
            maxLength={80}
            required
          />
        </label>
        <label className="lead-field lead-field--full">
          <span className="lead-field__label">Current ordering setup</span>
          <textarea
            className="lead-field__input lead-field__input--textarea"
            name="orderingSetup"
            placeholder="Clover only, Instagram DMs, third-party marketplace, no loyalty..."
            maxLength={500}
            rows={4}
            required
          />
        </label>
        <label className="lead-field lead-field--full">
          <span className="lead-field__label">What do you want LatteLink to fix first?</span>
          <textarea
            className="lead-field__input lead-field__input--textarea"
            name="goals"
            placeholder="Repeat ordering, customer ownership, loyalty, better operator visibility..."
            maxLength={500}
            rows={4}
            required
          />
        </label>
        <label className="lead-field lead-field--trap" aria-hidden="true">
          <span className="lead-field__label">Website</span>
          <input className="lead-field__input" type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>

        <button className="lead-submit" type="submit" disabled={isPending}>
          {isPending ? "Sending..." : "Request intro"}
        </button>
      </form>

      <div
        className={`lead-status${
          result.status === "success" ? " lead-status--success" : result.status === "error" ? " lead-status--error" : ""
        }`}
      >
        {result.status === "idle"
          ? "We reply within one business day with next steps and a proposed walkthrough time."
          : result.message}
      </div>

      <div className="lead-card__footer">
        Prefer direct email? <Link href={`mailto:${contactEmail}`}>{contactEmail}</Link>
      </div>

      <style jsx>{`
        .lead-card {
          background: rgba(8, 10, 18, 0.84);
          border: 1px solid rgba(74, 126, 255, 0.2);
          border-radius: 24px;
          padding: 30px;
          text-align: left;
          backdrop-filter: blur(18px);
        }
        .lead-card__head {
          margin-bottom: 24px;
        }
        .lead-card__eyebrow {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--color-blue-500);
          margin-bottom: 12px;
        }
        .lead-card__title {
          font-family: var(--font-display);
          font-size: 28px;
          font-weight: 800;
          line-height: 1.05;
          letter-spacing: -0.03em;
          color: var(--color-gray-100);
          margin: 0 0 12px;
        }
        .lead-card__copy {
          margin: 0;
          font-size: 14px;
          line-height: 1.7;
          color: var(--color-gray-400);
        }
        .lead-form {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }
        .lead-field {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .lead-field--full {
          grid-column: 1 / -1;
        }
        .lead-field--trap {
          position: absolute;
          width: 1px;
          height: 1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
        }
        .lead-field__label {
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--color-gray-500);
        }
        .lead-field__input {
          width: 100%;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px;
          background: rgba(14, 16, 28, 0.92);
          color: var(--color-gray-100);
          padding: 14px 15px;
          font: inherit;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
        }
        .lead-field__input::placeholder {
          color: var(--color-gray-600);
        }
        .lead-field__input:focus {
          border-color: rgba(74, 126, 255, 0.8);
          box-shadow: 0 0 0 4px rgba(74, 126, 255, 0.12);
          background: rgba(16, 18, 32, 0.98);
        }
        .lead-field__input--textarea {
          min-height: 112px;
          resize: vertical;
        }
        .lead-submit {
          grid-column: 1 / -1;
          border: none;
          border-radius: 14px;
          padding: 16px 20px;
          background: linear-gradient(135deg, #2a5fff, #4a7eff);
          color: white;
          font: inherit;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 0 36px rgba(74, 126, 255, 0.28);
          transition: transform 0.2s, opacity 0.2s, box-shadow 0.2s;
        }
        .lead-submit:hover:enabled {
          transform: translateY(-1px);
          box-shadow: 0 0 48px rgba(74, 126, 255, 0.4);
        }
        .lead-submit:disabled {
          opacity: 0.7;
          cursor: wait;
        }
        .lead-status {
          margin-top: 16px;
          padding: 14px 16px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          color: var(--color-gray-400);
          font-size: 13px;
          line-height: 1.7;
        }
        .lead-status--success {
          border-color: rgba(63, 214, 152, 0.3);
          color: #9ef0c9;
          background: rgba(10, 48, 34, 0.4);
        }
        .lead-status--error {
          border-color: rgba(255, 116, 116, 0.22);
          color: #ffb1b1;
          background: rgba(62, 18, 18, 0.45);
        }
        .lead-card__footer {
          margin-top: 14px;
          font-size: 13px;
          color: var(--color-gray-500);
        }
        .lead-card__footer :global(a) {
          color: var(--color-gray-200);
          text-decoration: none;
        }
        .lead-card__footer :global(a:hover) {
          color: white;
        }
        @media (max-width: 720px) {
          .lead-card {
            padding: 22px;
          }
          .lead-form {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
