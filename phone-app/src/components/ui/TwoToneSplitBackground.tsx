import React from "react";
import { StyleSheet, View } from "react-native";

export default function TwoToneSplitBackground({
  topHeight,
  topColor,
  bottomColor,
}: {
  topHeight: number;
  topColor: string;
  bottomColor: string;
}) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={{ height: topHeight, backgroundColor: topColor }} />
      <View style={{ flex: 1, backgroundColor: bottomColor }} />
    </View>
  );
}
