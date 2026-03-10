import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
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
  const customizeAction = actions.find((a) => a.key === "customize-avatar");
  const trailingActions = actions.filter((a) => a.key !== "customize-avatar");

  return (
    <View style={[styles.container, { backgroundColor: colors.bg1 }]}>
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
            <Iconify icon="mingcute:left-line" size={18} color={colors.icon} />
          </Pressable>
        ) : (
          <View style={styles.headerSpacer} />
        )}
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          {headerTitle}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

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
            gap: 12,
          }}
        >
          <View
            style={[
              styles.heroCard,
              { backgroundColor: colors.bg2, borderColor: colors.bg4 },
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
                      opacity: pressed ? 0.92 : 1,
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
                { backgroundColor: colors.bg2, borderColor: colors.bg4 },
              ]}
            >
              <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>
                Rank
              </Text>
              <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>
                {rank != null ? `#${rank}` : "-"}
              </Text>
            </View>
            <View
              style={[
                styles.kpiCard,
                { backgroundColor: colors.bg2, borderColor: colors.bg4 },
              ]}
            >
              <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>
                Overall Score
              </Text>
              <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>
                {Math.round(overallScore || 0)}
              </Text>
            </View>
            <View
              style={[
                styles.kpiCard,
                { backgroundColor: colors.bg2, borderColor: colors.bg4 },
              ]}
            >
              <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>
                Current Streak
              </Text>
              <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>
                {Math.round(currentStreak || 0)}
              </Text>
            </View>
            <View
              style={[
                styles.kpiCard,
                { backgroundColor: colors.bg2, borderColor: colors.bg4 },
              ]}
            >
              <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>
                Best Streak
              </Text>
              <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>
                {Math.round(bestStreakDays || 0)}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.card,
              { backgroundColor: colors.bg2, borderColor: colors.bg4 },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Badges
            </Text>
            {badges.length ? (
              <View style={styles.badgeWrap}>
                {badges.map((badge) => (
                  <View
                    key={badge.id}
                    style={[
                      styles.badgeCard,
                      { borderColor: colors.bg4, backgroundColor: "transparent" },
                    ]}
                  >
                    <View
                      style={[
                        styles.badgeImageWrap,
                        { backgroundColor: "transparent", borderColor: colors.bg4 },
                      ]}
                    >
                      {badge.imageUrl ? (
                        isSvgUrl(badge.imageUrl) ? (
                          <SvgUri uri={badge.imageUrl} width={88} height={88} />
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
                          size={36}
                          color={colors.icon}
                        />
                      )}
                    </View>
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
                        borderColor: danger ? colors.error : colors.bg4,
                        backgroundColor: colors.bg2,
                      },
                    ]}
                  >
                    <View style={styles.actionLeft}>
                      {renderActionIcon(
                        action.icon,
                        danger ? colors.error : colors.icon
                      )}
                      <Text
                        style={[
                          styles.actionTxt,
                          { color: danger ? colors.error : colors.textPrimary },
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
      borderRadius: 5,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: "900",
    },
    headerSpacer: { width: 34 },

    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    centerPad: {
      paddingHorizontal: 16,
      paddingTop: 24,
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
      borderRadius: 5,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: "hidden",
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
    },
    heroCustomizeBtn: {
      position: "absolute",
      right: 10,
      top: 10,
      borderRadius: 5,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 12,
      paddingVertical: 9,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      shadowOpacity: 0.08,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
      shadowColor: "#000",
    },
    heroCustomizeTxt: {
      fontSize: 14,
      fontWeight: "900",
    },
    name: {
      fontSize: 30,
      fontWeight: "900",
    },
    sub: {
      fontSize: 20,
      fontWeight: "700",
    },

    kpiGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    kpiCard: {
      width: "48.5%",
      borderRadius: 5,
      borderWidth: StyleSheet.hairlineWidth,
      padding: 12,
    },
    kpiLabel: {
      fontSize: 12,
      fontWeight: "800",
      marginBottom: 6,
    },
    kpiValue: {
      fontSize: 22,
      fontWeight: "900",
    },

    card: {
      borderRadius: 5,
      borderWidth: StyleSheet.hairlineWidth,
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
    badgeCard: {
      width: "48.5%",
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 10,
      paddingVertical: 10,
      alignItems: "center",
      gap: 6,
    },
    badgeImageWrap: {
      width: 96,
      height: 96,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: "center",
      justifyContent: "center",
    },
    badgeImage: {
      width: 88,
      height: 88,
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
    actionBtn: {
      borderRadius: 5,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 14,
      paddingVertical: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      shadowOpacity: 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
      shadowColor: "#000",
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
