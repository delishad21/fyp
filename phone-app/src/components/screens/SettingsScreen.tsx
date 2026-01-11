import ThemeToggle from "@/src/components/ui/ThemeToggle";
import { useTheme } from "@/src/theme";
import { router } from "expo-router";
import React from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Iconify } from "react-native-iconify";

export default function SettingsScreen() {
  const { colors, scheme, setScheme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = getStyles(colors);
  const next = scheme === "dark" ? "light" : "dark";

  return (
    <View style={[styles.container, { backgroundColor: colors.bg1 }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 16,
          paddingBottom: Math.max(insets.bottom + 24, 32),
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topArea}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backBtn,
              { opacity: pressed ? 0.85 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Iconify
              icon="mingcute:arrow-left-line"
              size={20}
              color={colors.icon}
            />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <Text style={styles.pageTitle}>Settings</Text>
          <Text style={styles.pageSubtitle}>Theme and preferences</Text>
        </View>

        <View style={styles.bottomArea}>
          <Text style={styles.sectionTitle}>Appearance</Text>

          <Pressable
            onPress={() => setScheme(next)}
            style={({ pressed }) => [
              styles.tile,
              { opacity: pressed ? 0.92 : 1 },
            ]}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.tileTitle}>Dark mode</Text>
              <Text numberOfLines={1} style={styles.tileSubtitle}>
                Toggle app theme
              </Text>
            </View>
            <ThemeToggle variant="inline" />
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
      gap: 6,
    },
    bottomArea: {
      paddingTop: 12,
      paddingHorizontal: 16,
      gap: 12,
    },

    pageTitle: {
      fontSize: 28,
      fontWeight: "900",
      color: colors.textPrimary,
    },
    backBtn: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 4,
      paddingHorizontal: 4,
    },
    backText: {
      fontSize: 14,
      fontWeight: "800",
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
      shadowOpacity: 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      elevation: Platform.select({ android: 2, ios: 0 }),
      shadowColor: "#000",
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
  });
