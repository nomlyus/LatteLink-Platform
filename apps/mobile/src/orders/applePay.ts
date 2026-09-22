import Constants from "expo-constants";
import { NativeModules, Platform } from "react-native";
import { resolveDisplayName } from "../brand";
import { extractApplePayWalletPayload, type ApplePayWalletPayload } from "./applePayPayload";

export type { ApplePayWalletPayload } from "./applePayPayload";

type NativeApplePayModule = {
  canMakePayments: (merchantIdentifier: string, supportedNetworks: string[]) => Promise<boolean>;
  requestPayment: (request: {
    amountCents: number;
    currencyCode: string;
    countryCode: string;
    label: string;
    merchantIdentifier: string;
    supportedNetworks: string[];
  }) => Promise<unknown>;
};

const supportedNetworks = ["visa", "masterCard", "amex", "discover"];

function resolveNativeApplePayModule() {
  return (NativeModules as { ApplePayModule?: NativeApplePayModule }).ApplePayModule;
}

function resolveExpoConfiguredMerchantIdentifier() {
  const extra = Constants.expoConfig?.extra as { applePayMerchantIdentifier?: unknown } | undefined;
  const merchantIdentifier =
    typeof extra?.applePayMerchantIdentifier === "string" ? extra.applePayMerchantIdentifier.trim() : "";

  return merchantIdentifier.length > 0 ? merchantIdentifier : undefined;
}

function resolveMerchantIdentifier(value?: string) {
  const merchantIdentifier =
    value?.trim() ?? process.env.EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID?.trim() ?? resolveExpoConfiguredMerchantIdentifier() ?? "";
  return merchantIdentifier.length > 0 ? merchantIdentifier : undefined;
}

export function resolveConfiguredApplePayMerchantIdentifier() {
  return resolveMerchantIdentifier();
}

export function hasNativeApplePayModule() {
  const nativeApplePayModule = resolveNativeApplePayModule();
  return (
    Platform.OS === "ios" &&
    typeof nativeApplePayModule?.canMakePayments === "function" &&
    typeof nativeApplePayModule?.requestPayment === "function"
  );
}

export async function canAttemptNativeApplePay(input: { merchantIdentifier?: string } = {}) {
  const nativeApplePayModule = resolveNativeApplePayModule();
  const merchantIdentifier = resolveMerchantIdentifier(input.merchantIdentifier);

  if (Platform.OS !== "ios" || !nativeApplePayModule || !merchantIdentifier) {
    return false;
  }

  try {
    return await nativeApplePayModule.canMakePayments(merchantIdentifier, supportedNetworks);
  } catch {
    return false;
  }
}

export async function requestNativeApplePayWallet(input: {
  amountCents: number;
  currencyCode?: string;
  countryCode?: string;
  label?: string;
  merchantIdentifier?: string;
}): Promise<ApplePayWalletPayload> {
  const nativeApplePayModule = resolveNativeApplePayModule();
  if (Platform.OS !== "ios" || !nativeApplePayModule) {
    throw new Error("Native Apple Pay module is unavailable in this build.");
  }

  if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) {
    throw new Error("Apple Pay amount must be a positive number.");
  }

  const currencyCode = (input.currencyCode ?? "USD").toUpperCase();
  const countryCode = (input.countryCode ?? "US").toUpperCase();
  const merchantIdentifier = resolveMerchantIdentifier(input.merchantIdentifier);
  if (!merchantIdentifier) {
    throw new Error("Apple Pay merchant configuration is missing.");
  }

  const canMakePayments = await nativeApplePayModule.canMakePayments(merchantIdentifier, supportedNetworks);
  if (!canMakePayments) {
    throw new Error("Apple Pay is not available on this device/account.");
  }

  const paymentResponse = await nativeApplePayModule.requestPayment({
    amountCents: input.amountCents,
    currencyCode,
    countryCode,
    label: resolveDisplayName(input.label, process.env.EXPO_PUBLIC_BRAND_NAME),
    merchantIdentifier,
    supportedNetworks
  });
  const walletPayload = extractApplePayWalletPayload(paymentResponse);

  if (!walletPayload) {
    throw new Error("Unable to extract Apple Pay wallet payload from native response.");
  }

  return walletPayload;
}
