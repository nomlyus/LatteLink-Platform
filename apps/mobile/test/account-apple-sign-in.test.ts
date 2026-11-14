import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestAppleSignIn } from "../src/auth/requestAppleSignIn";
import { useAppleSignIn } from "../src/auth/useAppleSignIn";
import { useAccountSignInCompletion } from "../src/account/useAccountSignInCompletion";
import { AccountAppleSignIn } from "../src/account/AccountAppleSignIn";

const runtime = vi.hoisted(() => ({
  nativeSignIn: vi.fn(), available: vi.fn(), exchange: vi.fn(), reset: vi.fn(), push: vi.fn(), replace: vi.fn(),
  states: [] as unknown[], refs: [] as { current: unknown }[], stateIndex: 0, refIndex: 0,
  effects: [] as (() => void | (() => void))[],
  ownership: "standalone", configurationError: undefined as string | undefined,
  authenticated: true, hydrating: false, deferred: false, platform: "ios", dark: false
}));
vi.stubGlobal("React", React);
vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  useState: (initial: unknown) => {
    const index = runtime.stateIndex++;
    if (!(index in runtime.states)) runtime.states[index] = initial;
    return [runtime.states[index], (value: unknown) => { runtime.states[index] = value; }];
  },
  useRef: (initial: unknown) => {
    const index = runtime.refIndex++;
    return runtime.refs[index] ?? (runtime.refs[index] = { current: initial });
  },
  useEffect: (effect: () => void | (() => void)) => { runtime.effects.push(effect); }
}));
vi.mock("expo-apple-authentication", () => ({
  signInAsync: (options: unknown) => runtime.nativeSignIn(options),
  isAvailableAsync: () => runtime.available(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  AppleAuthenticationButton: "AppleButton",
  AppleAuthenticationButtonType: { SIGN_IN: 0 },
  AppleAuthenticationButtonStyle: { BLACK: 2, WHITE: 0 }
}));
vi.mock("expo-constants", () => ({ default: { get appOwnership() { return runtime.ownership; } }, AppOwnership: { Expo: "expo" } }));
vi.mock("../src/auth/nonce", () => ({ generateAuthNonce: () => "test-nonce" }));
vi.mock("../src/auth/useAuth", () => ({ useAppleExchangeMutation: () => ({ mutateAsync: runtime.exchange, reset: runtime.reset }) }));
vi.mock("../src/api/client", () => ({ MOBILE_API_ENVIRONMENT: { get apiConfigurationError() { return runtime.configurationError; } } }));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: runtime.push, replace: runtime.replace }) }));
vi.mock("../src/auth/session", () => ({
  useAuthSession: () => ({ isAuthenticated: runtime.authenticated, isHydrating: runtime.hydrating, profileSetupDeferred: runtime.deferred })
}));
vi.mock("../src/auth/profile", () => ({ isCustomerProfileComplete: (profile?: { profileCompleted: boolean }) => Boolean(profile?.profileCompleted) }));
vi.mock("react-native", () => ({
  View: "View", Text: "Text", ActivityIndicator: "ActivityIndicator", StyleSheet: { create: (styles: unknown) => styles },
  useColorScheme: () => runtime.dark ? "dark" : "light",
  Platform: { get OS() { return runtime.platform; } }
}));
vi.mock("../src/ui/system", () => ({ Button: "Button", uiPalette: { danger: "#B45B4F" } }));

function renderHook() {
  runtime.stateIndex = 0;
  runtime.refIndex = 0;
  runtime.effects = [];
  return useAppleSignIn();
}
async function mountSignIn() {
  renderHook();
  const dispose = runtime.effects[0]();
  await Promise.resolve();
  return { ...renderHook(), dispose };
}
function completion(input: Partial<Parameters<typeof useAccountSignInCompletion>[0]> = {}) {
  runtime.refIndex = 0;
  runtime.effects = [];
  useAccountSignInCompletion({ didSignIn: true, profile: undefined, isPending: false, isSuccess: true, isError: false, ...input });
  runtime.effects[0]();
}

