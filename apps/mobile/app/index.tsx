import { Pressable, Text, View } from "react-native";
import { useMemo } from "react";
import { Link } from "expo-router";
import { GazelleApiClient } from "@gazelle/sdk-mobile";
import { colorTokens } from "@gazelle/design-tokens";

export default function HomeScreen() {
  const client = useMemo(() => new GazelleApiClient({ baseUrl: "https://api.gazellecoffee.com/v1" }), []);

  return (
    <View className="flex-1 bg-background px-6 pt-24">
      <Text className="text-[42px] font-semibold text-foreground">Gazelle.</Text>
      <Text className="mt-4 text-base leading-7 text-foreground/80">
        Mobile ordering foundation is live. Next: auth, menu, cart, and checkout flows.
      </Text>

      <Pressable
        className="mt-10 rounded-full bg-foreground px-6 py-4"
        onPress={async () => {
          await client.get("/health");
        }}
      >
        <Text className="text-center text-xs font-semibold uppercase tracking-[2px] text-background">
          Test Gateway
        </Text>
      </Pressable>

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
