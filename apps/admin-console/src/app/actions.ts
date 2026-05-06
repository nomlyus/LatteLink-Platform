"use server";

import type { AppConfigStoreCapabilities } from "@lattelink/contracts-catalog";
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
  createStripeDashboardLink,
  createStripeOnboardingLink,
  provisionLocationOwner
} from "@/lib/internal-api";

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function readOptionalString(formData: FormData, key: string) {
  const value = readString(formData, key);
  return value.length > 0 ? value : undefined;
}

function readBoolean(formData: FormData, key: string) {
  return formData.get(key) === "on";
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

    if (!clientName || !locationName || !marketLabel || !ownerDisplayName || !ownerEmail) {
      throw new Error("Client name, location name, market, and owner fields are required.");
    }

    const location = await bootstrapInternalLocation({
      brandName: clientName,
      locationName,
      marketLabel,
      storeName: readOptionalString(formData, "storeName") ?? clientName,
      hours: readOptionalString(formData, "hours"),
      pickupInstructions: readOptionalString(formData, "pickupInstructions"),
      taxRateBasisPoints: readTaxRateBasisPoints(formData, "taxRatePercent"),
      capabilities: readCapabilities(formData)
    });
    locationId = location.locationId;

    await provisionLocationOwner(locationId, {
      displayName: ownerDisplayName,
      email: ownerEmail,
      password: readOptionalString(formData, "temporaryPassword"),
      dashboardUrl: readOptionalString(formData, "dashboardUrl") ?? process.env.ADMIN_CONSOLE_CLIENT_DASHBOARD_URL
    });
  } catch (error) {
    redirect(`/clients/new?error=${encodeURIComponent(toRedirectError(error))}`);
  }

  redirect(`/clients/${locationId}?created=1`);
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

export async function reprovisionOwnerAction(formData: FormData) {
  const locationId = readString(formData, "locationId");
  if (!locationId) {
    redirect("/clients?error=Location ID is required.");
  }

  try {
    await requireAdminCapability("owners:write");
    await provisionLocationOwner(locationId, {
      displayName: readString(formData, "displayName"),
      email: readString(formData, "email"),
      password: readOptionalString(formData, "temporaryPassword"),
      dashboardUrl: readOptionalString(formData, "dashboardUrl") ?? process.env.ADMIN_CONSOLE_CLIENT_DASHBOARD_URL
    });
  } catch (error) {
    redirect(`/clients/${locationId}/owner?error=${encodeURIComponent(toRedirectError(error))}`);
  }

  redirect(`/clients/${locationId}/owner?updated=1`);
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
