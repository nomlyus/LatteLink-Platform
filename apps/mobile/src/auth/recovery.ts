export type AuthRecoveryState = "idle" | "expired";

type RecoveryCopy = {
  title: string;
  body: string;
  actionLabel: string;
};

function withBrandSuffix(brandName: string) {
  return brandName ? ` at ${brandName}` : "";
}

export function getAuthScreenRecoveryCopy(state: AuthRecoveryState): RecoveryCopy {
  if (state === "expired") {
    return {
      title: "Session expired.",
      body: "Sign in again to restore your orders, rewards, and checkout access on this device.",
      actionLabel: "Sign In Again"
    };
  }

  return {
    title: "Sign in.",
    body: "Use the button below to get back into your account quickly.",
    actionLabel: "Sign In"
  };
}

export function getAccountRecoveryCopy(state: AuthRecoveryState, brandName: string): RecoveryCopy {
  if (state === "expired") {
    return {
      title: "Your session expired.",
      body: `Sign in again to see your rewards and orders${withBrandSuffix(brandName)}.`,
      actionLabel: "Sign In Again"
    };
  }

  return {
    title: "Keep every visit in one account.",
    body: "Sign in to collect points, enjoy rewards, and view your past orders.",
    actionLabel: "Sign In"
  };
}

export function getOrdersRecoveryCopy(state: AuthRecoveryState): RecoveryCopy {
  if (state === "expired") {
    return {
      title: "Your session expired.",
      body: "Sign in again to restore live status, pickup codes, and previous receipts.",
      actionLabel: "Sign In Again"
    };
  }

  return {
    title: "Track pickup and revisit past orders.",
    body: "Sign in to keep live status, pickup codes, and previous receipts attached to one account every time you come back.",
    actionLabel: "Sign In"
  };
}

export function getSettingsRecoveryCopy(state: AuthRecoveryState): RecoveryCopy {
  if (state === "expired") {
    return {
      title: "Your session expired.",
      body: "Sign in again to manage account settings and sign-out controls.",
      actionLabel: "Sign In Again"
    };
  }

  return {
    title: "Sign in to manage settings.",
    body: "Account settings and sign-out controls appear here once you are signed in.",
    actionLabel: "Sign In"
  };
}

export function getSessionRecoveryCopy(state: AuthRecoveryState): RecoveryCopy {
  if (state === "expired") {
    return {
      title: "Your session expired.",
      body: "Sign in again to restore secure session details for this account.",
      actionLabel: "Sign In Again"
    };
  }

  return {
    title: "Sign in to view session details.",
    body: "Session state appears here for authenticated users.",
    actionLabel: "Sign In"
  };
}

export function getCheckoutRecoveryActionLabel(state: AuthRecoveryState) {
  return state === "expired" ? "Sign In Again to Checkout" : "Sign In to Checkout";
}
