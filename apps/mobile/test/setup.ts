import { vi } from "vitest";

export const sentryReactNativeMock = {
  captureException: vi.fn(),
  flush: vi.fn(() => Promise.resolve(true)),
  init: vi.fn(),
  setContext: vi.fn(),
  setFingerprint: vi.fn(),
  setLevel: vi.fn(),
  setTag: vi.fn(),
  withScope: vi.fn((callback: (scope: unknown) => void) => {
    callback({
      setContext: sentryReactNativeMock.setContext,
      setFingerprint: sentryReactNativeMock.setFingerprint,
      setLevel: sentryReactNativeMock.setLevel,
      setTag: sentryReactNativeMock.setTag
    });
  }),
  wrap: vi.fn((component: unknown) => component)
};

vi.stubGlobal("__SENTRY_REACT_NATIVE_MOCK__", sentryReactNativeMock);
vi.mock("@sentry/react-native", () => sentryReactNativeMock);
