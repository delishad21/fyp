import ThemeToggle from "@/src/components/ui/ThemeToggle";
import { useTheme } from "@/src/theme";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

export default function SettingsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.bg1 }}
      edges={["top", "left", "right"]} // top/side insets handled by SafeAreaView
    >
      <View
        style={[
          styles.container,
          {
            backgroundColor: colors.bg1,
            // give the bottom a bit more room for home indicator
            paddingBottom: Math.max(16, insets.bottom + 8),
          },
        ]}
      >
        <Text
          style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 18 }}
        >
          Settings
        </Text>

        {/* Floating toggle — it already respects safe area via its own insets */}
        <ThemeToggle />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    position: "relative",
  },
});
