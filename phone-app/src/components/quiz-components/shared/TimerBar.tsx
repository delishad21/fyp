/**
 * Visual timer bar component showing progress/time remaining
 */

import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "@/src/theme";

type TimerBarProps = {
  /** Percentage remaining (0-1), or null to hide the bar */
  percent: number | null;
};

export function TimerBar({ percent }: TimerBarProps) {
  const { colors } = useTheme();

  if (percent === null) return null;

  return (
    <View style={{ paddingHorizontal: 12, paddingTop: 10 }}>
      <View
        style={[
          styles.timerBarTrack,
          { backgroundColor: colors.bg2, borderColor: colors.bg3 },
        ]}
      >
        <View
          style={[
            styles.timerBarFill,
            {
              width: `${Math.max(0, Math.min(100, percent * 100))}%`,
              backgroundColor: colors.primary,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  timerBarTrack: {
    height: 10,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  timerBarFill: {
    height: "100%",
    borderRadius: 5,
  },
});
