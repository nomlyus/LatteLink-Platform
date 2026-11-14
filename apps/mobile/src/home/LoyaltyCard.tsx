import { Image, StyleSheet, Text, View } from "react-native";
import rawaqLogo from "../../assets/rawaq-logo.png";
import { uiPalette, uiTypography } from "../ui/system";
import { brandColors } from "../ui/brandColors";

type LoyaltyCardProps = {
  customerName: string;
  memberSince?: string;
};

export function LoyaltyCard({ customerName, memberSince }: LoyaltyCardProps) {
  const joinedAt = memberSince ? new Date(memberSince) : null;
  const membershipYear = joinedAt && Number.isFinite(joinedAt.getTime()) ? joinedAt.getUTCFullYear() : null;

  return (
    <View style={styles.card}>
      <View pointerEvents="none" style={styles.logoContainer}>
        <Image
          source={rawaqLogo}
          accessibilityLabel="Rawaq"
          resizeMode="contain"
          style={styles.logo}
        />
      </View>
      <View style={styles.heading}>
        {membershipYear !== null ? (
          <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.established}>
            MEMBER SINCE {membershipYear}
          </Text>
        ) : null}
      </View>
      <Text allowFontScaling={false} maxFontSizeMultiplier={1} numberOfLines={1} style={styles.established}>
        {customerName}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    maxWidth: 480,
    aspectRatio: 1.586,
    alignSelf: "center",
    justifyContent: "space-between",
    padding: 26,
    borderRadius: 20,
    backgroundColor: brandColors.forest,
    borderWidth: 1,
    borderColor: uiPalette.border
  },
  logoContainer: { ...StyleSheet.absoluteFill, justifyContent: "center", alignItems: "center" },
  // Set both dimensions so the bundled PNG's intrinsic height cannot control layout.
  logo: { width: 155, height: 155 * (1351 / 2560), tintColor: "#F7F4ED" },
  heading: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center" },
  established: {
    fontFamily: uiTypography.monoFamily,
    fontSize: 11,
    letterSpacing: 1.1,
    color: "rgba(247, 244, 237, 0.7)"
  }
});
