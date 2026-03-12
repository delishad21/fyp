/**
 * Shared header component for quiz play screens
 * Displays quiz title, optional back button, and optional time pill
 */

import React from "react";
import { Keyboard, Pressable, StyleSheet, Text, View } from "react-native";
import { Iconify } from "react-native-iconify";
import { useTheme } from "@/src/theme";
import { googlePalette } from "@/src/theme/google-palette";
import { hexToRgba } from "@/src/lib/color-utils";
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
  /** Title alignment within header */
  titleAlign?: "left" | "center";
};

export function QuizHeader({
  title,
  showBackButton = false,
  onBack,
  remaining,
  paddingTop = 6,
  dismissKeyboardOnTitlePress = showBackButton,
  titleAlign = "left",
}: QuizHeaderProps) {
  const { colors } = useTheme();
  const centerTitle = titleAlign === "center";

  return (
    <View
      style={[
        styles.header,
        {
          paddingTop,
          borderBottomColor: hexToRgba(googlePalette.blue, 0.28),
          backgroundColor: colors.bg1,
        },
      ]}
    >
      {centerTitle ? (
        <View style={styles.sideSlot}>
          {showBackButton ? (
            <Pressable
              onPress={onBack}
              style={({ pressed }) => [
                styles.backBtn,
                {
                  backgroundColor: "transparent",
                  borderColor: googlePalette.blue,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Iconify
                icon="mingcute:arrow-left-line"
                size={23}
                color={googlePalette.blue}
              />
            </Pressable>
          ) : null}
        </View>
      ) : showBackButton ? (
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [
            styles.backBtn,
            {
              backgroundColor: "transparent",
              borderColor: googlePalette.blue,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Iconify
            icon="mingcute:arrow-left-line"
            size={23}
            color={googlePalette.blue}
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
          alignItems: centerTitle ? "center" : showBackButton ? undefined : "flex-start",
        }}
      >
        <Text
          numberOfLines={1}
          style={[
            styles.title,
            {
              color: showBackButton ? googlePalette.blue : colors.textPrimary,
              textAlign: centerTitle ? "center" : "left",
            },
          ]}
        >
          {title}
        </Text>
      </Pressable>

      {centerTitle ? (
        <View style={[styles.sideSlot, styles.sideSlotRight]}>
          {remaining !== null && remaining !== undefined ? (
            <TimePill seconds={remaining} />
          ) : showBackButton ? (
            <View style={{ width: 84 }} />
          ) : null}
        </View>
      ) : remaining !== null && remaining !== undefined ? (
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
    borderRadius: 4,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sideSlot: {
    width: 84,
    justifyContent: "center",
  },
  sideSlotRight: {
    alignItems: "flex-end",
  },
  title: {
    fontWeight: "900",
    fontSize: 21,
    letterSpacing: 0.2,
  },
});
