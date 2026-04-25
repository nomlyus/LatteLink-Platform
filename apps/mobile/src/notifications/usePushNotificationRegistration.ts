import * as Crypto from "expo-crypto";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { AppState, Platform } from "react-native";
import { useEffect, useRef } from "react";
import { usePushTokenRegistrationMutation } from "../account/data";

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
  const registeredRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || registeredRef.current) {
      return;
    }

    async function register() {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== "granted") {
        return;
      }

      let tokenData: Notifications.ExpoPushToken;
      try {
        tokenData = await Notifications.getExpoPushTokenAsync();
      } catch {
        return;
      }

      const platform = Platform.OS === "ios" ? "ios" : "android";
      const deviceId = await getOrCreateDeviceId();

      mutation.mutate({ deviceId, platform, expoPushToken: tokenData.data });
      registeredRef.current = true;
    }

    void register();
  }, [isAuthenticated, mutation]);
}
