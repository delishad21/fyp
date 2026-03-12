/**
 * Visual timer bar component showing progress/time remaining
 */

import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "@/src/theme";
import { googlePalette } from "@/src/theme/google-palette";
import { hexToRgba } from "@/src/lib/color-utils";

type TimerBarProps = {
  /** Percentage remaining (0-1), or null to hide the bar */
  percent: number | null;
  /** Render only the track/fill (for inline row layouts) */
  inline?: boolean;
};

export function TimerBar({ percent, inline = false }: TimerBarProps) {
  const { colors } = useTheme();

  if (percent === null) return null;
  const clamped = Math.max(0, Math.min(1, percent));
  const fillColor =
    clamped > 0.66
      ? googlePalette.green
      : clamped > 0.33
      ? googlePalette.yellow
      : googlePalette.red;

  const track = (
    <View
      style={[
        styles.timerBarTrack,
        inline ? styles.timerBarTrackInline : null,
        {
          backgroundColor: hexToRgba(googlePalette.blue, 0.12),
          borderColor: googlePalette.blue,
        },
      ]}
    >
      <View
        style={[
          styles.timerBarFill,
          {
            width: `${Math.max(0, Math.min(100, clamped * 100))}%`,
            backgroundColor: fillColor,
          },
        ]}
      />
    </View>
  );

  if (inline) return track;

  return <View style={{ paddingHorizontal: 12, paddingTop: 10 }}>{track}</View>;
}

const styles = StyleSheet.create({
  timerBarTrack: {
    height: 10,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  timerBarTrackInline: {
    flex: 1,
  },
  timerBarFill: {
    height: "100%",
    borderRadius: 4,
  },
});
