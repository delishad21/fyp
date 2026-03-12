/**
 * Time display pill component showing remaining time with clock icon
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Iconify } from "react-native-iconify";
import { fmtClock } from "@/src/lib/attempt-helpers";
import { googlePalette } from "@/src/theme/google-palette";

type TimePillProps = {
  /** Remaining time in seconds */
  seconds: number;
};

export function TimePill({ seconds }: TimePillProps) {
  return (
    <View
      style={[
        styles.timePill,
        {
          backgroundColor: googlePalette.red,
          borderColor: googlePalette.red,
        },
      ]}
    >
      <Iconify icon="mingcute:time-line" size={18} color="#fff" />
      <Text style={[styles.timePillText, { color: "#fff" }]}>
        {fmtClock(seconds)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  timePill: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 4,
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
