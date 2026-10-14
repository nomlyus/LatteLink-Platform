import type { OperatorAppIdentityUpdate } from "./onboarding-api";
import { readStripeReturnParams } from "../../lib/navigation/route-callbacks";

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

export function getMobileReleaseStatusLabel(status: string | undefined, statusLabel?: string) {
  return statusLabel ?? mobileReleaseTimeline.find((item) => item.status === status)?.label ?? "Not started";
}

function optionalText(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

export function buildAppIdentityUpdate(formData: FormData): OperatorAppIdentityUpdate {
  return {
    appName: optionalText(formData.get("appName")),
    displayName: optionalText(formData.get("displayName")),
    subtitle: optionalText(formData.get("subtitle")),
    description: optionalText(formData.get("description")),
    keywords: String(formData.get("keywords") ?? "").split(",").map((value) => value.trim()).filter(Boolean),
    supportUrl: optionalText(formData.get("supportUrl")),
    privacyPolicyUrl: optionalText(formData.get("privacyPolicyUrl")),
    marketingUrl: optionalText(formData.get("marketingUrl")),
    iconAssetUrl: optionalText(formData.get("iconAssetUrl")),
    splashAssetUrl: optionalText(formData.get("splashAssetUrl")),
    screenshotAssetUrls: String(formData.get("screenshotAssetUrls") ?? "").split("\n").map((value) => value.trim()).filter(Boolean),
    assetMode: formData.get("assetMode") === "provided" ? "provided" : "placeholder"
  };
}

export function getOnboardingScopeKey(operatorUserId: string | null, locationId: string | "all" | null, capabilities: readonly string[], sessionGeneration = 0) {
  return `${operatorUserId ?? "signed-out"}:${locationId ?? "unselected"}:${[...capabilities].sort().join(",")}:${sessionGeneration}`;
}

export function readLaunchIntent(search: string) {
  const params = new URLSearchParams(search);
  return params.get("intent")?.trim().toLowerCase() === "launch" || params.get("start")?.trim().toLowerCase() === "app";
}

export function resolveOnboardingCompatibilityDestination(search: string, hash = "", requiresSetup = false) {
  const params = new URLSearchParams(search);
  const stripe = readStripeReturnParams(search);
  const rootEntry = readLaunchIntent(search) || requiresSetup;
  for (const name of ["intent", "start", "stripeReturn", "stripeRefresh"]) params.delete(name);
  if (!rootEntry) params.set("tab", stripe.returned || stripe.refreshRequested ? "payments" : "launch");
  return `${rootEntry ? "/" : "/settings"}${params.size ? `?${params}` : ""}${hash}`;
}
