import { Pressable, Text, View } from "react-native";
import { useState } from "react";
import { Link } from "expo-router";
import { colorTokens } from "@gazelle/design-tokens";
import { API_BASE_URL, apiClient } from "../../src/api/client";

export default function HomeScreen() {
  const [gatewayStatus, setGatewayStatus] = useState<string>("");

  return (
    <View className="flex-1 bg-background px-6 pt-16">
      <Text className="text-[42px] font-semibold text-foreground">Gazelle.</Text>
      <Text className="mt-4 text-base leading-7 text-foreground/80">
        Order quickly with modern auth, menu browsing, cart, and checkout.
      </Text>

      <Link href="/(tabs)/menu" asChild>
        <Pressable className="mt-8 rounded-full bg-foreground px-6 py-4">
          <Text className="text-center text-xs font-semibold uppercase tracking-[2px] text-background">
            Start Order
          </Text>
        </Pressable>
      </Link>

      <Pressable
        className="mt-3 rounded-full border border-foreground px-6 py-4"
        onPress={async () => {
          setGatewayStatus("Checking gateway...");
          try {
            await apiClient.get("/meta/contracts");
            setGatewayStatus("Gateway is reachable.");
          } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            setGatewayStatus(`Gateway failed (${API_BASE_URL}): ${message}`);
          }
        }}
      >
        <Text className="text-center text-xs font-semibold uppercase tracking-[2px] text-foreground">
          Test Gateway
        </Text>
      </Pressable>

      {gatewayStatus ? <Text className="mt-2 text-xs text-foreground/70">{gatewayStatus}</Text> : null}

      <Link href="/auth" asChild>
        <Pressable className="mt-3 rounded-full border border-foreground px-6 py-4">
          <Text className="text-center text-xs font-semibold uppercase tracking-[2px] text-foreground">
            Open Auth Flows
          </Text>
        </Pressable>
      </Link>

      <Text className="mt-8 text-sm text-foreground/60">Palette anchor: {colorTokens.beigeLight}</Text>
    </View>
  );
}
