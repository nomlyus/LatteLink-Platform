import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { HomeNewsCard, MenuResponse, MobileExperienceDocument } from "@lattelink/contracts-catalog";
import { Button, GlassCard, uiPalette, uiTypography } from "../ui/system";
import { HomeNewsTag } from "./HomeNewsTag";

type HomeSectionsProps = {
  homeSections: MobileExperienceDocument["screens"][number]["sections"];
  homeNewsCards: HomeNewsCard[];
  menu: MenuResponse | undefined;
  brandName: string;
  locationName: string;
  handleExperienceAction: (action: "open_menu" | "open_orders" | "open_account") => void;
};

export function HomeSections({
  homeSections,
  homeNewsCards,
  menu,
  brandName,
  locationName,
  handleExperienceAction
}: HomeSectionsProps) {
  return (
    <View style={styles.cardGrid}>
      {(homeSections.length > 0
        ? homeSections
        : [{ id: "news-cards", type: "news_cards", visible: true, cardLimit: 4 } as const]
      ).map((section) => {
        if (section.type === "hero") {
          return (
            <GlassCard
              key={section.id}
              style={styles.experienceHeroCard}
              contentStyle={styles.experienceHeroCardContent}
            >
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.experienceEyebrow}>
                Featured
              </Text>
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.experienceHeroTitle}>
                {section.title ?? brandName}
              </Text>
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.experienceHeroBody}>
                {section.subtitle ?? locationName}
              </Text>
              <Button
                label={section.actionLabel ?? "Order now"}
                variant="primary"
                onPress={() => handleExperienceAction(section.action ?? "open_menu")}
                style={styles.experienceHeroButton}
              />
            </GlassCard>
          );
        }

        if (section.type === "quick_actions") {
          const actions = section.actions ?? ["open_menu", "open_orders", "open_account"];
          return (
            <View key={section.id} style={styles.quickActions}>
              {actions.map((action) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    action === "open_menu" ? "Open menu" : action === "open_orders" ? "Open orders" : "Open account"
                  }
                  key={action}
                  onPress={() => handleExperienceAction(action)}
                  style={styles.quickActionButton}
                >
                  <Ionicons
                    name={
                      action === "open_menu"
                        ? "cafe-outline"
                        : action === "open_orders"
                          ? "receipt-outline"
                          : "person-outline"
                    }
                    size={18}
                    color={uiPalette.text}
                  />
                  <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.quickActionText}>
                    {action === "open_menu" ? "Menu" : action === "open_orders" ? "Orders" : "Account"}
                  </Text>
                </Pressable>
              ))}
            </View>
          );
        }

        if (section.type === "featured_menu") {
          const limit = section.itemLimit ?? 4;
          const items =
            (section.categoryId
              ? menu?.categories.find((category) => category.id === section.categoryId)?.items
              : menu?.categories.flatMap((category) => category.items)) ?? [];
          const featuredItems = items.slice(0, limit);
          if (featuredItems.length === 0) {
            return null;
          }

          return (
            <View key={section.id} style={styles.featuredMenuSection}>
              <View style={styles.sectionTitleRow}>
                <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.sectionTitle}>
                  {section.title ?? "Popular today"}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open menu"
                  onPress={() => handleExperienceAction("open_menu")}
                  style={styles.sectionLink}
                >
                  <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.sectionLinkText}>
                    Menu
                  </Text>
                  <Ionicons name="chevron-forward" size={15} color={uiPalette.primary} />
                </Pressable>
              </View>
              <View style={styles.featuredMenuGrid}>
                {featuredItems.map((item) => (
                  <GlassCard
                    key={item.id}
                    style={styles.featuredMenuCard}
                    contentStyle={styles.featuredMenuCardContent}
                  >
                    <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.featuredMenuName}>
                      {item.name}
                    </Text>
                    <Text
                      allowFontScaling={false}
                      maxFontSizeMultiplier={1}
                      numberOfLines={2}
                      style={styles.featuredMenuDescription}
                    >
                      {item.description}
                    </Text>
                  </GlassCard>
                ))}
              </View>
            </View>
          );
        }

        const limit = section.type === "news_cards" ? (section.cardLimit ?? 4) : 4;
        return homeNewsCards.slice(0, limit).map((item) => (
          <GlassCard key={`${section.id}-${item.cardId}`} style={styles.newsCard} contentStyle={styles.newsCardContent}>
            <View style={styles.newsCardHeader}>
              <HomeNewsTag label={item.label} />
            </View>

            <View style={styles.newsCopy}>
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.newsTitle}>
                {item.title}
              </Text>
              <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.newsBody}>
                {item.body}
              </Text>
            </View>

            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.newsNote}>
              {item.note}
            </Text>
          </GlassCard>
        ));
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  cardGrid: {
    paddingTop: 12,
    gap: 14
  },
  experienceHeroCard: {
    width: "100%",
    minHeight: 176
  },
  experienceHeroCardContent: {
    minHeight: 176,
    justifyContent: "space-between",
    gap: 12
  },
  experienceEyebrow: {
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: uiPalette.textMuted,
    fontWeight: "700"
  },
  experienceHeroTitle: {
    fontSize: 30,
    lineHeight: 34,
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "600"
  },
  experienceHeroBody: {
    fontSize: 15,
    lineHeight: 22,
    color: uiPalette.textSecondary
  },
  experienceHeroButton: {
    alignSelf: "flex-start",
    marginTop: 2
  },
  quickActions: {
    flexDirection: "row",
    gap: 10
  },
  quickActionButton: {
    flex: 1,
    minHeight: 58,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(18, 22, 28, 0.1)",
    backgroundColor: "rgba(255,255,255,0.58)",
    alignItems: "center",
    justifyContent: "center",
    gap: 5
  },
  quickActionText: {
    fontSize: 12,
    lineHeight: 15,
    color: uiPalette.text,
    fontWeight: "700"
  },
  featuredMenuSection: {
    gap: 10
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 2
  },
  sectionTitle: {
    flex: 1,
    fontSize: 20,
    lineHeight: 24,
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "600"
  },
  sectionLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2
  },
  sectionLinkText: {
    fontSize: 13,
    lineHeight: 16,
    color: uiPalette.primary,
    fontWeight: "700"
  },
  featuredMenuGrid: {
    gap: 10
  },
  featuredMenuCard: {
    width: "100%"
  },
  featuredMenuCardContent: {
    gap: 5
  },
  featuredMenuName: {
    fontSize: 17,
    lineHeight: 21,
    color: uiPalette.text,
    fontWeight: "700"
  },
  featuredMenuDescription: {
    fontSize: 13,
    lineHeight: 18,
    color: uiPalette.textSecondary
  },
  newsCard: {
    width: "100%",
    minHeight: 142
  },
  newsCardContent: {
    minHeight: 142,
    justifyContent: "space-between",
    gap: 14
  },
  newsCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  newsCopy: {
    gap: 6
  },
  newsTitle: {
    fontSize: 24,
    lineHeight: 28,
    color: uiPalette.text,
    fontFamily: uiTypography.displayFamily,
    fontWeight: "600",
    letterSpacing: -0.5
  },
  newsBody: {
    fontSize: 15,
    lineHeight: 22,
    color: uiPalette.textSecondary
  },
  newsNote: {
    fontSize: 13,
    lineHeight: 18,
    color: uiPalette.textMuted,
    fontWeight: "500"
  }
});
