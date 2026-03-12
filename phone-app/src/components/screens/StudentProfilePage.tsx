import { useEntranceAnimation } from "@/src/hooks/useEntranceAnimation";
import { googlePalette } from "@/src/theme/google-palette";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  ViewStyle,
  View,
} from "react-native";
import { Iconify } from "react-native-iconify";
import { SvgUri } from "react-native-svg";
import AvatarOrInitials from "../ui/AvatarOrInitials";

function isSvgUrl(url?: string | null) {
  const value = String(url || "");
  return value.startsWith("data:image/svg+xml") || /\.svg(?:\?|$)/i.test(value);
}

function FullAvatarPreview({
  uri,
  name,
  style,
}: {
  uri?: string | null;
  name: string;
  style?: StyleProp<ViewStyle>;
}) {
  const [failed, setFailed] = useState(false);
  const safeUri = String(uri || "");

  return (
    <View style={style}>
      {!safeUri || failed ? (
        <View style={stylesForAvatar.fallbackWrap}>
          <AvatarOrInitials
            uri={null}
            name={name}
            size={120}
            bgFallback="transparent"
            borderWidth={0}
          />
        </View>
      ) : (
        <>
          {isSvgUrl(safeUri) ? (
            <SvgUri
              uri={safeUri}
              width="100%"
              height="100%"
              onError={() => setFailed(true)}
            />
          ) : (
            <Image
              source={{ uri: safeUri }}
              style={stylesForAvatar.fill}
              resizeMode="contain"
              onError={() => setFailed(true)}
            />
          )}
        </>
      )}
    </View>
  );
}

const stylesForAvatar = StyleSheet.create({
  fill: {
    width: "100%",
    height: "100%",
  },
  fallbackWrap: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
});

export type StudentProfileAction = {
  key: string;
  label: string;
  icon: string;
  onPress: () => void;
  tone?: "default" | "danger";
};

function renderActionIcon(icon: string, color: string) {
  switch (icon) {
    case "mingcute:paint-2-line":
      return <Iconify icon="mingcute:paint-2-line" size={17} color={color} />;
    case "mingcute:award-line":
      return <Iconify icon="mingcute:award-line" size={17} color={color} />;
    case "mingcute:lock-line":
      return <Iconify icon="mingcute:lock-line" size={17} color={color} />;
    case "mingcute:exit-line":
      return <Iconify icon="mingcute:exit-line" size={17} color={color} />;
    case "mingcute:settings-2-line":
      return <Iconify icon="mingcute:settings-2-line" size={17} color={color} />;
    case "mingcute:sun-line":
      return <Iconify icon="mingcute:sun-line" size={17} color={color} />;
    case "mingcute:moon-line":
      return <Iconify icon="mingcute:moon-line" size={17} color={color} />;
    default:
      return <Iconify icon="mingcute:right-line" size={17} color={color} />;
  }
}

type Props = {
  colors: any;
  insets: {
    top: number;
    bottom: number;
  };
  headerTitle: string;
  displayName: string;
  subtitle?: string | null;
  avatarUrl?: string | null;
  loading: boolean;
  error?: string | null;
  onBack: () => void;
  showBack?: boolean;
  tabMode?: boolean;
  navAccentColor?: string | null;
  rank: number | null;
  overallScore: number;
  currentStreak: number;
  bestStreakDays: number;
  participationPct: number;
  avgScorePct: number;
  equippedSummary: string;
  badges: Array<{
    id: string;
    name: string;
    description?: string | null;
    imageUrl?: string | null;
    engraving?: string | null;
  }>;
  actions?: StudentProfileAction[];
};