beforeEach(() => {
  Object.assign(runtime, {
    states: [], refs: [], stateIndex: 0, refIndex: 0, effects: [], ownership: "standalone",
    configurationError: undefined, authenticated: true, hydrating: false, deferred: false, platform: "ios", dark: false
  });
  vi.clearAllMocks();
  runtime.available.mockResolvedValue(true);
  runtime.nativeSignIn.mockResolvedValue({ identityToken: "test-identity", authorizationCode: "test-code" });
  runtime.exchange.mockResolvedValue(undefined);
});

describe("shared native Apple request", () => {
  it("keeps nonce and scopes tied to the returned exchange credentials", async () => {
    await expect(requestAppleSignIn()).resolves.toEqual({ identityToken: "test-identity", authorizationCode: "test-code", nonce: "test-nonce" });
    expect(runtime.nativeSignIn).toHaveBeenCalledWith({ nonce: "test-nonce", requestedScopes: [0, 1] });
  });
  it("treats cancellation as cancellation, not an exchange", async () => {
    runtime.nativeSignIn.mockRejectedValue({ code: "ERR_REQUEST_CANCELED" });
    await expect(requestAppleSignIn()).resolves.toBeNull();
  });
  it("rejects incomplete Apple credentials", async () => {
    runtime.nativeSignIn.mockResolvedValue({ identityToken: null, authorizationCode: null });
    await expect(requestAppleSignIn()).rejects.toThrow("Apple did not return sign-in credentials.");
  });
});

describe("inline Apple authentication", () => {
  it("completes the existing exchange without navigating to the auth modal", async () => {
    const auth = await mountSignIn();
    await auth.signIn();
    expect(runtime.exchange).toHaveBeenCalledWith({ identityToken: "test-identity", authorizationCode: "test-code", nonce: "test-nonce" });
    expect(renderHook().didSignIn).toBe(true);
    expect(runtime.push).not.toHaveBeenCalled();
  });
  it("prevents duplicate submissions while the native dialog is pending", async () => {
    let finish: (credentials: object) => void = () => {};
    runtime.nativeSignIn.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const auth = await mountSignIn();
    const first = auth.signIn();
    await auth.signIn();
    expect(runtime.nativeSignIn).toHaveBeenCalledTimes(1);
    expect(renderHook().pending).toBe(true);
    finish({ identityToken: "test-identity", authorizationCode: "test-code" });
    await first;
    expect(runtime.exchange).toHaveBeenCalledTimes(1);
  });
  it("allows retry after a failed exchange and keeps cancellation silent", async () => {
    const auth = await mountSignIn();
    runtime.exchange.mockRejectedValueOnce(new Error("APPLE_TOKEN_EXCHANGE_FAILED"));
    await auth.signIn();
    expect(renderHook().error).toContain("could not finish exchanging credentials");
    await renderHook().signIn();
    expect(renderHook().error).toBeNull();
    expect(renderHook().didSignIn).toBe(true);
    runtime.nativeSignIn.mockRejectedValueOnce({ code: "ERR_REQUEST_CANCELED" });
    await renderHook().signIn();
    expect(renderHook().error).toBeNull();
    expect(runtime.exchange).toHaveBeenCalledTimes(2);
  });
  it("does not exchange a native result after the Account sheet unmounts", async () => {
    let finish: (credentials: object) => void = () => {};
    runtime.nativeSignIn.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const auth = await mountSignIn();
    const pending = auth.signIn();
    if (typeof auth.dispose === "function") auth.dispose();
    finish({ identityToken: "test-identity", authorizationCode: "test-code" });
    await pending;
    expect(runtime.exchange).not.toHaveBeenCalled();
  });
  it("blocks sign-in for invalid API configuration or Expo Go", async () => {
    const auth = await mountSignIn();
    runtime.configurationError = "API unavailable";
    await renderHook().signIn();
    expect(runtime.nativeSignIn).not.toHaveBeenCalled();
    runtime.configurationError = undefined;
    runtime.ownership = "expo";
    const expo = await mountSignIn();
    expect(expo.available).toBe(false);
    await expo.signIn();
    expect(runtime.nativeSignIn).not.toHaveBeenCalled();
    expect(auth.available).toBe(true);
  });
  it("waits for persisted session restoration before starting another sign-in", async () => {
    await mountSignIn();
    runtime.hydrating = true;
    const auth = renderHook();
    expect(auth.pending).toBe(true);
    await auth.signIn();
    expect(runtime.nativeSignIn).not.toHaveBeenCalled();
  });
});

