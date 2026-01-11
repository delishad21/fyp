import { useTheme } from "@/src/theme";
import React from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Iconify } from "react-native-iconify";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ThemeToggleProps = {
  variant?: "floating" | "inline";
  style?: StyleProp<ViewStyle>;
  /** Optionally override press handler; defaults to toggling theme */
  onPress?: () => void;
};

export default function ThemeToggle({
  variant = "floating",
  style,
  onPress,
}: ThemeToggleProps) {
  const { scheme, setScheme, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const next = scheme === "dark" ? "light" : "dark";

  if (variant === "inline") {
    return (
      <Pressable
        onPress={() => (onPress ? onPress() : setScheme(next))}
        style={[styles.inlineWrap, style]}
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

  return (
    <Pressable
      onPress={() => (onPress ? onPress() : setScheme(next))}
      style={[
        styles.btn,
        { backgroundColor: colors.bg3, top: insets.top + 8 },
        style,
      ]}
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
  inlineWrap: {
    width: 38,
    height: 38,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
});
