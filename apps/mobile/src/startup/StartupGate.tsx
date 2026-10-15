import { useEffect, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { MOBILE_API_ENVIRONMENT, UNABLE_TO_REACH_BACKEND_MESSAGE, isBackendReachabilityError } from "../api/client";
import { Button, ScreenBackdrop, uiPalette, uiTypography } from "../ui/system";
import { useAppConfigQuery } from "../menu/catalog";
import { useLocationContext } from "../location/LocationProvider";
import { canStartLocationSensitiveQueries } from "../location/model";

export function StartupCatalogGate({
  children,
  onReadyToDisplay
}: {
  children: ReactNode;
  onReadyToDisplay: () => void;
}) {
  const location = useLocationContext();
  const isInitialLoading = location.bootstrapStatus === "loading" || location.isResolvingSelection;
  const canStartLocationSensitiveData = canStartLocationSensitiveQueries(location);

  useEffect(() => {
    if (!isInitialLoading) {
      onReadyToDisplay();
    }
  }, [isInitialLoading, onReadyToDisplay]);

  if (isInitialLoading) {
    return (
      <View style={styles.startupScreen}>
        <ScreenBackdrop />
        <View style={styles.startupCard}>
          <ActivityIndicator color={uiPalette.primary} />
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.startupTitle}>
            Loading store locations
          </Text>
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.startupBody}>
            Connecting to the configured brand before showing the app.
          </Text>
        </View>
      </View>
    );
  }

  let errorMessage: string | null = null;
  let retryDisabled = false;
  if (location.bootstrapStatus === "configuration_error") {
    errorMessage = "This app is not configured correctly. Please contact the app provider.";
    retryDisabled = true;
  } else if (location.bootstrapStatus === "brand_not_found") {
    errorMessage = "This app is not available. Please contact the app provider.";
  } else if (location.bootstrapStatus === "unavailable") {
    errorMessage = "This store is not available for ordering yet. Please try again later.";
  } else if (location.bootstrapStatus === "error") {
    errorMessage =
      location.bootstrapErrorKind === "reachability"
        ? UNABLE_TO_REACH_BACKEND_MESSAGE
        : "Branded app configuration could not be loaded. Retry before continuing.";
  } else if (location.bootstrapStatus === "ready" && !canStartLocationSensitiveData) {
    errorMessage = "Store locations could not be resolved for this app. Retry before continuing.";
  }

  if (errorMessage) {
    return (
      <View style={styles.startupScreen}>
        <ScreenBackdrop />
        <View style={styles.startupCard}>
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.startupEyebrow}>
            Configuration required
          </Text>
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.startupTitle}>
            Store unavailable.
          </Text>
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.startupBody}>
            {errorMessage}
          </Text>
          <Button
            label="Retry"
            variant="secondary"
            disabled={retryDisabled}
            onPress={() => {
              void location.retryBootstrap();
            }}
            style={styles.startupAction}
          />
        </View>
      </View>
    );
  }

  return <StartupAppConfigGate onReadyToDisplay={onReadyToDisplay}>{children}</StartupAppConfigGate>;
}

function StartupAppConfigGate({ children, onReadyToDisplay }: { children: ReactNode; onReadyToDisplay: () => void }) {
  const appConfigQuery = useAppConfigQuery();
  const apiConfigurationError = MOBILE_API_ENVIRONMENT.apiConfigurationError;
  const hasBlockingError = Boolean(apiConfigurationError);
  const liveDataUnavailable = Boolean(appConfigQuery.error && !appConfigQuery.data);
  const isInitialLoading = appConfigQuery.isLoading && !appConfigQuery.data && !apiConfigurationError;
  const errorMessage = apiConfigurationError
    ? "This app is not configured correctly. Please contact the app provider."
    : isBackendReachabilityError(appConfigQuery.error)
      ? UNABLE_TO_REACH_BACKEND_MESSAGE
      : "Live store configuration could not be loaded. Retry before continuing.";

  useEffect(() => {
    if (!isInitialLoading) {
      onReadyToDisplay();
    }
  }, [isInitialLoading, onReadyToDisplay]);

  if (isInitialLoading) {
    return (
      <View style={styles.startupScreen}>
        <ScreenBackdrop />
        <View style={styles.startupCard}>
          <ActivityIndicator color={uiPalette.primary} />
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.startupTitle}>
            Loading live store data
          </Text>
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.startupBody}>
            Connecting to the configured backend before showing the app.
          </Text>
        </View>
      </View>
    );
  }

  if (hasBlockingError) {
    return (
      <View style={styles.startupScreen}>
        <ScreenBackdrop />
        <View style={styles.startupCard}>
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.startupEyebrow}>
            Configuration required
          </Text>
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.startupTitle}>
            App data unavailable.
          </Text>
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.startupBody}>
            {errorMessage}
          </Text>
          <Button
            label="Retry"
            variant="secondary"
            disabled={Boolean(apiConfigurationError)}
            onPress={() => {
              void appConfigQuery.refetch();
            }}
            style={styles.startupAction}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.appContainer}>
      {children}
      {liveDataUnavailable ? (
        <View
          accessible
          accessibilityRole="alert"
          accessibilityLabel="Live store data is unavailable. Some actions may be limited."
          style={styles.liveDataNotice}
        >
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.liveDataNoticeText}>
            Live store data is unavailable. Some actions may be limited.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  appContainer: {
    flex: 1
  },
  startupScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: uiPalette.background
  },
  startupCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: uiPalette.border,
    backgroundColor: uiPalette.surfaceGlass,
    padding: 24,
    gap: 12
  },
  startupEyebrow: {
    color: uiPalette.warning,
    fontFamily: uiTypography.monoFamily,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },
  startupTitle: {
    color: uiPalette.text,
    fontFamily: uiTypography.headerFamily,
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.8
  },
  startupBody: {
    color: uiPalette.textSecondary,
    fontSize: 15,
    lineHeight: 22
  },
  startupAction: {
    marginTop: 8
  },
  liveDataNotice: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 16,
    borderRadius: 14,
    backgroundColor: uiPalette.walnut,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  liveDataNoticeText: {
    color: uiPalette.primaryText,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center"
  }
});
