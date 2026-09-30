import type { OperatorOnboardingSummary } from "./onboarding-api";
import type { OperatorAppIdentityUpdate } from "./onboarding-api";

export const clientSetupSteps = [
  { id: "business_profile_complete", label: "Store profile", shortLabel: "Profile", action: "Review store details" },
  { id: "store_operations_complete", label: "Hours and pickup", shortLabel: "Details", action: "Review store details" },
  { id: "payments_connected", label: "Payments", shortLabel: "Payments", action: "Connect Stripe" },
  { id: "app_identity_ready", label: "App profile", shortLabel: "App", action: "Complete app profile" },
  { id: "menu_ready", label: "Menu", shortLabel: "Menu", action: "Review menu" },
  { id: "team_configured_or_skipped", label: "Team access", shortLabel: "Team", action: "Review team" },
  { id: "test_order_completed", label: "Test order", shortLabel: "Test order", action: "Run test order" }
] as const;

export const mobileReleaseTimeline = [
  { status: "not_started", label: "Not started" },
  { status: "metadata_ready", label: "App profile ready" },
  { status: "metadata_pending", label: "App profile pending" },
  { status: "build_configuring", label: "Build in progress" },
  { status: "build_ready", label: "Build ready" },
  { status: "submitted_for_review", label: "Submitted to App Store" },
  { status: "approved", label: "Approved" },
  { status: "ready_for_launch", label: "Ready for launch" },
  { status: "live", label: "Live" }
] as const;

export type OnboardingPrimaryAction =
  | { kind: "submit-review" }
  | { kind: "open-wizard"; step: 2 | 4 }
  | { kind: "stripe" }
  | { kind: "navigate"; href: "/menu" | "/team" | "/orders" };

export function isOnboardingIncomplete(status: string | null | undefined) {
  return Boolean(status && status !== "approved" && status !== "live");
}

export function getOnboardingChecklist(summary: OperatorOnboardingSummary) {
  return clientSetupSteps.map((step) => ({
    ...step,
    passed: summary.checklist.find((item) => item.id === step.id)?.passed === true
  }));
}

export function getRemainingOnboardingSteps(summary: OperatorOnboardingSummary) {
  return getOnboardingChecklist(summary).filter((step) => !step.passed);
}

export function getOnboardingPrimaryAction(summary: OperatorOnboardingSummary): OnboardingPrimaryAction | null {
  const submitted = summary.status === "ready_for_review" || Boolean(summary.submittedForReviewAt);
  if (submitted || summary.status === "approved" || summary.status === "live") return null;

  const next = getRemainingOnboardingSteps(summary)[0];
  if (summary.readyForReview || !next) return { kind: "submit-review" };
  if (next.id === "business_profile_complete" || next.id === "store_operations_complete") {
    return { kind: "open-wizard", step: 2 };
  }
  if (next.id === "payments_connected") return { kind: "stripe" };
  if (next.id === "app_identity_ready") return { kind: "open-wizard", step: 4 };
  if (next.id === "menu_ready") return { kind: "navigate", href: "/menu" };
  if (next.id === "team_configured_or_skipped") return { kind: "navigate", href: "/team" };
  return { kind: "navigate", href: "/orders" };
}

export function getOnboardingSummaryCopy(summary: OperatorOnboardingSummary) {
  const remaining = getRemainingOnboardingSteps(summary);
  const submitted = summary.status === "ready_for_review" || Boolean(summary.submittedForReviewAt);
  const title = submitted
    ? "Setup submitted"
    : remaining.length === 0 && summary.readyForReview
      ? "Ready for Nomly review"
      : remaining.length === 0
        ? "Client setup complete"
        : `${remaining.length} setup ${remaining.length === 1 ? "item" : "items"} left`;
  const description = submitted
    ? "Nomly is reviewing your launch details and preparing the mobile release."
    : remaining.length === 0 && summary.readyForReview
      ? "Everything client-side is complete. Send it to Nomly for launch review."
      : remaining.length === 0
        ? "Everything client-side is complete. Nomly is checking launch readiness."
        : `Next: ${remaining[0]?.action ?? "Finish setup"}.`;
  return { title, description, remaining, submitted };
}

export function getMobileReleaseStatusLabel(status: string | undefined, statusLabel?: string) {
  return statusLabel ?? mobileReleaseTimeline.find((item) => item.status === status)?.label ?? "Not started";
}

export function shouldShowMobileRelease(summary: OperatorOnboardingSummary) {
  return Boolean(
    summary.mobileRelease ||
    summary.status === "ready_for_review" ||
    summary.status === "approved" ||
    summary.status === "live" ||
    summary.submittedForReviewAt
  );
}

function optionalText(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

export function buildAppIdentityUpdate(formData: FormData): OperatorAppIdentityUpdate {
  const keywords = String(formData.get("keywords") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const screenshotAssetUrls = String(formData.get("screenshotAssetUrls") ?? "").split("\n").map((value) => value.trim()).filter(Boolean);
  return {
    appName: optionalText(formData.get("appName")),
    displayName: optionalText(formData.get("displayName")),
    bundleIdentifier: optionalText(formData.get("bundleIdentifier")),
    sku: optionalText(formData.get("sku")),
    subtitle: optionalText(formData.get("subtitle")),
    description: optionalText(formData.get("description")),
    keywords,
    supportUrl: optionalText(formData.get("supportUrl")),
    privacyPolicyUrl: optionalText(formData.get("privacyPolicyUrl")),
    marketingUrl: optionalText(formData.get("marketingUrl")),
    iconAssetUrl: optionalText(formData.get("iconAssetUrl")),
    splashAssetUrl: optionalText(formData.get("splashAssetUrl")),
    screenshotAssetUrls,
    assetMode: formData.get("assetMode") === "provided" ? "provided" : "placeholder"
  };
}

export function getOnboardingScopeKey(
  operatorUserId: string | null,
  locationId: string | "all" | null,
  capabilities: readonly string[],
  sessionGeneration = 0
) {
  return `${operatorUserId ?? "signed-out"}:${locationId ?? "unselected"}:${[...capabilities].sort().join(",")}:${sessionGeneration}`;
}

export function readLaunchIntent(search: string) {
  const params = new URLSearchParams(search);
  return params.get("intent")?.trim().toLowerCase() === "launch" || params.get("start")?.trim().toLowerCase() === "app";
}

export function stripOnboardingEntryParams(pathname: string, search: string, hash = "") {
  const params = new URLSearchParams(search);
  params.delete("intent");
  params.delete("start");
  params.delete("stripeReturn");
  params.delete("stripeRefresh");
  const nextSearch = params.toString();
  return `${pathname}${nextSearch ? `?${nextSearch}` : ""}${hash}`;
}

export function completeLaunchIntent(search: string, hash = "") {
  const params = new URLSearchParams(search);
  params.delete("intent");
  params.delete("start");
  params.delete("stripeReturn");
  params.delete("stripeRefresh");
  params.set("launchComplete", "1");
  return `/${params.toString() ? `?${params}` : ""}${hash}`;
}
