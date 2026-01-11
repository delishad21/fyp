import { useTheme } from "@/src/theme";
import { router, type Href } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";

type Variant = "primary" | "ghost" | "error" | "small";

type ButtonProps = {
  children: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
  disabled?: boolean;
  loading?: boolean;
  variant?: Variant; // default: primary (solid bg)
  onPress?: () => void;
  title?: string;
  href?: Href; // if set, we push() on press
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
};

export default function Button({
  children,
  style,
  textStyle,
  disabled = false,
  loading = false,
  variant = "primary",
  onPress,
  title,
  href,
  leftIcon,
  rightIcon,
}: ButtonProps) {
  const { colors } = useTheme();
  const { container, label, ripple, spinner } = resolveVariant(variant, colors);
  const isDisabled = disabled || loading;

  function handlePress() {
    if (href) router.push(href);
    else onPress?.();
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={isDisabled}
      onPress={handlePress}
      android_ripple={
        Platform.OS === "android"
          ? { color: ripple, foreground: true }
          : undefined
      }
      style={({ pressed }) => [
        styles.base,
        container, // <-- solid bg comes from here
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <View style={styles.row}>
          <ActivityIndicator size="small" color={spinner} />
          <View style={{ width: 8 }} />
          <Text style={[styles.label, label, textStyle]}>Loading…</Text>
        </View>
      ) : (
        <View style={styles.row}>
          {leftIcon ? <View style={styles.icon}>{leftIcon}</View> : null}
          <Text style={[styles.label, label, textStyle]}>{children}</Text>
          {rightIcon ? <View style={styles.icon}>{rightIcon}</View> : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 6,
    paddingVertical: 15,
    paddingHorizontal: 20,
    overflow: "hidden", // ensures Android ripple clips and bg paints cleanly
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  icon: { marginRight: 8 },
  label: { fontSize: 14, fontWeight: "600", textAlign: "center" },
  pressed: { opacity: 0.94 },
  disabled: { opacity: 0.6 },
});

function resolveVariant(
  variant: Variant,
  colors: {
    textPrimary: string;
    textSecondary: string;
    bg1: string;
    bg2: string;
    bg3: string;
    bg4: string;
    primary: string;
    primaryLight: string;
    primaryDark: string;
    error: string;
    success: string;
    warning: string;
  }
): { container: ViewStyle; label: TextStyle; ripple: string; spinner: string } {
  if (variant === "ghost") {
    return {
      container: {
        backgroundColor: colors.bg2,
        borderWidth: 1,
        borderColor: colors.bg4,
      },
      label: { color: colors.textPrimary, fontWeight: "600" },
      ripple: "rgba(0,0,0,0.08)",
      spinner: colors.textPrimary,
    };
  }
  if (variant === "error") {
    return {
      container: { backgroundColor: colors.error },
      label: { color: "#fff" },
      ripple: "rgba(255,255,255,0.2)",
      spinner: "#fff",
    };
  }
  if (variant === "small") {
    return {
      container: {
        backgroundColor: colors.bg3,
        paddingVertical: 8,
        paddingHorizontal: 12,
      },
      label: { color: colors.textPrimary, fontSize: 12, fontWeight: "500" },
      ripple: "rgba(0,0,0,0.08)",
      spinner: colors.textPrimary,
    };
  }
  // default primary: solid brand bg + white text
  return {
    container: { backgroundColor: colors.primary },
    label: { color: "#fff" },
    ripple: "rgba(255,255,255,0.2)",
    spinner: "#fff",
  };
}