describe("profile continuation after Account sign-in", () => {
  it("returns a signed-in customer to Cart only after profile checks finish", () => {
    const onComplete = vi.fn();
    completion({ returnTo: "cart", onComplete, profile: { userId: "test-user", methods: ["apple"], profileCompleted: true } });
    completion({ returnTo: "cart", onComplete, profile: { userId: "test-user", methods: ["apple"], profileCompleted: true } });
    expect(onComplete).toHaveBeenCalledOnce();
    expect(runtime.push).not.toHaveBeenCalled();
  });
  it("preserves Cart as the destination after required profile setup", () => {
    const onComplete = vi.fn();
    completion({ returnTo: "cart", onComplete });
    expect(runtime.replace).toHaveBeenCalledWith({ pathname: "/profile-setup", params: { returnTo: "cart" } });
    expect(onComplete).not.toHaveBeenCalled();
  });
  it("opens existing profile setup only once for a newly authenticated incomplete profile", () => {
    completion();
    completion();
    expect(runtime.push).toHaveBeenCalledTimes(1);
    expect(runtime.push).toHaveBeenCalledWith({ pathname: "/profile-setup", params: { returnTo: "/(tabs)/account" } });
  });
  it("leaves returning customers in Account without another modal", () => {
    completion({ profile: { userId: "test-user", methods: ["apple"], profileCompleted: true } });
    expect(runtime.push).not.toHaveBeenCalled();
  });
  it("waits for profile loading and respects existing profile deferral", () => {
    completion({ isPending: true });
    expect(runtime.push).not.toHaveBeenCalled();
    runtime.deferred = true;
    completion();
    expect(runtime.push).not.toHaveBeenCalled();
  });
  it("does not redirect an existing session, signed-out session, or hydrating session", () => {
    completion({ didSignIn: false });
    runtime.authenticated = false;
    completion();
    runtime.authenticated = true;
    runtime.hydrating = true;
    completion();
    expect(runtime.push).not.toHaveBeenCalled();
  });
  it("retains the existing setup fallback when the profile cannot load", () => {
    completion({ isError: true, isSuccess: false });
    expect(runtime.push).toHaveBeenCalledTimes(1);
  });
});

describe("Account Apple button", () => {
  it.each([false, true])("adapts the native sign-in button and pending indicator to dark=%s", (dark) => {
    runtime.dark = dark;
    const signIn = { available: true, pending: true, error: null, didSignIn: false, signIn: vi.fn() };
    const panel = AccountAppleSignIn({ signIn, onAlternativeSignIn: vi.fn() });
    const [button, indicator] = panel.props.children[1].props.children;
    expect(button.props.buttonStyle).toBe(dark ? 0 : 2);
    expect(indicator.props.color).toBe(dark ? "black" : "white");
  });
  it("renders the native Apple button at the existing footer height and invokes sign-in directly", () => {
    const signIn = { available: true, pending: false, error: null, didSignIn: false, signIn: vi.fn() };
    const fallback = vi.fn();
    const panel = AccountAppleSignIn({ signIn, onAlternativeSignIn: fallback });
    const button = panel.props.children[1].props.children[0];
    expect(button.type).toBe("AppleButton");
    expect(button.props.style).toMatchObject({ width: "100%", height: 56 });
    button.props.onPress();
    expect(signIn.signIn).toHaveBeenCalledTimes(1);
    expect(fallback).not.toHaveBeenCalled();
  });
  it("allows error retry and blocks touch interaction only while pending", () => {
    const signIn = { available: true, pending: false, error: "Try again", didSignIn: false, signIn: vi.fn() };
    const panel = AccountAppleSignIn({ signIn, onAlternativeSignIn: vi.fn() });
    expect(panel.props.children[0].props.accessibilityRole).toBe("alert");
    expect(panel.props.children[1].props.pointerEvents).toBe("auto");
    const pending = AccountAppleSignIn({ signIn: { ...signIn, pending: true }, onAlternativeSignIn: vi.fn() });
    expect(pending.props.children[1].props.pointerEvents).toBe("none");
  });
});
