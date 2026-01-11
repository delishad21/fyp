import { useSession } from "@/src/auth/session";
import { useTheme } from "@/src/theme";
import { Link, router } from "expo-router";
import React, { useState } from "react";
import {
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Iconify } from "react-native-iconify";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AvatarOrInitials from "../ui/AvatarOrInitials";
import TwoToneSplitBackground from "../ui/TwoToneSplitBackground";

export default function ProfileScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = getStyles(colors);

  const [splitY, setSplitY] = useState<number | null>(null);
  const defaultSplit = Math.round(Dimensions.get("window").height * 0.45);

  const logout = useSession((s) => s.logout);
  const account = useSession((s) => s.account);

  const displayName = account?.name || "Student";
  const email = (account as any)?.email || null;

  async function onLogout() {
    await logout();
    router.replace("/");
  }

  return (
    <View style={styles.container}>
      <TwoToneSplitBackground
        topHeight={splitY ?? defaultSplit}
        topColor={colors.bg1}
        bottomColor={colors.bg3}
      />

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 16,
          paddingBottom: Math.max(insets.bottom + 24, 32),
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topArea}>
          <View style={styles.headerRow}>
            <View style={{ flexShrink: 1, paddingRight: 12 }}>
              <Text style={styles.pageTitle}>Profile</Text>
              <Text style={styles.pageSubtitle}>Account and preferences</Text>
            </View>
            <AvatarOrInitials
              uri={(account as any)?.photoUrl}
              name={displayName}
              size={48}
              bgFallback={colors.bg3}
              borderWidth={StyleSheet.hairlineWidth}
              borderColor={colors.bg4}
            />
          </View>

          <View
            style={styles.profileCard}
            onLayout={(e) => {
              const { y, height } = e.nativeEvent.layout;
              setSplitY(Math.max(0, Math.round(insets.top + y + height / 2)));
            }}
          >
            <View style={styles.profileRow}>
              <AvatarOrInitials
                uri={(account as any)?.photoUrl}
                name={displayName}
                size={60}
                bgFallback={colors.bg3}
                borderWidth={StyleSheet.hairlineWidth}
                borderColor={colors.bg4}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={styles.name}>
                  {displayName}
                </Text>
                <Text numberOfLines={1} style={styles.sub}>
                  {email ?? "Student account"}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.bottomArea}>
          <Text style={styles.sectionTitle}>Account</Text>

          <Pressable
            onPress={() => router.push("/(main)/(tabs)/settings")}
            style={({ pressed }) => [
              styles.tile,
              { opacity: pressed ? 0.92 : 1 },
            ]}
          >
            <View style={styles.tileLeft}>
              <View style={styles.tileIconWrap}>
                <Iconify
                  icon="mingcute:settings-2-line"
                  size={18}
                  color={colors.icon}
                />
              </View>
              <View style={{ gap: 2, flex: 1, minWidth: 0 }}>
                <Text style={styles.tileTitle}>Settings</Text>
                <Text numberOfLines={1} style={styles.tileSubtitle}>
                  Theme, preferences, and more
                </Text>
              </View>
            </View>

            <View style={{ flexShrink: 0 }}>
              <Iconify
                icon="mingcute:right-line"
                size={20}
                color={colors.textSecondary}
                style={{ opacity: 0.9 }}
              />
            </View>
          </Pressable>

          <Pressable
            onPress={() =>
              router.push({ pathname: "/(main)/change-password", params: { requireCurrent: "1" } })
            }
            style={({ pressed }) => [
              styles.tile,
              { opacity: pressed ? 0.92 : 1 },
            ]}
          >
            <View style={styles.tileLeft}>
              <View style={styles.tileIconWrap}>
                <Iconify
                  icon="mingcute:lock-line"
                  size={18}
                  color={colors.icon}
                />
              </View>
              <View style={{ gap: 2, flex: 1, minWidth: 0 }}>
                <Text style={styles.tileTitle}>Change password</Text>
                <Text numberOfLines={1} style={styles.tileSubtitle}>
                  Re-enter your password to update it
                </Text>
              </View>
            </View>

            <View style={{ flexShrink: 0 }}>
              <Iconify
                icon="mingcute:right-line"
                size={20}
                color={colors.textSecondary}
                style={{ opacity: 0.9 }}
              />
            </View>
          </Pressable>

          <Pressable
            onPress={onLogout}
            style={({ pressed }) => [
              styles.logoutBtn,
              { opacity: pressed ? 0.92 : 1 },
            ]}
          >
            <Iconify icon="mingcute:exit-line" size={18} color={colors.error} />
            <Text style={styles.logoutTxt}>Log out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1 },

    topArea: {
      paddingHorizontal: 16,
      paddingBottom: 12,
    },
    bottomArea: {
      paddingTop: 12,
      paddingHorizontal: 16,
      gap: 12,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
    },

    pageTitle: {
      fontSize: 28,
      fontWeight: "900",
      color: colors.textPrimary,
    },
    pageSubtitle: {
      fontSize: 18,
      fontWeight: "700",
      marginTop: 2,
      color: colors.textSecondary,
    },

    sectionTitle: {
      fontSize: 13,
      fontWeight: "900",
      letterSpacing: 0.8,
      marginTop: 2,
      color: colors.textSecondary,
    },

    profileCard: {
      borderRadius: 5,
      padding: 16,
      borderWidth: StyleSheet.hairlineWidth,
      backgroundColor: colors.bg2,
      borderColor: colors.bg4,
      shadowOpacity: 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      elevation: Platform.select({ android: 2, ios: 0 }),
      shadowColor: "#000",
    },
    profileRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    name: {
      fontSize: 20,
      fontWeight: "900",
      letterSpacing: 0.2,
      color: colors.textPrimary,
    },
    sub: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.textSecondary,
    },

    tile: {
      borderRadius: 5,
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.bg2,
      borderColor: colors.bg4,
    },
    tileLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      flex: 1,
      minWidth: 0,
    },
    tileIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 5,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth,
      backgroundColor: colors.bg3,
      borderColor: colors.bg4,
    },
    tileTitle: {
      fontSize: 15,
      fontWeight: "900",
      color: colors.textPrimary,
    },
    tileSubtitle: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textSecondary,
    },

    logoutBtn: {
      height: 44,
      borderRadius: 5,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      backgroundColor: colors.bg2,
      borderColor: colors.bg4,
    },
    logoutTxt: {
      fontSize: 15,
      fontWeight: "900",
      color: colors.error,
    },
  });
