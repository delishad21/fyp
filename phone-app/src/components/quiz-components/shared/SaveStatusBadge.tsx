/**
 * Save status indicator badge
 * Shows "Saving...", "Saved", or "Save failed" with appropriate styling
 */

import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/src/theme";

type SaveStatus = "idle" | "saving" | "error";

type SaveStatusBadgeProps = {
  /** Current save status */
  status: SaveStatus;
};

export function SaveStatusBadge({ status }: SaveStatusBadgeProps) {
  const { colors } = useTheme();

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      {status === "saving" ? (
        <ActivityIndicator size="small" color={colors.textSecondary} />
      ) : null}

      <Text
        style={[
          styles.saveBadge,
          {
            color:
              status === "saving"
                ? colors.textSecondary
                : status === "error"
                ? colors.error
                : colors.textSecondary,
          },
        ]}
      >
        {status === "saving"
          ? "Saving…"
          : status === "error"
          ? "Save failed"
          : "Saved"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  saveBadge: {
    fontSize: 14,
    fontWeight: "800",
  },
});
