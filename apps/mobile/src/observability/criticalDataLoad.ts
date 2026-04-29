import * as Sentry from "@sentry/react-native";

type CriticalDataLoadFeature = "home" | "menu" | "account" | "rewards_activity" | "startup";

type CaptureCriticalDataLoadFailureInput = {
  feature: CriticalDataLoadFeature;
  operation: string;
  endpoint: string;
  apiBaseUrl: string;
  locationId: string;
  error: unknown;
};

const criticalDataLoadThrottleMs = 5 * 60 * 1000;
const lastCapturedAtByKey = new Map<string, number>();

function normalizeApiHost(apiBaseUrl: string) {
  try {
    return new URL(apiBaseUrl).host;
  } catch {
    return "unconfigured";
  }
}

function normalizeError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

export function extractApiFailureMetadata(error: unknown) {
  const normalizedError = normalizeError(error);
  const status = /Request failed \((\d{3})\)/.exec(normalizedError.message)?.[1];
  const jsonPayload = normalizedError.message.includes(": ") ? normalizedError.message.split(": ").slice(1).join(": ") : "";
  let code: string | undefined;

  if (jsonPayload) {
    try {
      const parsed = JSON.parse(jsonPayload) as { code?: unknown };
      code = typeof parsed.code === "string" ? parsed.code : undefined;
    } catch {
      code = undefined;
    }
  }

  return {
    message: normalizedError.message,
    status,
    code
  };
}

export function captureCriticalDataLoadFailure(input: CaptureCriticalDataLoadFailureInput) {
  const metadata = extractApiFailureMetadata(input.error);
  const apiHost = normalizeApiHost(input.apiBaseUrl);
  const throttleKey = [
    input.feature,
    input.operation,
    input.endpoint,
    apiHost,
    input.locationId || "missing-location",
    metadata.status ?? "no-status",
    metadata.code ?? metadata.message
  ].join("|");
  const now = Date.now();
  const lastCapturedAt = lastCapturedAtByKey.get(throttleKey);
  if (lastCapturedAt && now - lastCapturedAt < criticalDataLoadThrottleMs) {
    return;
  }
  lastCapturedAtByKey.set(throttleKey, now);

  const normalizedError = normalizeError(input.error);
  Sentry.withScope((scope) => {
    scope.setLevel(metadata.status && Number(metadata.status) < 500 ? "warning" : "error");
    scope.setTag("feature", input.feature);
    scope.setTag("operation", input.operation);
    scope.setTag("endpoint", input.endpoint);
    scope.setTag("apiHost", apiHost);
    scope.setTag("locationId", input.locationId || "missing");

    if (metadata.status) {
      scope.setTag("httpStatus", metadata.status);
    }
    if (metadata.code) {
      scope.setTag("apiErrorCode", metadata.code);
    }

    scope.setContext("critical_data_load", {
      feature: input.feature,
      operation: input.operation,
      endpoint: input.endpoint,
      apiHost,
      locationId: input.locationId || "missing",
      httpStatus: metadata.status,
      apiErrorCode: metadata.code
    });
    scope.setFingerprint(["mobile-critical-data-load", input.feature, input.operation, metadata.status ?? "no-status"]);
    Sentry.captureException(normalizedError);
  });
}

export async function withCriticalDataLoadSentry<T>(
  input: Omit<CaptureCriticalDataLoadFailureInput, "error">,
  load: () => Promise<T>
) {
  try {
    return await load();
  } catch (error) {
    captureCriticalDataLoadFailure({
      ...input,
      error
    });
    throw error;
  }
}
