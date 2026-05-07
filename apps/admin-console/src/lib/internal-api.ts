import type {
  InternalOwnerInviteRequest,
  InternalOwnerInviteResponse,
  InternalOwnerProvisionRequest,
  InternalOwnerProvisionResponse,
  InternalOwnerSummary
} from "@lattelink/contracts-auth";
import type {
  AdminClientCreateRequest,
  AdminClientCreateResponse,
  AppConfigStoreCapabilities,
  ClientPaymentProfile,
  InternalLocationBootstrap,
  InternalLocationListResponse,
  InternalLocationSummary,
  LaunchApprovalRequest,
  LaunchReadinessResponse,
  MobileReleaseProfileUpdate,
  OnboardingSummary,
  StripeConnectLinkResponse
} from "@lattelink/contracts-catalog";
import { requireAdminSession } from "@/lib/auth";
import {
  getClientDashboardUrlStatus,
  getInternalAdminApiBaseUrl,
  getInternalAdminApiBaseUrlStatus,
  getOptionalClientDashboardUrl,
  hasInternalAdminApiBaseUrl
} from "@/lib/config";

export type SupportAuditLogEntry = {
  logId: string;
  locationId: string;
  actorId: string;
  actorType: string;
  action: string;
  targetId?: string;
  targetType?: string;
  payload?: unknown;
  occurredAt: string;
};

export type SupportOrderLookupResult = {
  order: {
    id: string;
    locationId: string;
    status: string;
    total: {
      currency: string;
      amountCents: number;
    };
    pickupCode: string;
  };
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  userId?: string;
  paymentId?: string;
  paymentStatus?: string;
  paymentProvider?: string;
  paymentIntentId?: string;
  createdAt?: string;
  updatedAt?: string;
  auditLog: SupportAuditLogEntry[];
};

export type SupportOrderLookupResponse = {
  results: SupportOrderLookupResult[];
};

type InternalApiErrorBody = {
  code?: string;
  message?: string;
};

export class InternalApiError extends Error {
  statusCode: number;
  code?: string;

  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.name = "InternalApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

async function requestInternalApi<TResponse>(path: string, init?: RequestInit): Promise<TResponse> {
  const session = await requireAdminSession();
  const response = await fetch(`${getInternalAdminApiBaseUrl()}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.accessToken}`,
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    let errorBody: InternalApiErrorBody | undefined;
    try {
      errorBody = (await response.json()) as InternalApiErrorBody;
    } catch {
      errorBody = undefined;
    }

    // Prefix with status code so the client error boundary can detect 401/403
    // without relying on custom error properties (which are stripped on serialization).
    const message = errorBody?.message ?? `Request failed with status ${response.status}.`;
    throw new InternalApiError(`${response.status}: ${message}`, response.status, errorBody?.code);
  }

  return (await response.json()) as TResponse;
}

export function getInternalApiStatus() {
  const baseUrlStatus = getInternalAdminApiBaseUrlStatus();
  const clientDashboardUrlStatus = getClientDashboardUrlStatus();
  return {
    hasBaseUrl: hasInternalAdminApiBaseUrl(),
    baseUrl: hasInternalAdminApiBaseUrl() && baseUrlStatus.valid ? getInternalAdminApiBaseUrl() : null,
    baseUrlStatus,
    clientDashboardUrl: getOptionalClientDashboardUrl(),
    clientDashboardUrlStatus
  };
}

export async function listInternalLocations() {
  return requestInternalApi<InternalLocationListResponse>("/v1/internal/locations");
}

export async function getInternalLocation(locationId: string) {
  return requestInternalApi<InternalLocationSummary>(`/v1/internal/locations/${locationId}`);
}

export async function getInternalLocationPaymentProfile(locationId: string) {
  return requestInternalApi<ClientPaymentProfile>(`/v1/internal/locations/${locationId}/payment-profile`);
}

export async function getInternalLocationReadiness(locationId: string) {
  return requestInternalApi<LaunchReadinessResponse>(`/v1/internal/locations/${locationId}/readiness`);
}

export async function getInternalLocationOnboarding(locationId: string) {
  return requestInternalApi<OnboardingSummary>(`/v1/internal/locations/${locationId}/onboarding`);
}

export async function updateInternalLocationMobileRelease(locationId: string, input: MobileReleaseProfileUpdate) {
  return requestInternalApi<OnboardingSummary>(`/v1/internal/locations/${locationId}/mobile-release`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export async function approveInternalLocationLaunch(locationId: string, input: LaunchApprovalRequest) {
  return requestInternalApi<OnboardingSummary>(`/v1/internal/locations/${locationId}/launch-approval`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function lookupSupportOrders(input: { query: string; locationId?: string; limit?: number }) {
  const params = new URLSearchParams({
    query: input.query,
    limit: String(input.limit ?? 25)
  });
  if (input.locationId) {
    params.set("locationId", input.locationId);
  }

  return requestInternalApi<SupportOrderLookupResponse>(`/v1/internal/support/orders?${params.toString()}`);
}

export async function getInternalLocationOwner(locationId: string) {
  return requestInternalApi<InternalOwnerSummary>(`/v1/internal/locations/${locationId}/owner`);
}

export async function createInternalClient(input: AdminClientCreateRequest) {
  return requestInternalApi<AdminClientCreateResponse>("/v1/internal/clients", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function bootstrapInternalLocation(input: InternalLocationBootstrap) {
  return requestInternalApi<InternalLocationSummary>("/v1/internal/locations/bootstrap", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function provisionLocationOwner(locationId: string, input: InternalOwnerProvisionRequest) {
  return requestInternalApi<InternalOwnerProvisionResponse>(`/v1/internal/locations/${locationId}/owner/provision`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function resendLocationOwnerInvite(locationId: string, input: InternalOwnerInviteRequest) {
  return requestInternalApi<InternalOwnerInviteResponse>(`/v1/internal/locations/${locationId}/owner/invite/resend`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function createStripeOnboardingLink(locationId: string, input: { returnUrl: string; refreshUrl: string }) {
  return requestInternalApi<StripeConnectLinkResponse>(`/v1/internal/locations/${locationId}/stripe/onboarding-link`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function createStripeDashboardLink(locationId: string) {
  return requestInternalApi<StripeConnectLinkResponse>(`/v1/internal/locations/${locationId}/stripe/dashboard-link`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function buildCapabilities(input: {
  menuSource: AppConfigStoreCapabilities["menu"]["source"];
  fulfillmentMode: AppConfigStoreCapabilities["operations"]["fulfillmentMode"];
  liveOrderTrackingEnabled: boolean;
  dashboardEnabled: boolean;
  loyaltyVisible: boolean;
}): AppConfigStoreCapabilities {
  return {
    menu: {
      source: input.menuSource
    },
    operations: {
      fulfillmentMode: input.fulfillmentMode,
      liveOrderTrackingEnabled: input.liveOrderTrackingEnabled,
      dashboardEnabled: input.dashboardEnabled
    },
    loyalty: {
      visible: input.loyaltyVisible
    }
  };
}
