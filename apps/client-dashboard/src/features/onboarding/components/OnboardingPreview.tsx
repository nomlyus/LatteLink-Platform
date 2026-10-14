"use client";

import React, { useState } from "react";
import { onboardingSummarySchema } from "@lattelink/contracts-catalog";
import type { OwnerOnboardingLocation, OwnerOnboardingStep } from "../owner-onboarding-state";
import { OnboardingWizard } from "./OnboardingWizard";
import type { OwnerOnboardingActions } from "./OwnerOnboardingSteps";
import authStyles from "../../auth/components/auth-v3.module.css";

function previewLocations(): OwnerOnboardingLocation[] {
  return ["Downtown", "Uptown"].map((locationName, index) => {
    const locationId = `preview-location-${index}`;
    return {
      summary: onboardingSummarySchema.parse({
        tenantId: "preview-tenant", brandId: "preview-brand", brandName: "Northside Coffee",
        locationId, locationName, marketLabel: "Detroit, MI", status: "in_progress",
        readyForReview: false, ownerSetupRequired: true, checklist: [],
        paymentReadiness: { ready: false, onboardingState: "pending", missingRequiredFields: ["Stripe verification"] }
      }),
      config: {
        locationId, locationName, storeName: "Northside Coffee", hours: index === 0 ? "Daily 8 AM – 4 PM" : "",
        pickupInstructions: "Collect at the counter", taxRateBasisPoints: 600, timezone: "America/Detroit",
        capabilities: {
          menu: { source: "platform_managed" },
          operations: { fulfillmentMode: "staff", liveOrderTrackingEnabled: true, dashboardEnabled: true },
          loyalty: { visible: true }
        }
      }
    };
  });
}

// This preview owns only disposable React state: no session, persistence or API adapters.
export function OnboardingPreview() {
  const [locations, setLocations] = useState(previewLocations);
  const [step, setStep] = useState<OwnerOnboardingStep>(0);
  const [open, setOpen] = useState(true);
  const [notice, setNotice] = useState("Development preview · Sample data only. Nothing is saved.");
  const paymentReady = async (locationId: string) => {
    setLocations((current) => current.map((row) => row.config.locationId !== locationId ? row : {
      ...row, summary: { ...row.summary, paymentReadiness: { ready: true, onboardingState: "completed", missingRequiredFields: [] } }
    }));
    return true;
  };
  const state: OwnerOnboardingActions & { mutationError: string | null } = {
    locations, pending: false, mutationError: null,
    saveProfile: async (input) => {
      setLocations((current) => current.map((row) => ({ ...row, summary: { ...row.summary, ownerProfile: input, brandName: input.brandName }, config: { ...row.config, storeName: input.customerFacingName } })));
      return true;
    },
    saveLocation: async (locationId, input) => {
      setLocations((current) => current.map((row) => row.config.locationId !== locationId ? row : {
        ...row, summary: { ...row.summary, ownerLocationDetails: input, ownerDetailsConfirmedAt: new Date().toISOString(), locationName: input.locationName }, config: { ...row.config, ...input }
      }));
      return true;
    },
    connectStripe: paymentReady,
    refreshStripe: paymentReady,
    setTeamComplete: async (locationId) => {
      setLocations((current) => current.map((row) => row.config.locationId !== locationId ? row : {
        ...row, summary: { ...row.summary, checklist: [{ id: "team_configured_or_skipped", label: "Team", passed: true, status: "complete", required: true, manual: false, detail: "Preview only" }] }
      }));
      return true;
    },
    submit: async () => { setNotice("Preview complete. Nothing was submitted to Nomly."); return true; }
  };
  return <main className={authStyles.page} onClickCapture={(event) => {
    if (event.target instanceof Element && event.target.closest('a[href="/team"]')) {
      event.preventDefault(); event.stopPropagation();
      setNotice("Team management is not connected in this preview. Use Set up later to continue.");
    }
  }}>
    <header className={authStyles.header}>nomly · Onboarding preview</header>
    <p role="status">{notice}</p>
    {!open ? <button className={authStyles.action} style={{ width: "fit-content", marginTop: 24 }} onClick={() => {
      setLocations(previewLocations()); setStep(0); setOpen(true);
      setNotice("Development preview · Sample data only. Nothing is saved.");
    }}>Restart preview</button> : null}
    {open ? <OnboardingWizard brandName={locations[0].summary.ownerProfile?.brandName ?? ""} canWrite state={state} step={step} onStepChange={setStep} onClose={() => setOpen(false)} /> : null}
  </main>;
}
