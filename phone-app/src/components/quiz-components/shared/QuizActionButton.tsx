/**
 * Primary action button for quiz screens
 * Used for "Next", "Finish", "Confirm", etc.
 */

import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { useTheme } from "@/src/theme";

type QuizActionButtonProps = {
  /** Button label text */
  label: string;
  /** Callback when button is pressed */
  onPress: () => void;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Whether to show loading spinner */
  loading?: boolean;
  /** Minimum width override */
  minWidth?: number;
  /** Background color override (uses theme primary by default) */
  backgroundColor?: string;
};

export function QuizActionButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  minWidth = 120,
  backgroundColor,
}: QuizActionButtonProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryBtn,
        {
          backgroundColor: backgroundColor ?? colors.primary,
          opacity: pressed ? 0.9 : 1,
          minWidth,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <Text style={styles.primaryBtnText}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  primaryBtn: {
    paddingHorizontal: 18,
    height: 42,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 15,
  },
});
