import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { isCustomerProfileComplete, type CustomerProfile } from "../auth/profile";
import { useAuthSession } from "../auth/session";
import type { ReturnToPath } from "../auth/presentation";

export function useAccountSignInCompletion({
  didSignIn, profile, isPending, isSuccess, isError, returnTo = "/(tabs)/account", onComplete
}: {
  didSignIn: boolean;
  profile: CustomerProfile | undefined;
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  returnTo?: ReturnToPath;
  onComplete?: () => void;
}) {
  const { isAuthenticated, isHydrating, profileSetupDeferred } = useAuthSession();
  const router = useRouter();
  const handled = useRef(false);

  useEffect(() => {
    if (!didSignIn) { handled.current = false; return; }
    if (!isAuthenticated || isHydrating || isPending || handled.current) return;
    if (!isSuccess && !isError) return;
    handled.current = true;
    // Match the existing auth route: incomplete/unavailable profiles enter setup;
    // returning customers stay in the Account sheet instead of opening another auth modal.
    if (isError || (!isCustomerProfileComplete(profile) && !profileSetupDeferred)) {
      if (returnTo === "cart") router.replace({ pathname: "/profile-setup", params: { returnTo } });
      else router.push({ pathname: "/profile-setup", params: { returnTo } });
    } else {
      onComplete?.();
    }
  }, [didSignIn, isAuthenticated, isHydrating, isPending, isSuccess, isError, profile, profileSetupDeferred, router, returnTo, onComplete]);
}
