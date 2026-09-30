import { z } from "zod";
import {
  appConfigSchema,
  mobileReleaseBuildJobListResponseSchema,
  onboardingSummarySchema,
  operatorAppIdentityProfileUpdateSchema,
  operatorOnboardingUpdateSchema,
  stripeConnectDashboardLinkRequestSchema,
  stripeConnectLinkResponseSchema,
  stripeConnectOnboardingLinkRequestSchema,
  stripeConnectStatusRefreshRequestSchema,
  stripeConnectStatusRefreshResponseSchema
} from "@lattelink/contracts-catalog";
import { requestJson, type OperatorSession } from "../../api";

export type OperatorOnboardingSummary = z.output<typeof onboardingSummarySchema>;
export type OperatorOnboardingUpdate = z.input<typeof operatorOnboardingUpdateSchema>;
export type OperatorAppIdentityUpdate = z.input<typeof operatorAppIdentityProfileUpdateSchema>;
export type OperatorOnboardingBuildJobs = z.output<typeof mobileReleaseBuildJobListResponseSchema>;
export type OperatorOnboardingAppConfig = z.output<typeof appConfigSchema>;

export function fetchOperatorOnboardingSummary(session: OperatorSession, locationId: string, signal?: AbortSignal) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: "/admin/onboarding",
    query: { locationId },
    signal,
    schema: onboardingSummarySchema
  });
}

export function fetchOperatorOnboardingAppConfig(session: OperatorSession, locationId: string, signal?: AbortSignal) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: "/admin/app-config",
    query: { locationId },
    signal,
    schema: appConfigSchema
  });
}

export function fetchOperatorOnboardingBuildJobs(session: OperatorSession, locationId: string, signal?: AbortSignal) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: "/admin/mobile-release/build-jobs",
    query: { locationId },
    signal,
    schema: mobileReleaseBuildJobListResponseSchema
  });
}

export function updateOperatorOnboarding(
  session: OperatorSession,
  locationId: string,
  input: OperatorOnboardingUpdate
) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: "/admin/onboarding",
    query: { locationId },
    method: "PATCH",
    body: operatorOnboardingUpdateSchema.parse(input),
    schema: onboardingSummarySchema
  });
}

export function updateOperatorAppIdentity(
  session: OperatorSession,
  locationId: string,
  input: OperatorAppIdentityUpdate
) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: "/admin/app-identity",
    query: { locationId },
    method: "PATCH",
    body: operatorAppIdentityProfileUpdateSchema.parse(input),
    schema: onboardingSummarySchema
  });
}

export function submitOperatorOnboardingReview(session: OperatorSession, locationId: string) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: "/admin/onboarding/submit-review",
    query: { locationId },
    method: "POST",
    body: {},
    schema: onboardingSummarySchema
  });
}

export function createOperatorStripeOnboardingLink(
  session: OperatorSession,
  locationId: string,
  input: Omit<z.input<typeof stripeConnectOnboardingLinkRequestSchema>, "locationId">
) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: "/admin/payments/stripe/onboarding-link",
    query: { locationId },
    method: "POST",
    body: stripeConnectOnboardingLinkRequestSchema.omit({ locationId: true }).parse(input),
    schema: stripeConnectLinkResponseSchema
  });
}

export function createOperatorStripeDashboardLink(session: OperatorSession, locationId: string) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: "/admin/payments/stripe/dashboard-link",
    query: { locationId },
    method: "POST",
    body: stripeConnectDashboardLinkRequestSchema.omit({ locationId: true }).parse({}),
    schema: stripeConnectLinkResponseSchema
  });
}

export function refreshOperatorStripeStatus(session: OperatorSession, locationId: string) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: "/admin/payments/stripe/status-refresh",
    query: { locationId },
    method: "POST",
    body: stripeConnectStatusRefreshRequestSchema.omit({ locationId: true }).parse({}),
    schema: stripeConnectStatusRefreshResponseSchema
  });
}
