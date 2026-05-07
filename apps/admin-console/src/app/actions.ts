"use server";

import type { AppConfigStoreCapabilities } from "@lattelink/contracts-catalog";
import { mobileReleaseProfileUpdateSchema } from "@lattelink/contracts-catalog";
import { redirect } from "next/navigation";
import {
  AdminAuthError,
  clearAdminSession,
  getAdminSession,
  requireAdminCapability,
  revokeAdminSession,
  setAdminSession,
  signInInternalAdmin
} from "@/lib/auth";
import {
  bootstrapInternalLocation,
  buildCapabilities,
  approveInternalLocationLaunch,
  createInternalClient,
  createStripeDashboardLink,
  createStripeOnboardingLink,
  getInternalLocationOnboarding,
  getInternalLocationReadiness,
  resendLocationOwnerInvite,
  updateInternalLocationMobileRelease
} from "@/lib/internal-api";

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function readBoolean(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function readOptionalString(formData: FormData, key: string) {
  const value = readString(formData, key);
  return value.length > 0 ? value : undefined;
}

function readOptionalDateTime(formData: FormData, key: string) {
  const value = readOptionalString(formData, key);
  if (!value) return undefined;
  return new Date(value).toISOString();
}

function readTaxRateBasisPoints(formData: FormData, key: string): number | undefined {
  const raw = readString(formData, key);
  if (!raw) return undefined;
  const percent = parseFloat(raw);
  if (isNaN(percent) || percent < 0 || percent > 100) return undefined;
  return Math.round(percent * 100);
}

function toRedirectError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}

function readCapabilities(formData: FormData): AppConfigStoreCapabilities {
  const requestedFulfillmentMode = readString(formData, "fulfillmentMode");

  return buildCapabilities({
    menuSource: readString(formData, "menuSource") === "external_sync" ? "external_sync" : "platform_managed",
    fulfillmentMode: requestedFulfillmentMode === "time_based" ? "time_based" : "staff",
    liveOrderTrackingEnabled: readBoolean(formData, "liveOrderTrackingEnabled"),
    dashboardEnabled: readBoolean(formData, "dashboardEnabled"),
    loyaltyVisible: readBoolean(formData, "loyaltyVisible")
  });
}

export async function signInAction(formData: FormData) {
  try {
    const session = await signInInternalAdmin({
      email: readString(formData, "email"),
      password: readString(formData, "password")
    });

    await setAdminSession(session);
  } catch (error) {
    const message =
      error instanceof AdminAuthError ? error.message : "Unable to sign in right now. Please try again.";
    redirect(`/sign-in?error=${encodeURIComponent(message)}`);
  }

  redirect("/dashboard");
}

export async function signOutAction() {
  const session = await getAdminSession();
  if (session) {
    try {
      await revokeAdminSession(session);
    } catch {
      // Best effort logout; always clear the local session cookie.
    }
  }

  await clearAdminSession();
  redirect("/sign-in");
}

export async function createClientAction(formData: FormData) {
  const clientName = readString(formData, "clientName");
  const locationName = readString(formData, "locationName");
  const marketLabel = readString(formData, "marketLabel");
  const ownerDisplayName = readString(formData, "ownerDisplayName");
  const ownerEmail = readString(formData, "ownerEmail");
  let locationId = "";

  try {
    await requireAdminCapability("clients:write");
    await requireAdminCapability("owners:write");

    if (!clientName || !locationName || !marketLabel || !ownerDisplayName || !ownerEmail) {
      throw new Error("Client name, location name, market, and owner fields are required.");
    }

    const client = await createInternalClient({
      clientName,
      locationName,
      marketLabel,
      ownerEmail,
      ownerName: ownerDisplayName
    });
    locationId = client.locationId;

    await resendLocationOwnerInvite(locationId, {
      displayName: ownerDisplayName,
      email: ownerEmail,
      dashboardUrl: process.env.ADMIN_CONSOLE_CLIENT_DASHBOARD_URL
    });
  } catch (error) {
    if (locationId) {
      redirect(`/clients/${locationId}/owner?created=1&error=${encodeURIComponent(toRedirectError(error))}`);
    }

    redirect(`/clients/new?error=${encodeURIComponent(toRedirectError(error))}`);
  }

  redirect(`/clients/${locationId}?created=1&invited=1`);
}

export async function updateClientCapabilitiesAction(formData: FormData) {
  const locationId = readString(formData, "locationId");
  if (!locationId) {
    redirect("/clients?error=Location ID is required.");
  }

  try {
    await requireAdminCapability("clients:write");
    await bootstrapInternalLocation({
      brandId: readString(formData, "brandId"),
      brandName: readString(formData, "brandName"),
      locationId,
      locationName: readString(formData, "locationName"),
      marketLabel: readString(formData, "marketLabel"),
      storeName: readString(formData, "storeName"),
      hours: readString(formData, "hours"),
      pickupInstructions: readString(formData, "pickupInstructions"),
      taxRateBasisPoints: readTaxRateBasisPoints(formData, "taxRatePercent"),
      capabilities: readCapabilities(formData)
    });
  } catch (error) {
    redirect(`/clients/${locationId}/capabilities?error=${encodeURIComponent(toRedirectError(error))}`);
  }

  redirect(`/clients/${locationId}/capabilities?updated=1`);
}

