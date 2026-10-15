import * as Crypto from "expo-crypto";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { AppState, Platform } from "react-native";
import { useEffect, useRef } from "react";
import { usePushTokenRegistrationMutation } from "../account/data";
import { useLocationContext } from "../location/LocationProvider";

Notifications.setNotificationHandler({
  handleNotification: async () => {
    const active = AppState.currentState === "active";
    return {
      shouldShowAlert: !active,
      shouldShowBanner: !active,
      shouldShowList: true,
      shouldPlaySound: !active,
      shouldSetBadge: false
    };
  }
});

const DEVICE_ID_KEY = "lattelink.device_id";

function resolveExpoProjectId() {
  const expoConfigProjectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof expoConfigProjectId === "string" && expoConfigProjectId.trim().length > 0) {
    return expoConfigProjectId;
  }

  const easConfigProjectId = Constants.easConfig?.projectId;
  if (typeof easConfigProjectId === "string" && easConfigProjectId.trim().length > 0) {
    return easConfigProjectId;
  }

  return undefined;
}

async function getOrCreateDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) {
    return existing;
  }
  const id = Crypto.randomUUID();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  return id;
}

export function usePushNotificationRegistration(isAuthenticated: boolean) {
  const mutation = usePushTokenRegistrationMutation();
  const { brandId, isReady } = useLocationContext();
  const registeredBrandRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !isReady || !brandId) {
      registeredBrandRef.current = null;
      return;
    }

    if (registeredBrandRef.current === brandId) {
      return;
    }

    let isCurrent = true;

    async function register() {
      try {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== "granted") {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (!isCurrent || finalStatus !== "granted") {
          return;
        }

        const projectId = resolveExpoProjectId();
        const tokenData = projectId
          ? await Notifications.getExpoPushTokenAsync({ projectId })
          : await Notifications.getExpoPushTokenAsync();
        if (!isCurrent) return;

        const platform = Platform.OS === "ios" ? "ios" : "android";
        const deviceId = await getOrCreateDeviceId();
        if (!isCurrent) return;

        await mutation.mutateAsync({ brandId, deviceId, platform, expoPushToken: tokenData.data });
      } catch {
        // Permission denial, native token failures, and secure-storage errors
        // are expected on simulators and restricted devices. Registration is
        // best effort and must never create an unhandled promise rejection.
        return;
      }
      if (isCurrent) registeredBrandRef.current = brandId;
    }

    void register();
    return () => {
      isCurrent = false;
    };
  }, [brandId, isAuthenticated, isReady, mutation]);
}
