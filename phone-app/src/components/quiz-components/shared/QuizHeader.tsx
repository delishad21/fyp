/**
 * Shared header component for quiz play screens
 * Displays quiz title, optional back button, and optional time pill
 */

import React from "react";
import { Keyboard, Pressable, StyleSheet, Text, View } from "react-native";
import { Iconify } from "react-native-iconify";
import { useTheme } from "@/src/theme";
import { TimePill } from "./TimePill";

type QuizHeaderProps = {
  /** Quiz title to display */
  title: string;
  /** Whether to show the back button (default: false) */
  showBackButton?: boolean;
  /** Callback when back button is pressed */
  onBack?: () => void;
  /** Remaining time in seconds (null/undefined to hide timer) */
  remaining?: number | null;
  /** Top padding (e.g., safe area insets) */
  paddingTop?: number;
  /** Whether the title area dismisses keyboard on press (default: true for screens with back button) */
  dismissKeyboardOnTitlePress?: boolean;
};

export function QuizHeader({
  title,
  showBackButton = false,
  onBack,
  remaining,
  paddingTop = 6,
  dismissKeyboardOnTitlePress = showBackButton,
}: QuizHeaderProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.header,
        {
          paddingTop,
          borderBottomColor: colors.bg2,
          backgroundColor: colors.bg1,
        },
      ]}
    >
      {showBackButton ? (
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [
            styles.backBtn,
            {
              backgroundColor: colors.bg2,
              borderColor: colors.bg3,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Iconify
            icon="mingcute:arrow-left-line"
            size={23}
            color={colors.icon}
          />
        </Pressable>
      ) : null}

      <Pressable
        onPress={dismissKeyboardOnTitlePress ? () => Keyboard.dismiss() : undefined}
        disabled={!dismissKeyboardOnTitlePress}
        style={{
          flex: 1,
          minWidth: 0,
          paddingHorizontal: showBackButton ? 10 : 0,
          alignItems: showBackButton ? undefined : "flex-start",
        }}
      >
        <Text
          numberOfLines={1}
          style={[styles.title, { color: colors.textPrimary }]}
        >
          {title}
        </Text>
      </Pressable>

      {remaining !== null && remaining !== undefined ? (
        <TimePill seconds={remaining} />
      ) : showBackButton ? (
        <View style={{ width: 84 }} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 90,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    height: 42,
    width: 42,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontWeight: "900",
    fontSize: 21,
    letterSpacing: 0.2,
  },
});