export async function resendOwnerInviteAction(formData: FormData) {
  const locationId = readString(formData, "locationId");
  if (!locationId) {
    redirect("/clients?error=Location ID is required.");
  }

  try {
    await requireAdminCapability("owners:write");
    await resendLocationOwnerInvite(locationId, {
      displayName: readString(formData, "displayName"),
      email: readString(formData, "email"),
      dashboardUrl: process.env.ADMIN_CONSOLE_CLIENT_DASHBOARD_URL
    });
  } catch (error) {
    redirect(`/clients/${locationId}/owner?error=${encodeURIComponent(toRedirectError(error))}`);
  }

  redirect(`/clients/${locationId}/owner?invited=1`);
}

export async function startStripeOnboardingAction(formData: FormData) {
  const locationId = readString(formData, "locationId");
  if (!locationId) {
    redirect("/clients?error=Location ID is required.");
  }

  let destinationUrl: string;
  try {
    await requireAdminCapability("clients:write");
    const link = await createStripeOnboardingLink(locationId, {
      returnUrl: readString(formData, "returnUrl"),
      refreshUrl: readString(formData, "refreshUrl")
    });
    destinationUrl = link.url;
  } catch (error) {
    redirect(`/clients/${locationId}/payments?error=${encodeURIComponent(toRedirectError(error))}`);
  }

  redirect(destinationUrl);
}

export async function openStripeDashboardAction(formData: FormData) {
  const locationId = readString(formData, "locationId");
  if (!locationId) {
    redirect("/clients?error=Location ID is required.");
  }

  let destinationUrl: string;
  try {
    await requireAdminCapability("clients:read");
    const link = await createStripeDashboardLink(locationId);
    destinationUrl = link.url;
  } catch (error) {
    redirect(`/clients/${locationId}/payments?error=${encodeURIComponent(toRedirectError(error))}`);
  }

  redirect(destinationUrl);
}

export async function updateMobileReleaseAction(formData: FormData) {
  const locationId = readString(formData, "locationId");
  if (!locationId) {
    redirect("/clients?error=Location ID is required.");
  }

  try {
    await requireAdminCapability("clients:write");
    await updateInternalLocationMobileRelease(
      locationId,
      mobileReleaseProfileUpdateSchema.parse({
        status: readOptionalString(formData, "status"),
        statusLabel: readOptionalString(formData, "statusLabel"),
        buildNumber: readOptionalString(formData, "buildNumber"),
        testFlightUrl: readOptionalString(formData, "testFlightUrl"),
        appStoreUrl: readOptionalString(formData, "appStoreUrl"),
        submittedAt: readOptionalDateTime(formData, "submittedAt"),
        approvedAt: readOptionalDateTime(formData, "approvedAt"),
        liveAt: readOptionalDateTime(formData, "liveAt"),
        blockedReason: readOptionalString(formData, "blockedReason"),
        notes: readOptionalString(formData, "notes")
      })
    );
  } catch (error) {
    redirect(`/clients/${locationId}?releaseError=${encodeURIComponent(toRedirectError(error))}`);
  }

  redirect(`/clients/${locationId}?releaseUpdated=1`);
}

function collectLaunchBlockers(
  onboarding: Awaited<ReturnType<typeof getInternalLocationOnboarding>>,
  readiness: Awaited<ReturnType<typeof getInternalLocationReadiness>>
) {
  const readinessOwnedOnboardingChecks = new Set(["owner_invited", "owner_activated"]);
  const blockers = new Map<string, string>();
  for (const item of onboarding.checklist) {
    if (!item.passed && item.id !== "admin_launch_approved" && !readinessOwnedOnboardingChecks.has(item.id)) {
      blockers.set(item.id, item.detail ? `${item.label}: ${item.detail}` : item.label);
    }
  }

  for (const check of readiness.checks) {
    if (!check.passed) {
      blockers.set(check.id, check.detail ? `${check.label}: ${check.detail}` : check.label);
    }
  }

  return Array.from(blockers.values());
}

export async function approveLaunchAction(formData: FormData) {
  const locationId = readString(formData, "locationId");
  const launchAction = readString(formData, "launchAction");
  if (!locationId) {
    redirect("/clients?error=Location ID is required.");
  }

  try {
    await requireAdminCapability("clients:write");
    const [onboarding, readiness] = await Promise.all([
      getInternalLocationOnboarding(locationId),
      getInternalLocationReadiness(locationId)
    ]);
    const blockers = collectLaunchBlockers(onboarding, readiness);
    if (blockers.length > 0) {
      throw new Error(`Launch approval is blocked by: ${blockers.slice(0, 5).join("; ")}.`);
    }

    if (launchAction === "live" && onboarding.status !== "approved" && onboarding.status !== "live") {
      throw new Error("Approve the launch before marking the app live.");
    }

    await approveInternalLocationLaunch(locationId, {
      approved: true,
      live: launchAction === "live",
      note: readOptionalString(formData, "note")
    });
  } catch (error) {
    redirect(`/clients/${locationId}?launchError=${encodeURIComponent(toRedirectError(error))}`);
  }

  redirect(`/clients/${locationId}?${launchAction === "live" ? "launchLive" : "launchApproved"}=1`);
}
