import * as AppleAuthentication from "expo-apple-authentication";
import { ActivityIndicator, Platform, StyleSheet, Text, View, useColorScheme } from "react-native";
import type { useAppleSignIn } from "../auth/useAppleSignIn";
import { Button, uiPalette } from "../ui/system";

export function AccountAppleSignIn({
  signIn, onAlternativeSignIn
}: { signIn: ReturnType<typeof useAppleSignIn>; onAlternativeSignIn: () => void }) {
  const dark = useColorScheme() === "dark";
  return (
    <View style={styles.container}>
      {signIn.error ? (
        <Text allowFontScaling={false} maxFontSizeMultiplier={1} accessibilityRole="alert" style={styles.error}>
          {signIn.error}
        </Text>
      ) : null}
      {signIn.available ? (
        <View
          pointerEvents={signIn.pending ? "none" : "auto"}
          accessibilityState={{ busy: signIn.pending }}
        >
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={dark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={28}
            style={styles.button}
            onPress={() => { void signIn.signIn(); }}
          />
          {signIn.pending ? <ActivityIndicator accessibilityLabel="Signing in" color={dark ? "black" : "white"} style={styles.pending} /> : null}
        </View>
      ) : (
        <Button
          label={signIn.available === null ? "Checking Apple sign-in…" : Platform.OS === "ios" ? "Apple sign-in unavailable" : "Sign in"}
          disabled={signIn.available === null || Platform.OS === "ios"}
          onPress={onAlternativeSignIn}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  button: { width: "100%", height: 56 },
  pending: { position: "absolute", right: 18, top: 18 },
  error: { color: uiPalette.danger, fontSize: 13, lineHeight: 18 }
});
