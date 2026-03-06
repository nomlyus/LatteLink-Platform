import { useEffect, useMemo, useState } from "react";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, Text, TextInput, View } from "react-native";
import { useAppleExchangeMutation, useMagicLinkRequestMutation, useMeQueryMutation } from "../src/auth/useAuth";
import { useAuthSession } from "../src/auth/session";

type ReturnToPath = "/(tabs)/cart" | "/(tabs)/home" | "/(tabs)/account";

export default function AuthScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const { isAuthenticated } = useAuthSession();
  const [identityToken, setIdentityToken] = useState("demo-identity-token");
  const [authorizationCode, setAuthorizationCode] = useState("demo-auth-code");
  const [nonce, setNonce] = useState("mobile-auth");
  const [email, setEmail] = useState("owner@gazellecoffee.com");

  const appleExchange = useAppleExchangeMutation();
  const magicLinkRequest = useMagicLinkRequestMutation();
  const meQuery = useMeQueryMutation();
  const returnTo = useMemo<ReturnToPath | null>(() => {
    if (params.returnTo === "/(tabs)/cart") {
      return "/(tabs)/cart";
    }
    if (params.returnTo === "/(tabs)/home") {
      return "/(tabs)/home";
    }
    if (params.returnTo === "/(tabs)/account") {
      return "/(tabs)/account";
    }

    return null;
  }, [params.returnTo]);

  useEffect(() => {
    if (isAuthenticated && returnTo) {
      router.replace(returnTo);
    }
  }, [isAuthenticated, returnTo, router]);

  return (
    <View className="flex-1 bg-background px-6 pt-20">
      <Text className="text-[34px] font-semibold text-foreground">Auth Flows</Text>
      <Text className="mt-2 text-sm text-foreground/70">Apple, magic link, and profile fetch wiring.</Text>

      <Text className="mt-8 text-xs uppercase tracking-[1.5px] text-foreground/70">Apple Sign In</Text>
      <TextInput
        value={identityToken}
        onChangeText={setIdentityToken}
        autoCapitalize="none"
        className="mt-2 rounded-xl border border-foreground/20 bg-white px-4 py-3 text-foreground"
        placeholder="Identity token"
      />
      <TextInput
        value={authorizationCode}
        onChangeText={setAuthorizationCode}
        autoCapitalize="none"
        className="mt-3 rounded-xl border border-foreground/20 bg-white px-4 py-3 text-foreground"
        placeholder="Authorization code"
      />
      <TextInput
        value={nonce}
        onChangeText={setNonce}
        autoCapitalize="none"
        className="mt-3 rounded-xl border border-foreground/20 bg-white px-4 py-3 text-foreground"
        placeholder="Nonce"
      />

      <Pressable
        className="mt-4 rounded-full bg-foreground px-6 py-4"
        onPress={() => appleExchange.mutate({ identityToken, authorizationCode, nonce })}
      >
        <Text className="text-center text-xs font-semibold uppercase tracking-[2px] text-background">
          Run Apple Exchange
        </Text>
      </Pressable>

      <Text className="mt-2 text-xs text-foreground/70">
        {appleExchange.data ? `Session user: ${appleExchange.data.userId}` : appleExchange.error?.message ?? ""}
      </Text>

      <Text className="mt-8 text-xs uppercase tracking-[1.5px] text-foreground/70">Magic Link</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        className="mt-2 rounded-xl border border-foreground/20 bg-white px-4 py-3 text-foreground"
        placeholder="Email"
      />
      <Pressable className="mt-4 rounded-full border border-foreground px-6 py-4" onPress={() => magicLinkRequest.mutate({ email })}>
        <Text className="text-center text-xs font-semibold uppercase tracking-[2px] text-foreground">Send Magic Link</Text>
      </Pressable>

      <Pressable className="mt-3 rounded-full border border-foreground px-6 py-4" onPress={() => meQuery.mutate()}>
        <Text className="text-center text-xs font-semibold uppercase tracking-[2px] text-foreground">Fetch /auth/me</Text>
      </Pressable>

      <Text className="mt-2 text-xs text-foreground/70">
        {magicLinkRequest.error?.message ?? meQuery.error?.message ?? meQuery.data?.email ?? ""}
      </Text>

      <Link href="/" asChild>
        <Pressable className="mt-10 self-start">
          <Text className="text-sm text-foreground underline">Back to home</Text>
        </Pressable>
      </Link>
    </View>
  );
}
