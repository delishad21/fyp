import { useTheme } from "@/src/theme";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function LeaderboardScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.bg1,
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 24,
        },
      ]}
    >
      {/* Title */}
      <Text style={[styles.title, { color: colors.textPrimary }]}>
        Leaderboard
      </Text>

      {/* Subtitle */}
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        See how you stack up against your classmates
      </Text>

      {/* WIP Card */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.bg2,
            borderColor: colors.bg4,
          },
        ]}
      >
        <Text style={[styles.wipTitle, { color: colors.textPrimary }]}>
          🚧 Work in progress
        </Text>
        <Text style={[styles.wipText, { color: colors.textSecondary }]}>
          The leaderboard is still being built. Check back soon!
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },

  title: {
    fontSize: 29,
    fontWeight: "900",
    marginBottom: 4,
  },

  subtitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 16,
  },

  card: {
    borderRadius: 5,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },

  wipTitle: {
    fontSize: 21,
    fontWeight: "900",
    marginBottom: 6,
  },

  wipText: {
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 21,
  },
});
