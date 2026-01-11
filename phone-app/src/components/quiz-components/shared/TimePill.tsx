/**
 * Time display pill component showing remaining time with clock icon
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Iconify } from "react-native-iconify";
import { useTheme } from "@/src/theme";
import { fmtClock } from "@/src/lib/attempt-helpers";

type TimePillProps = {
  /** Remaining time in seconds */
  seconds: number;
};

export function TimePill({ seconds }: TimePillProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.timePill,
        { backgroundColor: colors.bg2, borderColor: colors.bg3 },
      ]}
    >
      <Iconify icon="mingcute:time-line" size={18} color={colors.icon} />
      <Text style={[styles.timePillText, { color: colors.textPrimary }]}>
        {fmtClock(seconds)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  timePill: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  timePillText: {
    fontSize: 15,
    fontWeight: "900",
  },
});
