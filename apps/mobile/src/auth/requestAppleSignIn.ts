import * as AppleAuthentication from "expo-apple-authentication";
import { generateAuthNonce } from "./nonce";

export async function requestAppleSignIn() {
  const nonce = generateAuthNonce();
  try {
    const credential = await AppleAuthentication.signInAsync({
      nonce,
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL
      ]
    });
    if (!credential.identityToken || !credential.authorizationCode) {
      throw new Error("Apple did not return sign-in credentials.");
    }
    return { identityToken: credential.identityToken, authorizationCode: credential.authorizationCode, nonce };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ERR_REQUEST_CANCELED") return null;
    throw error;
  }
}
