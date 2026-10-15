export type ReturnToPath = "cart" | "/(tabs)/home" | "/(tabs)/orders" | "/(tabs)/account";

export function resolveReturnToPath(input: string | string[] | undefined): ReturnToPath | null {
  if (Array.isArray(input)) return resolveReturnToPath(input[0]);
  if (input === "cart" || input === "/(tabs)/home" || input === "/(tabs)/orders" || input === "/(tabs)/account") {
    return input;
  }
  return null;
}

export function formatExpiresAt(expiresAt: string): string {
  const date = new Date(expiresAt);
  return Number.isNaN(date.getTime()) ? expiresAt : date.toLocaleString();
}

export function getReturnLabel(returnTo: ReturnToPath | null) {
  switch (returnTo) {
    case "cart":
      return "Return to Checkout";
    case "/(tabs)/orders":
      return "Return to Orders";
    case "/(tabs)/account":
      return "Return to Account";
    case "/(tabs)/home":
      return "Return Home";
    default:
      return "Continue";
  }
}

export function extractApiErrorDetails(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : "";
  if (!rawMessage) {
    return null;
  }

  const jsonStart = rawMessage.indexOf("{");
  if (jsonStart < 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawMessage.slice(jsonStart)) as {
      code?: string;
      message?: string;
      requestId?: string;
    };
    if (!parsed.code && !parsed.message) {
      return null;
    }

    return {
      code: parsed.code?.trim(),
      message: parsed.message?.trim(),
      requestId: parsed.requestId?.trim()
    };
  } catch {
    return null;
  }
}

export function resolveAppleSignInErrorMessage(error: unknown) {
  const apiError = extractApiErrorDetails(error);
  const message = error instanceof Error ? error.message : "";

  if (message.includes("APPLE_SIGN_IN_NOT_CONFIGURED")) {
    return "Apple Sign In is not configured on the backend for this environment.";
  }

  if (message.includes("INVALID_APPLE_IDENTITY")) {
    return "Apple could not verify this sign-in response. Try again.";
  }

  if (message.includes("APPLE_TOKEN_EXCHANGE_FAILED")) {
    return "Apple Sign In could not finish exchanging credentials. Use a development build or TestFlight instead of Expo Go.";
  }

  if (apiError?.code || apiError?.message) {
    const segments = [apiError.code, apiError.message].filter(Boolean);
    const details = segments.join(": ");
    return apiError.requestId ? `${details} (request ${apiError.requestId})` : details;
  }

  return "Apple Sign In could not complete right now. Try again in a moment.";
}

export function resolveDevAccessErrorMessage(error: unknown) {
  const apiError = extractApiErrorDetails(error);
  const message = error instanceof Error ? error.message : "";

  if (message.includes("DEV_CUSTOMER_ACCESS_DISABLED")) {
    return "Dev sign in is disabled on the backend for this environment.";
  }

  if (apiError?.code || apiError?.message) {
    const segments = [apiError.code, apiError.message].filter(Boolean);
    const details = segments.join(": ");
    return apiError.requestId ? `${details} (request ${apiError.requestId})` : details;
  }

  return "Dev sign in could not complete right now. Try again in a moment.";
}
