/**
 * Multiple choice options list component
 * Supports both single-select and multi-select modes
 */

import React from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/src/theme";

type Option = {
  id: string;
  text: string;
};

type OptionsListProps = {
  /** Array of options to display */
  options: Option[];
  /** Array of selected option IDs */
  selected: string[];
  /** Callback when an option is selected */
  onSelect: (optionId: string) => void;
  /** Whether interaction is disabled */
  disabled?: boolean;
  /** Enable multi-select mode (default: false) */
  multiSelect?: boolean;
  /** Maximum height constraint for the list */
  maxHeight?: number;
  /** Optional note to display above options (e.g., "Select all that apply") */
  note?: string;
};

export function OptionsList({
  options,
  selected,
  onSelect,
  disabled = false,
  multiSelect = false,
  maxHeight,
  note,
}: OptionsListProps) {
  const { colors } = useTheme();

  return (
    <View style={maxHeight ? { maxHeight } : undefined}>
      {note && multiSelect ? (
        <Text style={[styles.note, { color: colors.textSecondary }]}>
          {note}
        </Text>
      ) : null}

      <FlatList
        data={options}
        keyExtractor={(option) => option.id}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: 10,
        }}
        renderItem={({ item: option }) => {
          const isSelected = selected.includes(option.id);
          return (
            <Pressable
              disabled={disabled}
              onPress={() => onSelect(option.id)}
              style={({ pressed }) => [
                styles.option,
                {
                  backgroundColor: isSelected ? colors.primary : colors.bg2,
                  borderColor: colors.bg3,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.optionText,
                  { color: isSelected ? "#fff" : colors.textPrimary },
                ]}
              >
                {option.text}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    paddingHorizontal: 16,
    marginBottom: 6,
    fontSize: 14,
    fontWeight: "800",
  },
  option: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  optionText: {
    fontSize: 16,
    fontWeight: "900",
  },
});
