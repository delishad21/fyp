import { useTheme } from "@/src/theme";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
export default function LeaderboardScreen() {
  const { colors } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: colors.bg1 }]}>
      <Text style={{ color: colors.textPrimary, fontWeight: "700" }}>
        Leaderboard
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({ container: { flex: 1, padding: 16 } });
