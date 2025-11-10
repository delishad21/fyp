import { useTheme } from "@/src/theme";
import React from "react";
import { Pressable, StyleSheet } from "react-native";
import { Iconify } from "react-native-iconify";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ThemeToggle() {
  const { scheme, setScheme, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const next = scheme === "dark" ? "light" : "dark";

  return (
    <Pressable
      onPress={() => setScheme(next)}
      style={[styles.btn, { backgroundColor: colors.bg3, top: insets.top + 8 }]}
      accessibilityRole="button"
      accessibilityLabel="Toggle theme"
    >
      {scheme === "dark" ? (
        <Iconify icon="mingcute:sun-line" size={20} color={colors.icon} />
      ) : (
        <Iconify icon="mingcute:moon-line" size={20} color={colors.icon} />
      )}
    </Pressable>
  );
}
const styles = StyleSheet.create({
  btn: {
    position: "absolute",
    right: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
});
