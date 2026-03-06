import { Pressable, Text, View } from "react-native";
import { Link, useRouter } from "expo-router";
import { useAuthSession } from "../../src/auth/session";

export default function AccountScreen() {
  const router = useRouter();
  const { isAuthenticated, session, signOut } = useAuthSession();

  if (!isAuthenticated) {
    return (
      <View className="flex-1 bg-background px-6 pt-20">
        <Text className="text-[34px] font-semibold text-foreground">Account</Text>
        <View className="mt-6 rounded-2xl border border-foreground/15 bg-white px-5 py-5">
          <Text className="text-sm text-foreground/70">Sign in to access profile, points, and order history.</Text>
          <Link href={{ pathname: "/auth", params: { returnTo: "/(tabs)/account" } }} asChild>
            <Pressable className="mt-4 self-start rounded-full bg-foreground px-5 py-3">
              <Text className="text-xs font-semibold uppercase tracking-[1.5px] text-background">Sign In</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background px-6 pt-20">
      <Text className="text-[34px] font-semibold text-foreground">Account</Text>
      <Text className="mt-2 text-sm text-foreground/70">Signed in and ready for ordering.</Text>

      <View className="mt-6 rounded-2xl border border-foreground/15 bg-white px-4 py-4">
        <Text className="text-xs uppercase tracking-[1.5px] text-foreground/60">User ID</Text>
        <Text className="mt-2 text-sm text-foreground">{session?.userId ?? "Unknown"}</Text>
      </View>

      <Pressable
        className="mt-4 rounded-full border border-foreground px-6 py-4"
        onPress={() => {
          signOut();
          router.replace("/(tabs)/home");
        }}
      >
        <Text className="text-center text-xs font-semibold uppercase tracking-[2px] text-foreground">
          Sign Out
        </Text>
      </Pressable>
    </View>
  );
}