export default function StudentProfilePage({
  colors,
  insets,
  headerTitle,
  displayName,
  subtitle,
  avatarUrl,
  loading,
  error,
  onBack,
  showBack = true,
  tabMode = false,
  navAccentColor = null,
  rank,
  overallScore,
  currentStreak,
  bestStreakDays,
  participationPct,
  avgScorePct,
  equippedSummary,
  badges,
  actions = [],
}: Props) {
  const styles = useMemo(() => getStyles(colors), [colors]);
  const contentMotion = useEntranceAnimation({
    delayMs: 40,
    fromY: 18,
    durationMs: 290,
  });
  const customizeAction = actions.find((a) => a.key === "customize-avatar");
  const manageBadgesAction = actions.find((a) => a.key === "badge-inventory");
  const trailingActions = actions.filter(
    (a) => a.key !== "customize-avatar" && a.key !== "badge-inventory"
  );
  const kpiPalette = [
    googlePalette.red,
    googlePalette.blue,
    googlePalette.green,
    googlePalette.yellow,
  ] as const;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg1 }]}>
      {tabMode ? (
        <View style={[styles.tabTopWrap, { paddingTop: insets.top + 16 }]}>
          <Text
            style={[
              styles.tabTopTitle,
              { color: navAccentColor || colors.textPrimary },
            ]}
          >
            {headerTitle}
          </Text>
        </View>
      ) : (
        <View
          style={[
            styles.headerRow,
            { paddingTop: insets.top + 12, borderBottomColor: colors.bg4 },
          ]}
        >
          {showBack ? (
            <Pressable
              onPress={onBack}
              style={({ pressed }) => [
                styles.backBtn,
                {
                  opacity: pressed ? 0.9 : 1,
                  backgroundColor: colors.bg2,
                  borderColor: colors.bg4,
                },
              ]}
            >
              <Iconify
                icon="mingcute:arrow-left-line"
                size={18}
                color={colors.icon}
              />
            </Pressable>
          ) : (
            <View style={styles.headerSpacer} />
          )}
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            {headerTitle}
          </Text>
          <View style={styles.headerSpacer} />
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centerPad}>
          <Text style={[styles.errorTitle, { color: colors.error }]}>
            Could not load profile
          </Text>
          <Text style={[styles.errorBody, { color: colors.textSecondary }]}>
            {error}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: insets.bottom + 24,
          }}
        >
          <Animated.View style={[styles.scrollContent, contentMotion]}>
            <View
              style={[
                styles.heroCard,
                {
                  backgroundColor: colors.bg2,
                  borderColor: colors.bg4,
                },
              ]}
            >
            <View style={styles.heroAvatarWrap}>
              <FullAvatarPreview
                uri={avatarUrl || null}
                name={displayName}
                style={styles.heroAvatarCanvas}
              />
              {customizeAction ? (
                <Pressable
                  onPress={customizeAction.onPress}
                  style={({ pressed }) => [
                    styles.heroCustomizeBtn,
                    {
                      opacity: pressed ? 0.94 : 1,
                      borderColor: colors.bg4,
                      backgroundColor: colors.bg2,
                    },
                  ]}
                >
                  <Iconify
                    icon="mingcute:paint-2-line"
                    size={16}
                    color={colors.icon}
                  />
                  <Text
                    style={[
                      styles.heroCustomizeTxt,
                      { color: colors.textPrimary },
                    ]}
                  >
                    Customize Avatar
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.heroMeta}>
              <Text style={[styles.name, { color: colors.textPrimary }]}>
                {displayName}
              </Text>
              {subtitle ? (
                <Text style={[styles.sub, { color: colors.textSecondary }]}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.kpiGrid}>
            <View
              style={[
                styles.kpiCard,
                { backgroundColor: kpiPalette[0], borderColor: kpiPalette[0] },
              ]}
            >
              <Text style={[styles.kpiLabel, { color: googlePalette.white }]}>
                Rank
              </Text>
              <Text style={[styles.kpiValue, { color: googlePalette.white }]}>
                {rank != null ? `#${rank}` : "-"}
              </Text>
            </View>
            <View
              style={[
                styles.kpiCard,
                { backgroundColor: kpiPalette[1], borderColor: kpiPalette[1] },
              ]}
            >
              <Text style={[styles.kpiLabel, { color: googlePalette.white }]}>
                Overall Score
              </Text>
              <Text style={[styles.kpiValue, { color: googlePalette.white }]}>
                {Math.round(overallScore || 0)}
              </Text>
            </View>
            <View
              style={[
                styles.kpiCard,
                { backgroundColor: kpiPalette[2], borderColor: kpiPalette[2] },
              ]}
            >
              <Text style={[styles.kpiLabel, { color: googlePalette.white }]}>
                Current Streak
              </Text>
              <Text style={[styles.kpiValue, { color: googlePalette.white }]}>
                {Math.round(currentStreak || 0)}
              </Text>
            </View>
            <View
              style={[
                styles.kpiCard,
                { backgroundColor: kpiPalette[3], borderColor: kpiPalette[3] },
              ]}
            >
              <Text style={[styles.kpiLabel, { color: "#1F1F1F" }]}>
                Best Streak
              </Text>
              <Text style={[styles.kpiValue, { color: "#1F1F1F" }]}>
                {Math.round(bestStreakDays || 0)}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.bg2,
                borderColor: colors.bg4,
              },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Badges
            </Text>
            {badges.length ? (
              <View style={styles.badgeWrap}>
                {badges.map((badge) => (
                  <View key={badge.id} style={styles.badgeItem}>
                    {badge.imageUrl ? (
                      isSvgUrl(badge.imageUrl) ? (
                        <SvgUri uri={badge.imageUrl} width={120} height={120} />
                      ) : (
                        <Image
                          source={{ uri: badge.imageUrl }}
                          style={styles.badgeImage}
                          resizeMode="contain"
                        />
                      )
                    ) : (
                      <Iconify
                        icon="mingcute:award-line"
                        size={56}
                        color={colors.icon}
                      />
                    )}
                    <Text
                      numberOfLines={2}
                      style={[styles.badgeName, { color: colors.textPrimary }]}
                    >
                      {badge.name}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={[styles.rowText, { color: colors.textSecondary }]}>
                No badges yet.
              </Text>
            )}

            {manageBadgesAction ? (
              <Pressable
                onPress={manageBadgesAction.onPress}
                style={({ pressed }) => [
                  styles.actionBtn,
                  styles.badgesActionBtn,
                  {
                    opacity: pressed ? 0.92 : 1,
                    borderColor: colors.bg4,
                    backgroundColor: colors.bg2,
                  },
                ]}
              >
                <View style={styles.actionLeft}>
                  {renderActionIcon(manageBadgesAction.icon, colors.icon)}
                  <Text
                    style={[styles.actionTxt, { color: colors.textPrimary }]}
                  >
                    {manageBadgesAction.label}
                  </Text>
                </View>
                <Iconify
                  icon="mingcute:right-line"
                  size={18}
                  color={colors.textSecondary}
                />
              </Pressable>
            ) : null}
          </View>

            {trailingActions.length ? (
              <View style={styles.actionList}>
              {trailingActions.map((action) => {
                const danger = action.tone === "danger";
                return (
                  <Pressable
                    key={action.key}
                    onPress={action.onPress}
                    style={({ pressed }) => [
                      styles.actionBtn,
                      {
                        opacity: pressed ? 0.92 : 1,
                        borderColor: danger ? googlePalette.red : colors.bg4,
                        backgroundColor: danger
                          ? googlePalette.red
                          : colors.bg2,
                      },
                    ]}
                  >
                    <View style={styles.actionLeft}>
                      {renderActionIcon(
                        action.icon,
                        danger ? googlePalette.white : colors.icon
                      )}
                      <Text
                        style={[
                          styles.actionTxt,
                          {
                            color: danger ? googlePalette.white : colors.textPrimary,
                          },
                        ]}
                      >
                        {action.label}
                      </Text>
                    </View>
                    {!danger ? (
                      <Iconify
                        icon="mingcute:right-line"
                        size={18}
                        color={colors.textSecondary}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
              </View>
            ) : null}
          </Animated.View>
        </ScrollView>
      )}
    </View>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1 },

    headerRow: {
      paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingBottom: 10,
    },
    backBtn: {
      width: 34,
      height: 34,
      borderRadius: 8,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: "900",
    },
    headerSpacer: { width: 34 },
    tabTopWrap: {
      paddingHorizontal: 16,
      paddingBottom: 12,
    },
    tabTopTitle: {
      fontSize: 31,
      fontWeight: "900",
    },

    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    centerPad: {
      paddingHorizontal: 16,
      paddingTop: 24,
    },
    scrollContent: {
      gap: 12,
    },

    errorTitle: {
      fontSize: 18,
      fontWeight: "900",
      marginBottom: 6,
    },
    errorBody: {
      fontSize: 16,
      fontWeight: "600",
      lineHeight: 20,
    },

    heroCard: {
      borderRadius: 12,
      borderWidth: 1,
      overflow: "hidden",
    },
    heroTint: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: 110,
    },
    heroAvatarWrap: {
      width: "100%",
      aspectRatio: 1,
      position: "relative",
      backgroundColor: "transparent",
    },
    heroAvatarCanvas: {
      width: "100%",
      height: "100%",
      backgroundColor: "transparent",
    },
    heroMeta: {
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 2,
      alignItems: "center",
    },
    heroCustomizeBtn: {
      position: "absolute",
      right: 10,
      top: 10,
      borderRadius: 8,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 9,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    heroCustomizeTxt: {
      fontSize: 14,
      fontWeight: "900",
    },
    name: {
      fontSize: 34,
      fontWeight: "900",
      textAlign: "center",
    },
    sub: {
      fontSize: 24,
      fontWeight: "700",
      textAlign: "center",
    },

    kpiGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    kpiCard: {
      width: "48.5%",
      borderRadius: 9,
      borderWidth: 1,
      padding: 12,
      minHeight: 120,
      position: "relative",
      alignItems: "center",
      justifyContent: "center",
    },
    kpiLabel: {
      fontSize: 12,
      fontWeight: "800",
      position: "absolute",
      top: 10,
      left: 12,
    },
    kpiValue: {
      fontSize: 44,
      fontWeight: "900",
      textAlign: "center",
      lineHeight: 48,
    },

    card: {
      borderRadius: 10,
      borderWidth: 1,
      padding: 14,
      gap: 8,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: "900",
      marginBottom: 2,
    },
    rowText: {
      fontSize: 15,
      fontWeight: "600",
      lineHeight: 20,
    },

    badgeWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginTop: 2,
    },
    badgeItem: {
      width: "48.5%",
      paddingHorizontal: 4,
      paddingVertical: 6,
      alignItems: "center",
      gap: 6,
    },
    badgeImage: {
      width: 120,
      height: 120,
    },
    badgeName: {
      fontSize: 13,
      fontWeight: "800",
      textAlign: "center",
      minHeight: 34,
    },

    actionList: {
      gap: 10,
    },
    badgesActionBtn: {
      marginTop: 8,
    },
    actionBtn: {
      borderRadius: 9,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    actionLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    actionTxt: {
      fontSize: 15,
      fontWeight: "900",
    },
  });
